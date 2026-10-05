import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OrderSource } from '../../../shared/enums/order-source.enum';
import { OrderStatus } from '../../../shared/enums/order-status.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 订单主表。
 *
 * 金额约定（见 CODEBUDDY.md 8.3）：全部为**整数分**。
 *   total_amount    商品总额
 *   discount_amount 优惠金额
 *   payable_amount  应付 = total - discount
 *   paid_amount     实付
 *
 * 幂等：client_token 由客户端生成，配 **(商户, 令牌) 联合唯一索引**防重复下单。
 * 令牌必须由租户共同约束 —— 若全局唯一，A 商户的令牌会被 B 商户的下单请求命中，
 * 从而把他租户的订单原样返回给调用方。
 *
 * 支付票据 pay_token：下单时由服务端生成，**只在下单响应里出现一次**。
 * 公开的发起支付接口凭它证明调用方就是下单的人，否则任何人都能给别人的订单发起支付。
 * 订单号 order_no 对外展示，同样唯一。
 */
@Entity('orders')
@Index('idx_order_merchant', ['merchantId'])
@Index('idx_order_store', ['storeId'])
@Index('idx_order_status', ['status'])
@Unique('uk_order_no', ['orderNo'])
@Unique('uk_order_merchant_client_token', ['merchantId', 'clientToken'])
export class Order extends BaseEntity {
  @Column({ name: 'order_no', type: 'varchar', length: 32, comment: '订单号（对外展示，唯一）' })
  orderNo!: string;

  @Column({
    name: 'pay_token',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '支付票据：服务端生成，仅在下单响应中返回，用于校验发起支付方的归属',
  })
  payToken!: string | null;

  @Column({
    name: 'client_token',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '客户端幂等令牌，防止重复下单；NULL 表示不启用幂等',
  })
  clientToken!: string | null;

  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属商户 ID（租户隔离字段）',
  })
  merchantId!: number;

  @Column({
    name: 'store_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '下单门店 ID',
  })
  storeId!: number;

  @Column({
    name: 'source',
    type: 'varchar',
    length: 16,
    default: OrderSource.SCAN,
    comment: '订单来源：scan 扫码点餐 / pos 收银台代客开单',
  })
  source!: OrderSource;

  @Column({
    name: 'created_by',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '下单账号 ID；C 端扫码下单为 NULL（审计字段）',
  })
  createdBy!: number | null;

  @Column({
    name: 'created_by_name',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '下单账号姓名快照，避免账号改名后对不上账',
  })
  createdByName!: string | null;

  @Column({
    name: 'status',
    type: 'tinyint',
    default: OrderStatus.PENDING_PAYMENT,
    comment: '订单状态：10 待支付 / 20 待接单 / 30 制作中 / 40 待取餐 / 50 已完成 / 60 已取消',
  })
  status!: OrderStatus;

  @Column({ name: 'total_amount', type: 'int', comment: '商品总额（分）' })
  totalAmount!: number;

  @Column({ name: 'discount_amount', type: 'int', default: 0, comment: '优惠金额（分）' })
  discountAmount!: number;

  @Column({ name: 'payable_amount', type: 'int', comment: '应付金额（分）= 总额 - 优惠' })
  payableAmount!: number;

  @Column({ name: 'paid_amount', type: 'int', nullable: true, comment: '实付金额（分）' })
  paidAmount!: number | null;

  @Column({ name: 'item_count', type: 'int', default: 0, comment: '商品总件数（冗余，便于列表展示）' })
  itemCount!: number;

  @Column({ name: 'customer_name', type: 'varchar', length: 32, nullable: true, comment: '下单人称呼' })
  customerName!: string | null;

  @Column({ name: 'customer_phone', type: 'varchar', length: 20, nullable: true, comment: '下单人手机号' })
  customerPhone!: string | null;

  @Column({ name: 'table_no', type: 'varchar', length: 16, nullable: true, comment: '桌号（堂食扫码）' })
  tableNo!: string | null;

  @Column({ name: 'remark', type: 'varchar', length: 255, nullable: true, comment: '备注，如「不要葱」' })
  remark!: string | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true, comment: '支付时间' })
  paidAt!: Date | null;

  @Column({ name: 'accepted_at', type: 'datetime', nullable: true, comment: '接单时间' })
  acceptedAt!: Date | null;

  @Column({ name: 'ready_at', type: 'datetime', nullable: true, comment: '出餐时间' })
  readyAt!: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true, comment: '完成时间' })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true, comment: '取消时间' })
  cancelledAt!: Date | null;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 128, nullable: true, comment: '取消原因' })
  cancelReason!: string | null;
}
