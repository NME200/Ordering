import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';

import {
  COUPON_TYPE_LABELS,
  CouponScene,
  CouponTemplateStatus,
  CustomerCouponStatus,
  CouponType,
  MAX_COUPON_DISCOUNT_CENT,
} from '../../shared/enums/coupon.enum';
import { CouponTab } from '../../shared/enums/coupon.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import {
  COUPON_VALUE_CAP,
  CouponCenterItemDto,
  CouponTemplateDto,
  CustomerCouponDto,
  QueryCouponTemplateDto,
  QueryMyCouponDto,
  UpsertCouponTemplateDto,
} from './dto/coupon.dto';
import { CouponTemplate } from './entities/coupon-template.entity';
import { CustomerCoupon } from './entities/customer-coupon.entity';
import { Customer } from '../customer/entities/customer.entity';

/** 券的可计算形状：模板与持有券都满足它 */
interface CouponFace {
  type: CouponType;
  value: number;
  threshold: number;
  maxDiscount: number | null;
}

/**
 * 优惠券服务。
 *
 * 三处必须小心的地方：
 * 1. **库存扣减**用带条件的 UPDATE（`received_count < total_count`）而不是先读再写，
 *    否则两个人同时抢最后一张会都成功；
 * 2. **占用态**：下单时把券锁成 LOCKED、支付成功才转 USED、取消回退 UNUSED。
 *    没有这一态，同一张券能同时挂在三笔待支付订单上；
 * 3. **抵扣不能把订单抵成 0**：本项目订单必须实付 > 0（见 OrderService 的金额校验），
 *    所以抵扣上限是「订单金额 - 1 分」。宁可让顾客再付一分钱，
 *    也不能出现 0 元单 —— 0 元单在现有支付链路里无法推进。
 */
