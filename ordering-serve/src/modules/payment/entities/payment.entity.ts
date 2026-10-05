import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';
import { PaymentStatus } from '../../../shared/enums/payment-status.enum';
import { RefundStatus } from '../../../shared/enums/refund-status.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 支付单。
 *
 * 与订单分开建模的原因：
 * 1. 一笔订单可能产生多张支付单（用户取消后换渠道重试）；
 * 2. 支付是外部渠道的异步结果，需要独立的状态与流水号做对账；
 * 3. 退款信息挂在支付单上，语义更准确。
 *
 * 金额一律为**整数分**。
 */
@Entity('payments')
@Index('idx_payment_order', ['orderId'])
@Index('idx_payment_merchant', ['merchantId'])
@Index('idx_payment_status', ['status'])
@Unique('uk_payment_no', ['paymentNo'])
export class Payment extends BaseEntity {
  @Column({ name: 'payment_no', type: 'varchar', length: 32, comment: '支付单号（唯一）' })
  paymentNo!: string;

  @Column({
    name: 'order_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '订单 ID',
  })
  orderId!: number;

  @Column({ name: 'order_no', type: 'varchar', length: 32, comment: '订单号（冗余，便于对账）' })
  orderNo!: string;

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
    comment: '门店 ID',
  })
  storeId!: number;

  @Column({
    name: 'channel',
    type: 'varchar',
    length: 16,
    comment: '支付渠道：offline 线下收款 / mock 模拟支付 / wechat 微信支付',
  })
  channel!: PaymentChannel;

  @Column({
    name: 'status',
    type: 'tinyint',
    default: PaymentStatus.PENDING,
    comment: '支付状态：10 待支付 / 20 成功 / 30 失败 / 40 已关闭',
  })
  status!: PaymentStatus;

  @Column({ name: 'amount', type: 'int', comment: '支付金额（分）' })
  amount!: number;

  @Column({
    name: 'transaction_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '渠道侧交易流水号',
  })
  transactionId!: string | null;

  @Column({
    name: 'prepay_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '渠道预支付 ID',
  })
  prepayId!: string | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true, comment: '支付成功时间' })
  paidAt!: Date | null;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true, comment: '关闭时间' })
  closedAt!: Date | null;

  @Column({ name: 'fail_reason', type: 'varchar', length: 255, nullable: true, comment: '失败原因' })
  failReason!: string | null;

  @Column({ name: 'refund_no', type: 'varchar', length: 32, nullable: true, comment: '退款单号' })
  refundNo!: string | null;

  @Column({
    name: 'refund_status',
    type: 'tinyint',
    default: RefundStatus.NONE,
    comment: '退款状态：0 无 / 10 退款中 / 20 成功 / 30 失败',
  })
  refundStatus!: RefundStatus;

  @Column({ name: 'refund_amount', type: 'int', nullable: true, comment: '退款金额（分）' })
  refundAmount!: number | null;

  @Column({ name: 'refunded_at', type: 'datetime', nullable: true, comment: '退款时间' })
  refundedAt!: Date | null;

  @Column({ name: 'refund_reason', type: 'varchar', length: 128, nullable: true, comment: '退款原因' })
  refundReason!: string | null;

  @Column({
    name: 'refund_transaction_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '渠道侧退款流水号',
  })
  refundTransactionId!: string | null;
}
