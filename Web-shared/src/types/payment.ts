import type { PaginationQuery } from './api';
import type { PaymentChannel, PaymentStatus, RefundStatus } from './enums';

/**
 * 支付相关类型 —— 与后端 `modules/payment/dto` 对齐。
 *
 * 一笔订单可能产生多张支付单（用户取消后重试等），
 * 但同一时刻只允许一张处于「待支付」。
 */

/** 支付单 */
export interface Payment {
  id: number;
  paymentNo: string;
  orderId: number;
  orderNo: string;
  merchantId: number;
  storeId: number;
  channel: PaymentChannel;
  channelLabel: string;
  status: PaymentStatus;
  statusLabel: string;
  /** 支付金额（分） */
  amount: number;
  /** 渠道交易流水号 */
  transactionId: string | null;
  prepayId: string | null;
  paidAt: string | null;
  closedAt: string | null;
  failReason: string | null;
  refundNo: string | null;
  refundStatus: RefundStatus;
  refundStatusLabel: string;
  /** 退款金额（分） */
  refundAmount: number | null;
  refundedAt: string | null;
  refundReason: string | null;
  refundTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 支付流水查询入参 */
export interface PaymentQuery extends PaginationQuery {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  /** 门店管理员会被服务端强制限定为本店 */
  storeId?: number;
  /** 查某笔订单的支付记录 */
  orderId?: number;
  channel?: PaymentChannel;
  status?: PaymentStatus;
  /** 按支付单号 / 订单号模糊搜索 */
  keyword?: string;
  startTime?: string;
  endTime?: string;
}

/** 支付渠道信息 */
export interface PaymentChannelInfo {
  channel: PaymentChannel;
  label: string;
  /** 是否可被 C 端用于在线发起支付 */
  online: boolean;
}

/** 发起退款入参（当前仅支持整单全额退款） */
export interface RefundPaymentPayload {
  reason?: string;
}