@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(CouponTemplate)
    private readonly templateRepository: Repository<CouponTemplate>,
    @InjectRepository(CustomerCoupon)
    private readonly couponRepository: Repository<CustomerCoupon>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly dataSource: DataSource,
  ) {}

  // ==================== 文案与算价 ====================

  /** 券面大字：「¥5」/「8折」 */
  faceValue(face: CouponFace): string {
    return face.type === CouponType.DISCOUNT
      ? `${(face.value / 10).toFixed(1).replace(/\.0$/, '')}折`
      : `¥${(face.value / 100).toFixed(face.value % 100 === 0 ? 0 : 2)}`;
  }

  /** 门槛文案 */
  thresholdText(face: CouponFace): string {
    return face.threshold > 0 ? `满${(face.threshold / 100).toFixed(0)}可用` : '全场通用';
  }

  /**
   * 本单可抵扣金额（分）。
   *
   * 折扣券的抵扣额按**订单总额**算，再受 maxDiscount 限制：
   * 「8 折 + 最多抵 10 元」是常见配法，不封顶就是 500 元的单直接减 100。
   */
  calcDiscount(face: CouponFace, totalAmount: number): number {
    if (totalAmount < face.threshold) {
      return 0;
    }
    const raw =
      face.type === CouponType.DISCOUNT
        ? Math.round((totalAmount * (100 - face.value)) / 100)
        : face.value;
    const capped = Math.min(raw, face.maxDiscount ?? raw, MAX_COUPON_DISCOUNT_CENT);
    // 至少留 1 分应付，保证订单能进支付链路
    return Math.max(0, Math.min(capped, totalAmount - 1));
  }

  // ==================== 商户 / 平台侧 ====================

  /**
   * 新建券模板。
   *
   * `merchantId` 只有平台侧能显式指定（留空 = 平台券，全场通用）；
   * 商户侧由控制器强制覆写成 Token 里的商户，前端传什么都不认。
   */
  async createTemplate(
    dto: UpsertCouponTemplateDto,
    merchantId: number | null,
  ): Promise<CouponTemplateDto> {
    this.assertTemplateShape(dto);
    const template = await this.templateRepository.save(
      this.templateRepository.create({
        ...this.toTemplateFields(dto),
        merchantId,
        receivedCount: 0,
        status: dto.status ?? CouponTemplateStatus.OFFLINE,
      }),
    );
    return this.toTemplateDto(template);
  }

  async updateTemplate(
    id: number,
    dto: UpsertCouponTemplateDto,
    merchantId: number | null,
  ): Promise<CouponTemplateDto> {
    const template = await this.findTemplateOrFail(id, merchantId);
    this.assertTemplateShape(dto);

    Object.assign(template, this.toTemplateFields(dto));
    if (dto.status !== undefined) {
      template.status = dto.status as CouponTemplateStatus;
    }
    return this.toTemplateDto(await this.templateRepository.save(template));
  }

  /** 上下架。下架不动已发出的券 —— 那是顾客资产 */
  async changeTemplateStatus(
    id: number,
    status: CouponTemplateStatus,
    merchantId: number | null,
  ): Promise<CouponTemplateDto> {
    const template = await this.findTemplateOrFail(id, merchantId);
    template.status = status as unknown as CouponTemplateStatus;
    return this.toTemplateDto(await this.templateRepository.save(template));
  }

  /**
   * 删除模板。
   *
   * 已有人领过就不许删：持有券上虽然有快照，但「券列表点不开来源模板」
   * 会让客服无法解释这张券是哪来的。要停就下架。
   */
  async removeTemplate(id: number, merchantId: number | null): Promise<void> {
    const template = await this.findTemplateOrFail(id, merchantId);
    const received = await this.couponRepository.count({ where: { templateId: template.id } });
    if (received > 0) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_NOT_USABLE,
        `已有 ${received} 位顾客领取，不能删除，请改为下架`,
      );
    }
    await this.templateRepository.softDelete({ id: template.id });
  }

  async paginateTemplates(
    query: QueryCouponTemplateDto,
    merchantId: number | null,
  ): Promise<PaginatedDto<CouponTemplateDto>> {
    const where: FindOptionsWhere<CouponTemplate> = {};
    if (merchantId !== null) {
      where.merchantId = merchantId;
    } else if (query.merchantId !== undefined) {
      where.merchantId = query.merchantId;
    } else if (query.platformOnly === 1) {
      where.merchantId = IsNull();
    }
    if (query.scene !== undefined) {
      where.scene = query.scene;
    }
    if (query.status !== undefined) {
      where.status = query.status as unknown as CouponTemplateStatus;
    }

    const [rows, total] = await this.templateRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: query.skip,
      take: query.pageSize,
    });

    return PaginatedDto.from({
      list: rows.map((row) => this.toTemplateDto(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 发放记录（商户侧看某张券发给了谁、用没用） */
  async paginateIssued(
    templateId: number,
    merchantId: number | null,
    page: number,
    pageSize: number,
  ): Promise<PaginatedDto<CustomerCouponDto>> {
    await this.findTemplateOrFail(templateId, merchantId);
    const [rows, total] = await this.couponRepository.findAndCount({
      where: { templateId },
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return PaginatedDto.from({
      list: rows.map((row) => this.toCustomerCouponDto(row, null)),
      total,
      page,
      pageSize,
    });
  }

  // ==================== 顾客侧 ====================

  /**
   * 领券中心。
   *
   * 只出 `scene = normal` 且当前商户可用的券（平台券 merchantId 为 NULL，全场通用）。
   * 每张券都带「我还能不能领」和原因 —— 列表里的灰按钮必须由服务端解释，
   * 否则前端只能靠猜，顾客点了才知道领不了。
   */
  async centerList(customerId: number, merchantId: number): Promise<CouponCenterItemDto[]> {
    const templates = await this.templateRepository.find({
      where: {
        scene: CouponScene.NORMAL,
        status: CouponTemplateStatus.ONLINE,
      },
      order: { id: 'DESC' },
      take: 50,
    });
    const usable = templates.filter(
      (template) => template.merchantId === null || template.merchantId === merchantId,
    );
    if (usable.length === 0) {
      return [];
    }

    const mine = await this.couponRepository.find({
      where: { customerId, templateId: In(usable.map((template) => template.id)) },
    });
    const countByTemplate = new Map<number, number>();
    for (const coupon of mine) {
      countByTemplate.set(coupon.templateId, (countByTemplate.get(coupon.templateId) ?? 0) + 1);
    }

    return usable.map((template) => {
      const received = countByTemplate.get(template.id) ?? 0;
      const soldOut = template.totalCount > 0 && template.receivedCount >= template.totalCount;
      const overLimit = received >= template.perLimit;
      const item = new CouponCenterItemDto();
      item.id = template.id;
      item.name = template.name;
      item.type = template.type;
      item.value = template.value;
      item.threshold = template.threshold;
      item.maxDiscount = template.maxDiscount;
      item.faceValue = this.faceValue(template);
      item.thresholdText = this.thresholdText(template);
      item.description = template.description;
      item.expireAt = this.resolveExpireAt(template, new Date());
      item.receivable = !soldOut && !overLimit;
      item.reason = soldOut ? '已领完' : overLimit ? '已达领取上限' : null;
      item.receivedByMe = received;
      return item;
    });
  }

  /** 领券 */
  async receive(customerId: number, templateId: number): Promise<CustomerCouponDto> {
    const template = await this.templateRepository.findOne({ where: { id: templateId } });
    if (!template || template.status !== CouponTemplateStatus.ONLINE) {
      throw BusinessException.notFound(ErrorCode.COUPON_TEMPLATE_NOT_FOUND, '优惠券不存在或已下架');
    }
    if (template.scene !== CouponScene.NORMAL) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_NOT_RECEIVABLE,
        `${COUPON_TYPE_LABELS[template.type]}由系统自动发放，不能手动领取`,
      );
    }

    const coupon = await this.issueOne(customerId, template);
    return this.toCustomerCouponDto(coupon, null);
  }

  /**
   * 自动发放（新客 / 生日）。
   *
   * 失败**不打断主流程**：注册时发券失败不该让顾客进不了小程序，
   * 调用方（CustomerService）会吞掉异常并记日志。
   */
  async autoIssue(
    customerId: number,
    merchantId: number,
    scene: CouponScene,
  ): Promise<CustomerCoupon[]> {
    const templates = await this.templateRepository.find({
      where: { scene, status: CouponTemplateStatus.ONLINE },
    });
    const matched = templates.filter(
      (template) => template.merchantId === null || template.merchantId === merchantId,
    );

    const issued: CustomerCoupon[] = [];
    for (const template of matched) {
      try {
        issued.push(await this.issueOne(customerId, template));
      } catch (error) {
        // 库存不足 / 超限都是正常结果，不抛
        if (!(error instanceof BusinessException)) {
          throw error;
        }
      }
    }
    return issued;
  }

  /**
   * 生日券领取。
   *
   * 判定放在服务端：小程序侧改一行代码就能把「生日当月」变成任意月份。
   * 每年一张靠「本年已领张数」比对，不额外建表。
   */
  async claimBirthdayCoupon(customerId: number, merchantId: number): Promise<CustomerCouponDto> {
    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    if (!customer?.birthday) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_NOT_RECEIVABLE,
        '请先在「我的资料」里填写生日',
      );
    }
    const month = Number(customer.birthday.slice(5, 7));
    const now = new Date();
    if (now.getMonth() + 1 !== month) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_NOT_RECEIVABLE,
        '生日券只在生日当月领取',
      );
    }

    const templates = await this.templateRepository.find({
      where: { scene: CouponScene.BIRTHDAY, status: CouponTemplateStatus.ONLINE },
    });
    const matched = templates.filter(
      (template) => template.merchantId === null || template.merchantId === merchantId,
    );
    if (matched.length === 0) {
      throw BusinessException.notFound(ErrorCode.COUPON_TEMPLATE_NOT_FOUND, '当前没有可领的生日券');
    }

    const yearStart = new Date(now.getFullYear(), 0, 1);
    let last: CustomerCoupon | null = null;
    for (const template of matched) {
      // 「本年已领」按自然年判定，而不是靠 perLimit：perLimit 是总量限领，
      // 生日券的语义是每年一张，用总量限制会变成领过一次就永远没了
      const yearly = await this.countReceivedSince(customerId, template.id, yearStart);
      if (yearly > 0) {
        continue;
      }
      last = await this.issueOne(customerId, template);
    }
    if (!last) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_LIMIT_EXCEEDED,
        '今年已经领过生日券了',
      );
    }
    return this.toCustomerCouponDto(last, null);
  }

  /** 我的优惠券（三页签） */
  async mineList(customerId: number, query: QueryMyCouponDto): Promise<CustomerCouponDto[]> {
    const tab: CouponTab = query.tab ?? 'unused';
    const now = new Date();
    const qb = this.couponRepository
      .createQueryBuilder('coupon')
      .where('coupon.customer_id = :customerId', { customerId })
      .orderBy('coupon.id', 'DESC')
      .take(100);

    if (tab === 'unused') {
      qb.andWhere('coupon.status IN (:...statuses)', {
        statuses: [CustomerCouponStatus.UNUSED, CustomerCouponStatus.LOCKED],
      }).andWhere('coupon.expire_at > :now', { now });
    } else if (tab === 'used') {
      qb.andWhere('coupon.status = :used', { used: CustomerCouponStatus.USED });
    } else {
      // 过期页签要把「状态还没刷成 expired 但时间已过」的券也算进来（读侧判活口径一致）
      qb.andWhere('coupon.status <> :used', { used: CustomerCouponStatus.USED }).andWhere(
        '(coupon.status = :expired OR coupon.expire_at <= :now)',
        { expired: CustomerCouponStatus.EXPIRED, now },
      );
    }

    if (query.merchantId !== undefined) {
      qb.andWhere('(coupon.merchant_id = :merchantId OR coupon.merchant_id IS NULL)', {
        merchantId: query.merchantId,
      });
    }

    const rows = await qb.getMany();
    return rows.map((row) => this.toCustomerCouponDto(row, query.merchantId ?? null));
  }

  /**
   * 下单选券页：列出可用与不可用（带原因）。
   *
   * 不可用的券也要返回而不是过滤掉 —— 顾客知道自己有 3 张券却只看到 1 张，
   * 会以为系统出 bug；看到「差 10 元可用」才知道该加购。
   */
  async usableForAmount(
    customerId: number,
    merchantId: number,
    totalAmount: number,
  ): Promise<CustomerCouponDto[]> {
    const now = new Date();
    const rows = await this.couponRepository.find({
      where: [
        {
          customerId,
          merchantId,
          status: In([CustomerCouponStatus.UNUSED, CustomerCouponStatus.LOCKED]),
        },
        { customerId, merchantId: IsNull(), status: In([CustomerCouponStatus.UNUSED]) },
      ],
      order: { id: 'DESC' },
      take: 100,
    });

    return rows
      .filter((row) => row.expireAt > now)
      .map((row) => {
        const discount = this.calcDiscount(row, totalAmount);
        const expired = row.expireAt <= now;
        const wrongMerchant = row.merchantId !== null && row.merchantId !== merchantId;
        const belowThreshold = totalAmount < row.threshold;
        const dto = this.toCustomerCouponDto(row, merchantId);
        dto.discountPreview = discount;
        dto.usable = !expired && !wrongMerchant && !belowThreshold && discount > 0;
        dto.unusableReason = expired
          ? '已过期'
          : wrongMerchant
            ? '不适用于当前门店'
            : belowThreshold
              ? `差 ${((row.threshold - totalAmount) / 100).toFixed(2)} 元可用`
              : discount <= 0
                ? '本单无可抵扣金额'
                : null;
        return dto;
      });
  }

  /** 可用券张数（「我的」页资产栏） */
  async countUsable(customerId: number, merchantId?: number): Promise<number> {
    const qb = this.couponRepository
      .createQueryBuilder('coupon')
      .where('coupon.customer_id = :customerId', { customerId })
      .andWhere('coupon.status = :status', { status: CustomerCouponStatus.UNUSED })
      .andWhere('coupon.expire_at > :now', { now: new Date() });
    if (merchantId !== undefined) {
      qb.andWhere('(coupon.merchant_id = :merchantId OR coupon.merchant_id IS NULL)', {
        merchantId,
      });
    }
    return qb.getCount();
  }

  /**
   * 下单时占用一张券，返回抵扣金额。
   *
   * 用条件 UPDATE 抢券：`WHERE status = unused` 只有一个人能改成 locked。
   * 先查后改在并发下必然双花 —— 两个请求都能读到 unused。
   */
  async lockForOrder(
    customerId: number,
    merchantId: number,
    couponId: number,
    totalAmount: number,
  ): Promise<{ coupon: CustomerCoupon; discountAmount: number }> {
    const coupon = await this.couponRepository.findOne({
      where: { id: couponId, customerId },
    });
    if (!coupon) {
      throw BusinessException.notFound(ErrorCode.CUSTOMER_COUPON_NOT_FOUND, '优惠券不存在');
    }
    if (coupon.merchantId !== null && coupon.merchantId !== merchantId) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_MERCHANT_MISMATCH,
        '这张券不适用于当前门店',
      );
    }
    if (coupon.expireAt <= new Date()) {
      throw BusinessException.badRequest(ErrorCode.COUPON_NOT_USABLE, '优惠券已过期');
    }
    if (totalAmount < coupon.threshold) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_THRESHOLD_NOT_MET,
        `订单需满 ${(coupon.threshold / 100).toFixed(2)} 元才能使用这张券`,
      );
    }
    const discountAmount = this.calcDiscount(coupon, totalAmount);
    if (discountAmount <= 0) {
      throw BusinessException.badRequest(ErrorCode.COUPON_NOT_USABLE, '本单无法使用该券抵扣');
    }

    const claimed = await this.couponRepository.update(
      { id: coupon.id, status: CustomerCouponStatus.UNUSED },
      { status: CustomerCouponStatus.LOCKED },
    );
    if (claimed.affected !== 1) {
      throw BusinessException.badRequest(ErrorCode.COUPON_NOT_USABLE, '这张券已被其他订单占用');
    }
    coupon.status = CustomerCouponStatus.LOCKED;
    return { coupon, discountAmount };
  }

  /** 释放占用的券（订单取消 / 下单失败） */
  async releaseByOrder(orderId: number): Promise<void> {
    const rows = await this.couponRepository.find({ where: { orderId } });
    const now = new Date();
    for (const row of rows) {
      // 释放时顺手判一次活期：占用期间过了有效期的券，回退成 unused 只会让顾客
      // 在可用列表里看到一张点不动的券
      row.status = row.expireAt <= now ? CustomerCouponStatus.EXPIRED : CustomerCouponStatus.UNUSED;
      row.orderId = null;
      await this.couponRepository.save(row);
    }
  }

  /** 回滚一次尚未落订单的占用（下单中途失败） */
  async releaseById(couponId: number): Promise<void> {
    await this.couponRepository.update(
      { id: couponId, status: CustomerCouponStatus.LOCKED },
      { status: CustomerCouponStatus.UNUSED },
    );
  }

  /** 订单落库成功后把券与订单绑定；此后核销 / 退回都按 orderId 找 */
  async attachOrder(couponId: number, orderId: number): Promise<void> {
    await this.couponRepository.update(
      { id: couponId, status: CustomerCouponStatus.LOCKED },
      { orderId },
    );
  }

  /** 支付成功：占用转核销 */
  async markUsedByOrder(orderId: number): Promise<void> {
    await this.couponRepository.update(
      { orderId, status: In([CustomerCouponStatus.LOCKED, CustomerCouponStatus.UNUSED]) },
      { status: CustomerCouponStatus.USED, usedAt: new Date() },
    );
  }

  /** 按订单查券 ID（订单详情展示「已用券」） */
  async findUsedByOrder(orderId: number): Promise<CustomerCoupon | null> {
    return this.couponRepository.findOne({ where: { orderId } });
  }

  // ==================== 内部辅助 ====================

  /**
   * 发一张券。库存与限领都在这里收口，手动领与自动发共用同一段判定。
   */
  private async issueOne(customerId: number, template: CouponTemplate): Promise<CustomerCoupon> {
    if (template.status !== CouponTemplateStatus.ONLINE) {
      throw BusinessException.badRequest(ErrorCode.COUPON_NOT_USABLE, '优惠券已下架');
    }

    // 生日券的限领口径是「每年 N 张」，其它场景是「总量 N 张」
    const received =
      template.scene === CouponScene.BIRTHDAY
        ? await this.countReceivedSince(customerId, template.id, new Date(new Date().getFullYear(), 0, 1))
        : await this.couponRepository.count({ where: { customerId, templateId: template.id } });
    if (received >= template.perLimit) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_LIMIT_EXCEEDED,
        template.scene === CouponScene.BIRTHDAY
          ? '今年的生日券已经领过了'
          : `每人限领 ${template.perLimit} 张，你已经领过了`,
      );
    }

    const expireAt = this.resolveExpireAt(template, new Date());
    if (!expireAt || expireAt <= new Date()) {
      throw BusinessException.badRequest(ErrorCode.COUPON_NOT_USABLE, '优惠券活动已结束');
    }

    return this.dataSource.transaction(async (manager) => {
      const templateRepo = manager.getRepository(CouponTemplate);
      // 不限量用 1=1 放行；限量则靠条件更新抢名额，抢不到就是领完了
      const limited = template.totalCount > 0;
      const stock = await templateRepo
        .createQueryBuilder()
        .update(CouponTemplate)
        .set({ receivedCount: () => 'received_count + 1' })
        .where('id = :id', { id: template.id })
        .andWhere(limited ? 'received_count < total_count' : '1 = 1')
        .execute();

      if (limited && stock.affected !== 1) {
        throw BusinessException.badRequest(ErrorCode.COUPON_SOLD_OUT, '这张券已经领完了');
      }

      const couponRepo = manager.getRepository(CustomerCoupon);
      return couponRepo.save(
        couponRepo.create({
          customerId,
          templateId: template.id,
          merchantId: template.merchantId,
          name: template.name,
          type: template.type,
          value: template.value,
          threshold: template.threshold,
          maxDiscount: template.maxDiscount,
          scene: template.scene,
          receivedAt: new Date(),
          expireAt,
          status: CustomerCouponStatus.UNUSED,
        }),
      );
    });
  }

  /** 券失效时间：相对有效期从「现在」起算，固定区间取模板结束时间 */
  private resolveExpireAt(template: CouponTemplate, from: Date): Date | null {
    if (template.validDays) {
      const until = new Date(from);
      until.setDate(until.getDate() + template.validDays);
      // 相对有效期给到当天 23:59，否则「今天领、7 天有效」会少掉大半天
      until.setHours(23, 59, 59, 0);
      return until;
    }
    return template.endAt;
  }

  private async countReceivedSince(
    customerId: number,
    templateId: number,
    since: Date,
  ): Promise<number> {
    return this.couponRepository
      .createQueryBuilder('coupon')
      .where('coupon.customer_id = :customerId', { customerId })
      .andWhere('coupon.template_id = :templateId', { templateId })
      .andWhere('coupon.received_at >= :since', { since })
      .getCount();
  }

  /** 模板字段校验。跨字段规则放服务层：DTO 装饰器表达不了「二选一」 */
  private assertTemplateShape(dto: UpsertCouponTemplateDto): void {
    if (dto.type === CouponType.DISCOUNT && (dto.value < 1 || dto.value > 99)) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_TEMPLATE_NOT_FOUND,
        '折扣率要在 1~99 之间（80 表示打 8 折）',
      );
    }
    if (dto.type === CouponType.AMOUNT && dto.value > COUPON_VALUE_CAP) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_TEMPLATE_NOT_FOUND,
        `满减金额最大 ${COUPON_VALUE_CAP / 100} 元`,
      );
    }
    if (
      dto.type === CouponType.AMOUNT &&
      (dto.threshold ?? 0) > 0 &&
      dto.value >= (dto.threshold ?? 0)
    ) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_TEMPLATE_NOT_FOUND,
        '满减金额必须小于门槛，否则会算出负应付',
      );
    }
    const hasDays = dto.validDays !== undefined && dto.validDays !== null;
    const hasRange = Boolean(dto.startAt && dto.endAt);
    if (hasDays === hasRange) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_TEMPLATE_NOT_FOUND,
        '有效期只能填一种：领取后 N 天有效，或固定起止日期',
      );
    }
    if (hasRange && new Date(dto.startAt as string) >= new Date(dto.endAt as string)) {
      throw BusinessException.badRequest(
        ErrorCode.COUPON_TEMPLATE_NOT_FOUND,
        '有效期结束必须晚于开始',
      );
    }
  }

  private toTemplateFields(dto: UpsertCouponTemplateDto): Partial<CouponTemplate> {
    return {
      name: dto.name.trim(),
      type: dto.type,
      value: dto.value,
      threshold: dto.threshold ?? 0,
      maxDiscount: dto.type === CouponType.DISCOUNT ? (dto.maxDiscount ?? null) : null,
      scene: dto.scene ?? CouponScene.NORMAL,
      validDays: dto.validDays ?? null,
      startAt: dto.startAt ? new Date(dto.startAt) : null,
      endAt: dto.endAt ? new Date(`${dto.endAt}T23:59:59`) : null,
      totalCount: dto.totalCount ?? 0,
      perLimit: dto.perLimit ?? 1,
      description: dto.description?.trim() || null,
    };
  }

  /**
   * 按「期望归属」取模板。
   *
   * `expectedMerchantId` 为 null 表示**必须是平台券**，不是「不限归属」——
   * 这样平台管理员在写路径上就只能改全场通用的那几张，
   * 越界去改某个商户的券会被当成「不存在」。读列表仍可按需放宽。
   */
  private async findTemplateOrFail(
    id: number,
    expectedMerchantId: number | null,
  ): Promise<CouponTemplate> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template || template.merchantId !== expectedMerchantId) {
      throw BusinessException.notFound(ErrorCode.COUPON_TEMPLATE_NOT_FOUND, '优惠券不存在');
    }
    return template;
  }

  private toTemplateDto(template: CouponTemplate): CouponTemplateDto {
    const dto = new CouponTemplateDto();
    dto.id = template.id;
    dto.merchantId = template.merchantId;
    dto.name = template.name;
    dto.type = template.type;
    dto.value = template.value;
    dto.threshold = template.threshold;
    dto.maxDiscount = template.maxDiscount;
    dto.scene = template.scene;
    dto.validDays = template.validDays;
    dto.startAt = template.startAt;
    dto.endAt = template.endAt;
    dto.totalCount = template.totalCount;
    dto.receivedCount = template.receivedCount;
    dto.perLimit = template.perLimit;
    dto.description = template.description;
    dto.status = template.status;
    dto.faceValue = this.faceValue(template);
    dto.thresholdText = this.thresholdText(template);
    dto.remain =
      template.totalCount > 0
        ? Math.max(0, template.totalCount - template.receivedCount)
        : null;
    return dto;
  }

  private toCustomerCouponDto(coupon: CustomerCoupon, merchantId: number | null): CustomerCouponDto {
    const now = new Date();
    const expired = coupon.expireAt <= now;
    const dto = new CustomerCouponDto();
    dto.id = coupon.id;
    dto.templateId = coupon.templateId;
    dto.merchantId = coupon.merchantId;
    dto.name = coupon.name;
    dto.type = coupon.type;
    dto.value = coupon.value;
    dto.threshold = coupon.threshold;
    dto.maxDiscount = coupon.maxDiscount;
    dto.scene = coupon.scene;
    dto.expireAt = coupon.expireAt;
    dto.status = expired && coupon.status === CustomerCouponStatus.UNUSED ? 'expired' : coupon.status;
    dto.faceValue = this.faceValue(coupon);
    dto.thresholdText = this.thresholdText(coupon);
    dto.receivedAt = coupon.receivedAt;
    dto.usedAt = coupon.usedAt;
    dto.usable = false;
    dto.unusableReason = null;
    dto.discountPreview = 0;
    if (merchantId !== null && coupon.merchantId !== null && coupon.merchantId !== merchantId) {
      dto.unusableReason = '不适用于当前门店';
    }
    return dto;
  }
}
