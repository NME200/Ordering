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
  PopupQueue,
  PopupScene,
  PrepayResult,
  PublicMenu,
  PublicOrder,
  PublicPointActivityBanner,
  PublicStore,
  PublicStoreListItem,
} from '@/types/api';

export function fetchAppConfig(localVersion: number): Promise<AppConfigResponse> {
  const query = localVersion > 0 ? `?v=${localVersion}` : '';
  return request<AppConfigResponse>(`/public/app-config${query}`, { silent: true });
}

/**
 * 门店列表（「查看门店」）。
 *
 * 后端不收顾客位置，坐标原样下发，**距离与排序在前端算**：
 * 位置只在小程序这一侧有，把它交给匿名接口既多一次授权也多一条隐私链路。
 */
export function fetchStores(params: { merchantId?: number; keyword?: string; limit?: number } = {}): Promise<{ stores: PublicStoreListItem[] }> {
  const query = [
    params.merchantId ? `merchantId=${params.merchantId}` : '',
    params.keyword ? `keyword=${encodeURIComponent(params.keyword)}` : '',
    params.limit ? `limit=${params.limit}` : '',
  ]
    .filter(Boolean)
    .join('&');
  return request<{ stores: PublicStoreListItem[] }>(`/public/stores${query ? `?${query}` : ''}`);
}

export function fetchStore(storeId: number): Promise<PublicStore> {
  return request<PublicStore>(`/public/stores/${storeId}`);
}

export function fetchMenu(storeId: number): Promise<PublicMenu> {
  return request<PublicMenu>(`/public/stores/${storeId}/menu`);
}

/**
 * 本店此刻生效的平台积分活动条（限流 60 次/分）。
 *
 * 失败与「没有活动」在界面上是同一种表现：整块不渲染。
 * 所以这里必须 silent —— 顾客不该因为平台没做活动就看到一个报错 toast。
 */
export function fetchPointActivity(storeId: number): Promise<PublicPointActivityBanner | null> {
  return request<PublicPointActivityBanner | null>(`/public/stores/${storeId}/point-activity`, {
    silent: true,
  });
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

/** 当前场景的弹窗队列；后端已按状态 / 时间 / 门店过滤，频次不在这里判 */
export function fetchPopupQueue(scene: PopupScene, storeId?: number): Promise<PopupQueue> {
  const query = [`scene=${scene}`, storeId ? `storeId=${storeId}` : ''].filter(Boolean).join('&');
  return request<PopupQueue>(`/public/popup/list?${query}`, { silent: true });
}

/**
 * 弹窗埋点：曝光 / 关闭 / 点击。
 *
 * 静默失败 —— 统计绝不能挡住顾客下单，报错了就当没报。
 */
export function reportPopupEvent(
  popupId: number,
  visitorKey: string,
  action: 'show' | 'close' | 'click',
): Promise<unknown> {
  return request<unknown>('/public/popup/show-log', {
    method: 'POST',
    data: { popupId, visitorKey, action },
    silent: true,
  });
}
