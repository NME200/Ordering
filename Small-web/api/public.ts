/**
 * C 端接口封装。全部匿名，凭据只有下单时后端发的 `payToken`。
 *
 * 路径与限流桶对应关系（后端 `modules/public` 与 `modules/payment`）：
 * app-config 30/分、store 与 menu 60/分、查单与取消 10/分 ——
 * 所以**订单详情的轮询间隔必须 ≥ 6 秒**，取消按钮要点一下就走而不是边看边发。
 */
import { request } from '@/utils/request';
import type {
  AppConfigResponse,
  CreateOrderPayload,
  CreateOrderResult,
  PaymentChannel,
  PrepayResult,
  PublicMenu,
  PublicOrder,
  PublicStore,
} from '@/types/api';

export function fetchAppConfig(localVersion: number): Promise<AppConfigResponse> {
  const query = localVersion > 0 ? `?v=${localVersion}` : '';
  return request<AppConfigResponse>(`/public/app-config${query}`, { silent: true });
}

export function fetchStore(storeId: number): Promise<PublicStore> {
  return request<PublicStore>(`/public/stores/${storeId}`);
}

export function fetchMenu(storeId: number): Promise<PublicMenu> {
  return request<PublicMenu>(`/public/stores/${storeId}/menu`);
}

export function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  return request<CreateOrderResult>('/orders', {
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
  });
}

export function fetchOrder(orderNo: string, token: string): Promise<PublicOrder> {
  return request<PublicOrder>(
    `/public/orders/${encodeURIComponent(orderNo)}?token=${encodeURIComponent(token)}`,
    { silent: true },
  );
}

export function cancelOrder(orderNo: string, token: string): Promise<PublicOrder> {
  return request<PublicOrder>(`/public/orders/${encodeURIComponent(orderNo)}/cancel`, {
    method: 'POST',
    data: { token },
  });
}

export function fetchPaymentChannels(): Promise<PaymentChannel[]> {
  return request<PaymentChannel[]>('/payments/channels', { silent: true });
}

export function createPayment(
  orderId: number,
  payToken: string,
  channel: string,
): Promise<PrepayResult> {
  return request<PrepayResult>(`/orders/${orderId}/pay`, {
    method: 'POST',
    data: { payToken, channel },
  });
}

/**
 * 模拟渠道支付成功（后端 DevOnlyGuard，生产按「接口不存在」处理）。
 *
 * 真实渠道接好之前，收银台靠它把「下单 → 支付 → 出单」这条链跑完；
 * 界面上会如实标出这是联调渠道。
 */
export function mockChannelPay(paymentNo: string, channel: string): Promise<unknown> {
  return request<unknown>('/payments/dev/mock-pay', {
    method: 'POST',
    data: { paymentNo, channel },
    silent: true,
  });
}
