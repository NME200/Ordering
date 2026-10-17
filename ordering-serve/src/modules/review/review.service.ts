import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { requireMerchantScope, resolveMerchantScope, resolveStoreScope } from '../../common/utils/tenant.util';
import { REVIEW_POINT } from '../../shared/enums/customer.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { OrderStatus } from '../../shared/enums/order-status.enum';
import { MemberService } from '../customer/member.service';
import { Customer } from '../customer/entities/customer.entity';
import { Order } from '../order/entities/order.entity';
import { Review } from './entities/review.entity';
import { CreateReviewDto, QueryReviewDto, ReplyReviewDto, ReviewDto } from './dto/review.dto';

/**
 * 评价服务。
 *
 * 「已完成 + 未评价」这条规则由两处共同保证：应用层查一次给准确报错，
 * 数据库 `uk_review_order` 再挡一次并发。只有应用层检查的话，
 * 连点两次提交会插进两行，并送出两次积分。
 */
@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly memberService: MemberService,
  ) {}

  /** 顾客提交评价 */
  async create(customerId: number, dto: CreateReviewDto): Promise<ReviewDto> {
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId, customerId },
    });
    if (!order) {
      throw BusinessException.badRequest(ErrorCode.REVIEW_ORDER_INVALID, '订单不存在或不属于你');
    }
    if (order.status !== OrderStatus.COMPLETED) {
      throw BusinessException.badRequest(
        ErrorCode.REVIEW_ORDER_INVALID,
        '订单完成后才能评价',
      );
    }

    const existed = await this.reviewRepository.findOne({ where: { orderId: order.id } });
    if (existed) {
      throw BusinessException.conflict(ErrorCode.REVIEW_ALREADY_EXISTS, '这笔订单已经评价过了');
    }

    const review = await this.reviewRepository.save(
      this.reviewRepository.create({
        customerId,
        orderId: order.id,
        orderNo: order.orderNo,
        merchantId: order.merchantId,
        storeId: order.storeId,
        rating: dto.rating,
        tags: dto.tags?.slice(0, 6) ?? [],
        content: dto.content?.trim() || null,
        images: dto.images?.slice(0, 6) ?? [],
        anonymous: dto.anonymous ? 1 : 0,
      }),
    );

    // 赠分失败不能把评价本身回滚掉：评价已经落库，顾客不该看到「提交失败」
    let awarded = 0;
    try {
      awarded = await this.memberService.awardReviewPoint(
        customerId,
        order.merchantId,
        order.id,
        REVIEW_POINT,
        order.diningType,
      );
      if (awarded > 0) {
        review.pointAwarded = awarded;
        await this.reviewRepository.save(review);
      }
    } catch {
      // 交给下一次对账，评价不该因为积分故障而丢失
    }

    return this.toDto(review, await this.customerName(customerId), review.anonymous === 1);
  }

  /** 我的评价列表 */
  async listMine(customerId: number, limit = 50): Promise<ReviewDto[]> {
    const rows = await this.reviewRepository.find({
      where: { customerId },
      order: { id: 'DESC' },
      take: limit,
    });
    const names = await this.namesByIds(rows.map((row) => row.customerId));
    return rows.map((row) => this.toDto(row, names.get(row.customerId) ?? '顾客', row.anonymous === 1));
  }

  /** 商户 / 平台侧评价列表 */
  async paginateForStaff(
    query: QueryReviewDto,
    currentUser: AuthUser,
  ): Promise<PaginatedDto<ReviewDto>> {
    const merchantId = resolveMerchantScope(currentUser, query.merchantId);
    const storeId = resolveStoreScope(currentUser, query.storeId);

    const qb = this.reviewRepository.createQueryBuilder('review');
    if (merchantId !== null) {
      qb.andWhere('review.merchant_id = :merchantId', { merchantId });
    }
    if (storeId !== null) {
      qb.andWhere('review.store_id = :storeId', { storeId });
    }
    if (query.rating !== undefined) {
      qb.andWhere('review.rating = :rating', { rating: query.rating });
    }
    if (query.unrepliedOnly === 1) {
      qb.andWhere('review.reply_content IS NULL');
    }

    qb.orderBy('review.id', 'DESC').skip(query.skip).take(query.pageSize);
    const [rows, total] = await qb.getManyAndCount();
    const names = await this.namesByIds(rows.map((row) => row.customerId));

    return PaginatedDto.from({
      list: rows.map((row) =>
        this.toDto(row, names.get(row.customerId) ?? '顾客', row.anonymous === 1),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 商家回复评价 */
  async reply(id: number, dto: ReplyReviewDto, currentUser: AuthUser): Promise<ReviewDto> {
    const merchantId = requireMerchantScope(currentUser);
    const review = await this.reviewRepository.findOne({ where: { id, merchantId } });
    if (!review) {
      throw BusinessException.notFound(ErrorCode.REVIEW_NOT_FOUND, '评价不存在');
    }

    review.replyContent = dto.content.trim();
    review.repliedAt = new Date();
    review.repliedBy = currentUser.userId;
    const saved = await this.reviewRepository.save(review);
    const names = await this.namesByIds([saved.customerId]);
    return this.toDto(saved, names.get(saved.customerId) ?? '顾客', saved.anonymous === 1);
  }

  /** 某商户/门店的评分概览（平均分 + 条数）。门店列表要显示评分就靠它 */
  async summary(merchantId: number, storeId?: number): Promise<{ avg: number; total: number }> {
    const qb = this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avg')
      .addSelect('COUNT(*)', 'total')
      .where('review.merchant_id = :merchantId', { merchantId });
    if (storeId !== undefined) {
      qb.andWhere('review.store_id = :storeId', { storeId });
    }
    const row = await qb.getRawOne<{ avg: string | null; total: string }>();
    return {
      avg: row?.avg ? Math.round(Number(row.avg) * 10) / 10 : 0,
      total: Number(row?.total ?? 0),
    };
  }

  // ==================== 内部辅助 ====================

  private async customerName(customerId: number): Promise<string> {
    const names = await this.namesByIds([customerId]);
    return names.get(customerId) ?? '顾客';
  }

  private async namesByIds(customerIds: number[]): Promise<Map<number, string>> {
    const ids = [...new Set(customerIds)];
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.customerRepository.find({ where: { id: In(ids) } });
    return new Map(
      rows.map((row) => [row.id, row.nickname?.trim() || `食客${String(row.id).slice(-4)}`]),
    );
  }

  /**
   * 匿名评价的昵称在服务端就打码。
   *
   * 留原文给前端去遮，等于把「匿名」变成一个可以被绕过的展示开关 ——
   * 商户侧界面只要少写一行代码，顾客的昵称就露出去了。
   */
  private toDto(review: Review, name: string, anonymous: boolean): ReviewDto {
    const dto = new ReviewDto();
    dto.id = review.id;
    dto.orderId = review.orderId;
    dto.orderNo = review.orderNo;
    dto.storeId = review.storeId;
    dto.rating = review.rating;
    dto.tags = review.tags ?? [];
    dto.content = review.content;
    dto.images = review.images ?? [];
    dto.anonymous = review.anonymous === 1;
    dto.customerName = anonymous ? `${name.slice(0, 1)}**` : name;
    dto.pointAwarded = review.pointAwarded;
    dto.replyContent = review.replyContent;
    dto.repliedAt = review.repliedAt;
    dto.createdAt = review.createdAt;
    return dto;
  }
}
