import { Injectable } from '@nestjs/common';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { OrderBucket } from '../../shared/enums/customer.enum';
import { OrderStatus } from '../../shared/enums/order-status.enum';
import { RefundStatus } from '../../shared/enums/refund-status.enum';
import { PAYMENT_CHANNEL_LABELS } from '../../shared/enums/payment-channel.enum';
import { PaymentStatus } from '../../shared/enums/payment-status.enum';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Payment } from '../payment/entities/payment.entity';
import { Store } from '../store/entities/store.entity';
import { Review } from '../review/entities/review.entity';
import { CustomerOrderDto, CustomerOrderItemDto, orderStatusLabel, QueryCustomerOrderDto } from './dto/customer-order.dto';
import { CustomerOrderCountDto } from './dto/customer-response.dto';

/** 「待使用」覆盖的状态：已支付但还没吃完 */
const PROCESSING_STATUSES = [OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.READY];

/**
 * 顾客侧订单查询。
 *
 * 与商户侧列表分开写，是因为两者的**授权模型完全不同**：
 * 商户侧按 Token 里的租户范围过滤，顾客侧按 customer_id 过滤，
 * 混在一个方法里迟早漏掉一边。
 *
 * 这里刻意不回 `payToken`：列表是长期可访问的接口，
 * 把一次性支付票据摊在列表响应里，等于任何能看到这台手机的人都能替顾客发起支付。
 * 顾客要付款，走「详情」接口由服务端按归属校验后再给。
 */
