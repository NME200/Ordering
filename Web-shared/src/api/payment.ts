import type { PaginatedData } from '../types/api';
import type {
  Payment,
  PaymentChannelInfo,
  PaymentQuery,
  RefundPaymentPayload,
} from '../types/payment';
import { request } from '../utils/request';

/** 可用支付渠道（online=true 的才能被 C 端用于发起在线支付） */
export function fetchPaymentChannels(): Promise<PaymentChannelInfo[]> {
  return request<PaymentChannelInfo[]>({ url: '/payments/channels' });
}

/** 分页查询支付流水 */
export function fetchPayments(params: PaymentQuery): Promise<PaginatedData<Payment>> {
  return request<PaginatedData<Payment>>({ url: '/payments', params });
}

/** 查询支付单详情 */
export function fetchPayment(id: number): Promise<Payment> {
  return request<Payment>({ url: `/payments/${id}` });
}

/** 发起退款（当前仅支持整单全额退款） */
export function refundPayment(id: number, data: RefundPaymentPayload): Promise<Payment> {
  return request<Payment>({ url: `/payments/${id}/refund`, method: 'post', data });
}
