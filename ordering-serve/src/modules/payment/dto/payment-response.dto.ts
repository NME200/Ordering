import { ApiProperty } from '@nestjs/swagger';
import {
  PAYMENT_CHANNEL_LABELS,
  PaymentChannel,
} from '../../../shared/enums/payment-channel.enum';
import {
  PAYMENT_STATUS_LABELS,
  PaymentStatus,
} from '../../../shared/enums/payment-status.enum';
import { REFUND_STATUS_LABELS, RefundStatus } from '../../../shared/enums/refund-status.enum';
import { Payment } from '../entities/payment.entity';

/** 支付单出参 */
export class PaymentResponseDto {
  @ApiProperty({ description: '支付单 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '支付单号', example: 'P20261005000001' })
  paymentNo!: string;

  @ApiProperty({ description: '订单 ID', example: 1 })
  orderId!: number;

  @ApiProperty({ description: '订单号', example: 'O20261005000001' })
  orderNo!: string;

  @ApiProperty({ description: '商户 ID', example: 1 })
  merchantId!: number;

  @ApiProperty({ description: '门店 ID', example: 1 })
  storeId!: number;

  @ApiProperty({ description: '支付渠道', enum: PaymentChannel })
  channel!: PaymentChannel;

  @ApiProperty({ description: '支付渠道名称', example: '模拟支付' })
  channelLabel!: string;

  @ApiProperty({ description: '支付状态', enum: PaymentStatus })
  status!: PaymentStatus;

  @ApiProperty({ description: '支付状态名称', example: '支付成功' })
  statusLabel!: string;

  @ApiProperty({ description: '支付金额（分）', example: 7600 })
  amount!: number;

  @ApiProperty({ description: '渠道交易流水号', nullable: true })
  transactionId!: string | null;

  @ApiProperty({ description: '渠道预支付 ID', nullable: true })
  prepayId!: string | null;

  @ApiProperty({ description: '支付成功时间', nullable: true, type: String, format: 'date-time' })
  paidAt!: Date | null;

  @ApiProperty({ description: '关闭时间', nullable: true, type: String, format: 'date-time' })
  closedAt!: Date | null;

  @ApiProperty({ description: '失败原因', nullable: true })
  failReason!: string | null;

  @ApiProperty({ description: '退款单号', nullable: true })
  refundNo!: string | null;

  @ApiProperty({ description: '退款状态', enum: RefundStatus })
  refundStatus!: RefundStatus;

  @ApiProperty({ description: '退款状态名称', example: '已退款' })
  refundStatusLabel!: string;

  @ApiProperty({ description: '退款金额（分）', nullable: true })
  refundAmount!: number | null;

  @ApiProperty({ description: '退款时间', nullable: true, type: String, format: 'date-time' })
  refundedAt!: Date | null;

  @ApiProperty({ description: '退款原因', nullable: true })
  refundReason!: string | null;

  @ApiProperty({ description: '渠道退款流水号', nullable: true })
  refundTransactionId!: string | null;

  @ApiProperty({ description: '创建时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(entity: Payment): PaymentResponseDto {
    const dto = new PaymentResponseDto();
    dto.id = entity.id;
    dto.paymentNo = entity.paymentNo;
    dto.orderId = entity.orderId;
    dto.orderNo = entity.orderNo;
    dto.merchantId = entity.merchantId;
    dto.storeId = entity.storeId;
    dto.channel = entity.channel;
    dto.channelLabel = PAYMENT_CHANNEL_LABELS[entity.channel];
    dto.status = entity.status;
    dto.statusLabel = PAYMENT_STATUS_LABELS[entity.status];
    dto.amount = entity.amount;
    dto.transactionId = entity.transactionId;
    dto.prepayId = entity.prepayId;
    dto.paidAt = entity.paidAt;
    dto.closedAt = entity.closedAt;
    dto.failReason = entity.failReason;
    dto.refundNo = entity.refundNo;
    dto.refundStatus = entity.refundStatus;
    dto.refundStatusLabel = REFUND_STATUS_LABELS[entity.refundStatus];
    dto.refundAmount = entity.refundAmount;
    dto.refundedAt = entity.refundedAt;
    dto.refundReason = entity.refundReason;
    dto.refundTransactionId = entity.refundTransactionId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

/** 发起支付返回：给客户端唤起支付所需的全部信息 */
export class PrepayResponseDto {
  @ApiProperty({ description: '支付单 ID', example: 1 })
  paymentId!: number;

  @ApiProperty({ description: '支付单号', example: 'P20261005000001' })
  paymentNo!: string;

  @ApiProperty({ description: '订单号', example: 'O20261005000001' })
  orderNo!: string;

  @ApiProperty({ description: '支付金额（分）', example: 7600 })
  amount!: number;

  @ApiProperty({ description: '支付渠道', enum: PaymentChannel })
  channel!: PaymentChannel;

  @ApiProperty({ description: '渠道预支付 ID', example: 'mock_prepay_P20261005000001' })
  prepayId!: string;

  @ApiProperty({
    description: '唤起支付所需参数（结构由各渠道定义；mock 渠道会带上可直接回调的 sign）',
    type: 'object',
    additionalProperties: true,
  })
  payParams!: Record<string, unknown>;

  static from(entity: Payment, payParams: Record<string, unknown>): PrepayResponseDto {
    const dto = new PrepayResponseDto();
    dto.paymentId = entity.id;
    dto.paymentNo = entity.paymentNo;
    dto.orderNo = entity.orderNo;
    dto.amount = entity.amount;
    dto.channel = entity.channel;
    dto.prepayId = entity.prepayId ?? '';
    dto.payParams = payParams;
    return dto;
  }
}

/** 支付渠道信息 */
export class PaymentChannelDto {
  @ApiProperty({ description: '渠道标识', enum: PaymentChannel })
  channel!: PaymentChannel;

  @ApiProperty({ description: '渠道名称', example: '模拟支付' })
  label!: string;

  @ApiProperty({ description: '是否可被 C 端用于在线发起支付', example: true })
  online!: boolean;

  static from(channel: PaymentChannel, online: boolean): PaymentChannelDto {
    const dto = new PaymentChannelDto();
    dto.channel = channel;
    dto.label = PAYMENT_CHANNEL_LABELS[channel];
    dto.online = online;
    return dto;
  }
}