@Injectable()
export class CustomerOrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  /** 分页查询本人订单 */
  async list(
    customerId: number,
    query: QueryCustomerOrderDto,
  ): Promise<PaginatedDto<CustomerOrderDto>> {
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .where('order.customer_id = :customerId', { customerId });

    if (query.merchantId !== undefined) {
      qb.andWhere('order.merchant_id = :merchantId', { merchantId: query.merchantId });
    }
    if (query.bucket) {
      this.applyBucket(qb, query.bucket);
    }

    qb.orderBy('order.id', 'DESC').skip(query.skip).take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return PaginatedDto.from({
      list: await this.toDtoList(rows),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 订单详情。越权一律 404，与公开读单接口保持同样的「不暴露存在性」口径 */
  async detail(customerId: number, orderId: number): Promise<CustomerOrderDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, customerId },
    });
    if (!order) {
      throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }
    const [dto] = await this.toDtoList([order]);
    return dto;
  }

  /**
   * 「我的」页四桶计数。
   *
   * 四次 COUNT 而不是一条 SQL：桶之间条件互斥但写法差异大（有的要 EXISTS），
   * 拼成一条 CASE WHEN 会难读到没人敢改。四桶都是走索引的小表扫描，
   * 一个顾客的订单量级撑不起优化。
   */
  async countBuckets(customerId: number): Promise<CustomerOrderCountDto> {
    const entries = await Promise.all(
      (['unpaid', 'processing', 'review', 'refund'] as OrderBucket[]).map(async (bucket) => {
        const { sql, params } = this.bucketPredicate(bucket);
        const count = await this.orderRepository
          .createQueryBuilder('order')
          .where('order.customer_id = :customerId', { customerId })
          .andWhere(sql, params)
          .getCount();
        return [bucket, count] as const;
      }),
    );
    return CustomerOrderCountDto.from(Object.fromEntries(entries));
  }

  // ==================== 内部辅助 ====================

  /**
   * 桶条件。
   *
   * `refund` 的口径是「**付过钱之后**被取消」或「存在退款成功的支付单」：
   * 只按 status=已取消 统计会把「下单没付就自己取消」的单也算进售后，
   * 顾客会看到一个从没花过钱的退款记录。
   */
  private applyBucket(qb: SelectQueryBuilder<Order>, bucket: OrderBucket): void {
    const { sql, params } = this.bucketPredicate(bucket);
    qb.andWhere(sql, params);
  }

  private bucketPredicate(bucket: OrderBucket): { sql: string; params: Record<string, unknown> } {
    switch (bucket) {
      case 'unpaid':
        return { sql: 'order.status = :unpaid', params: { unpaid: OrderStatus.PENDING_PAYMENT } };
      case 'processing':
        return {
          sql: 'order.status IN (:...processingStatuses)',
          params: { processingStatuses: PROCESSING_STATUSES },
        };
      case 'review':
        return {
          sql:
            'order.status = :completed AND NOT EXISTS (SELECT 1 FROM reviews rv WHERE rv.order_id = order.id)',
          params: { completed: OrderStatus.COMPLETED },
        };
      case 'refund':
        return {
          // 整段必须再包一层括号：SQL 里 AND 的优先级高于 OR，
          // 不包的话 EXISTS 那一支会脱离 customer_id 条件，把别人的退款单也数进来
          sql:
            '((order.status = :cancelled AND order.paid_at IS NOT NULL) ' +
            'OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = order.id AND p.refund_status = :refunded))',
          params: { cancelled: OrderStatus.CANCELLED, refunded: RefundStatus.SUCCESS },
        };
      default:
        return { sql: '1 = 0', params: {} };
    }
  }

  /** 批量转 DTO：明细、门店名、是否已评价各一次查完，不在循环里打库 */
  private async toDtoList(orders: Order[]): Promise<CustomerOrderDto[]> {
    if (orders.length === 0) {
      return [];
    }

    const orderIds = orders.map((order) => order.id);
    const [items, stores, reviews, payments] = await Promise.all([
      this.orderItemRepository.find({
        where: { orderId: In(orderIds) },
        order: { id: 'ASC' },
      }),
      this.storeRepository.find({ where: { id: In([...new Set(orders.map((o) => o.storeId))]) } }),
      this.reviewRepository.find({ where: { orderId: In(orderIds) }, select: { orderId: true } }),
      // 只认成功的那笔：待支付的流水不能当成「已经用某种方式付过」
      this.paymentRepository.find({
        where: { orderId: In(orderIds), status: PaymentStatus.SUCCESS },
        order: { id: 'DESC' },
      }),
    ]);

    const paidChannelByOrder = new Map<number, string>();
    for (const payment of payments) {
      if (!paidChannelByOrder.has(payment.orderId)) {
        paidChannelByOrder.set(payment.orderId, PAYMENT_CHANNEL_LABELS[payment.channel] ?? payment.channel);
      }
    }

    const storeNames = new Map(stores.map((store) => [store.id, store.name]));
    const reviewedOrders = new Set(reviews.map((review) => review.orderId));
    const itemsByOrder = new Map<number, OrderItem[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    return orders.map((order) => {
      const dto = new CustomerOrderDto();
      dto.id = order.id;
      dto.orderNo = order.orderNo;
      dto.status = order.status;
      dto.statusLabel = orderStatusLabel(order.status);
      dto.storeId = order.storeId;
      dto.storeName = storeNames.get(order.storeId) ?? '门店已下线';
      dto.totalAmount = order.totalAmount;
      dto.discountAmount = order.discountAmount;
      dto.payableAmount = order.payableAmount;
      dto.paidAmount = order.paidAmount;
      dto.itemCount = order.itemCount;
      dto.diningType = order.diningType;
      dto.tableNo = order.tableNo;
      dto.pickupCode = order.pickupCode;
      dto.addressSnapshot = order.addressSnapshot;
      dto.remark = order.remark;
      dto.createdAt = order.createdAt;
      dto.paidAt = order.paidAt;
      dto.completedAt = order.completedAt;
      dto.cancelledAt = order.cancelledAt;
      dto.cancelReason = order.cancelReason;
      dto.paidChannelLabel = paidChannelByOrder.get(order.id) ?? null;
      dto.canReview = order.status === OrderStatus.COMPLETED && !reviewedOrders.has(order.id);
      dto.refunded = order.status === OrderStatus.CANCELLED && order.paidAt !== null;
      dto.items = (itemsByOrder.get(order.id) ?? []).map((item) => {
        const line = new CustomerOrderItemDto();
        line.dishName = item.dishName;
        line.dishImageUrl = item.dishImageUrl;
        line.specSummary = item.specSummary;
        line.unitPrice = item.unitPrice;
        line.specAmount = item.specAmount;
        line.quantity = item.quantity;
        line.subtotal = item.subtotal;
        return line;
      });
      return dto;
    });
  }
}
