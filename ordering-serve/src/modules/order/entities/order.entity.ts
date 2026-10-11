import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { DiningType } from '../../../shared/enums/dining-type.enum';
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
@Index('idx_order_customer', ['customerId'])
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

  /**
   * 取餐码（仅门店自提）。
   *
   * 存在的理由很具体：让顾客在柜台前报 14 位订单号，店员念一遍、顾客听一遍，
   * 错一个字符就得回系统里查半天。取餐码是「这家门店当天的第几单」，
   * 四位数字，喊得出口也对得上，口径见 SerialNoGenerator.nextSeq。
   * 堂食有桌号、外卖有地址，都不需要它，所以非自提单恒为 NULL。
   */
  @Column({
    name: 'pickup_code',
    type: 'varchar',
    length: 8,
    nullable: true,
    comment: '取餐码（自提单专用，门店当天序号，如 0042）',
  })
  pickupCode!: string | null;

  @Column({
    name: 'dining_type',
    type: 'tinyint',
    default: DiningType.DINE_IN,
    comment: '就餐方式：0 堂食 / 1 自提 / 2 外卖配送',
  })
  diningType!: DiningType;

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

  /**
   * 下单顾客 ID。
   *
   * 可空，且**永远不以它作为读单的凭据**：C 端读单仍是 orderNo + payToken 双因子。
   * 它存在的意义只有两个 —— 「我的订单」能列出历史单，以及支付成功后知道该给谁加积分。
   * 未登录顾客下单时它是 NULL，所以历史数据不需要回填。
   */
  @Column({
    name: 'customer_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '下单顾客 ID（登录顾客才有）',
  })
  customerId!: number | null;

  @Column({
    name: 'coupon_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '本单使用的顾客券 ID（customer_coupons.id），未用券为 NULL',
  })
  couponId!: number | null;

  /**
   * 收货地址快照（外卖配送单）。
   *
   * 存文本快照而不是 address_id：顾客删掉或改掉地址之后，
   * 历史订单必须还能看出「当时送到哪儿」，这是履约纠纷里唯一有用的字段。
   */
  @Column({
    name: 'address_snapshot',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '收货信息快照：姓名 / 电话 / 省市区 / 详细地址，下单时定格',
  })
  addressSnapshot!: string | null;
}
