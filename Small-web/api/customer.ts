/**
 * 顾客端接口。
 *
 * 令牌由 `utils/request.ts` 统一注入，这里不再逐个传；
 * 需要登录的路由在后端都标了 `@Public()` + 顾客守卫，
 * 所以**未登录时调用会得到 401**，调用方要么先 `ensureSession()`，要么按错误码兜底。
 */
import { request } from '@/utils/request';
import {
  getCustomerToken,
  isWechatLinked,
  markWechatLinked,
  sessionPayload,
  setCustomerToken,
} from '@/utils/auth';
import { isWeixinMp, wxLoginCode } from '@/utils/wx';
import type {
  CouponCenterItem,
  CustomerAddress,
  CustomerCoupon,
  CustomerOrder,
  CustomerOverview,
  CustomerProfile,
  InvoiceableOrder,
  InvoiceRow,
  InvoiceTitle,
  MemberAsset,
  MemberLevel,
  MemberTask,
  OrderBucket,
  Paginated,
  PointLog,
  QueueBoard,
  QueueRow,
  ReviewDraft,
  ReviewRow,
  ServiceMessage,
  ServiceSession,
} from '@/types/customer';
import type { PrepayResult } from '@/types/api';

export interface SessionResult {
  accessToken: string;
  expiresIn: string;
  profile: CustomerProfile;
}

let pending: Promise<SessionResult> | null = null;

/** 注册入参：小程序里顺手带上 wx.login 的 code，让账号认人而不是认设备 */
async function buildSessionPayload(): Promise<Record<string, unknown>> {
  const payload = sessionPayload() as Record<string, unknown>;
  if (isWeixinMp()) {
    try {
      payload.wxCode = await wxLoginCode();
    } catch {
      // 拿不到 code 就按设备身份注册 —— 登录不能被微信侧的抖动挡住
    }
  }
  return payload;
}

/**
 * 静默注册 / 复用登录态。
 *
 * 并发去重：小程序冷启动时首页、我的、订单页可能同时要求登录，
 * 三个请求各自注册会拿到不同令牌（后写的覆盖先写的），
 * 所以同一时刻只允许有一个在途请求，后来者复用同一个 Promise。
 */
export function ensureSession(force = false): Promise<SessionResult> {
  const token = getCustomerToken();
  if (token && !force) {
    return Promise.resolve({ accessToken: token, expiresIn: '', profile: {} as CustomerProfile });
  }
  if (pending) return pending;

  pending = buildSessionPayload()
    .then((data) =>
      request<SessionResult>('/customer/session', { method: 'POST', data, silent: true }),
    )
    .then((res) => {
      setCustomerToken(res.accessToken);
      return res;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

/**
 * 给已有登录态补绑微信身份。
 *
 * 存量顾客本地存着旧令牌，`/customer/session` 这辈子不会再调一次，
 * 不补这一步，「换手机不丢账号」对老账号就是空话。
 * 注册那次带的 wxCode 有没有真的换成 openid，后端不会回话（它可能静默降级了），
 * 所以这里一律在冷启动后补跑一次：绑上了就记本地标记，之后不再发；
 * 后端这一步是幂等的，重复调只会回 `bound: true`。
 * 失败静默 —— 凭据没配、微信号已绑别人、网络抖动，都不该打扰顾客。
 */
export async function syncWechatIdentity(): Promise<void> {
  if (!isWeixinMp() || !getCustomerToken() || isWechatLinked()) return;
  try {
    const code = await wxLoginCode();
    await request<{ bound: boolean }>('/customer/wechat/openid', {
      method: 'POST',
      data: { code },
      silent: true,
    });
    markWechatLinked();
  } catch {
    // 静默：下次冷启动再试
  }
}

/** 用微信「手机号快速验证组件」拿到的 code 一键绑定手机号 */
export function bindPhoneByWechat(code: string): Promise<CustomerProfile> {
  return request<CustomerProfile>('/customer/wechat/phone', { method: 'POST', data: { code } });
}

export function logout(): Promise<unknown> {
  return request<unknown>('/customer/logout', { method: 'POST', silent: true });
}

export function fetchProfile(): Promise<CustomerProfile> {
  return request<CustomerProfile>('/customer/profile', { silent: true });
}

export function updateProfile(payload: {
  nickname?: string;
  avatar?: string;
  gender?: number;
  birthday?: string;
}): Promise<CustomerProfile> {
  return request<CustomerProfile>('/customer/profile', { method: 'PUT', data: payload });
}

export function sendPhoneCode(phone: string): Promise<{ sent: boolean; devCode?: string }> {
  return request<{ sent: boolean; devCode?: string }>('/customer/phone/code', {
    method: 'POST',
    data: { phone },
  });
}

export function bindPhone(phone: string, code: string): Promise<CustomerProfile> {
  return request<CustomerProfile>('/customer/phone', { method: 'POST', data: { phone, code } });
}

export function fetchOverview(merchantId?: number): Promise<CustomerOverview> {
  return request<CustomerOverview>(`/customer/overview${merchantId ? `?merchantId=${merchantId}` : ''}`, {
    silent: true,
  });
}

export function fetchOrderCount(): Promise<{ buckets: Record<OrderBucket, number> }> {
  return request<{ buckets: Record<OrderBucket, number> }>('/customer/order-count', { silent: true });
}

export function fetchOrders(params: { bucket?: OrderBucket; page?: number; pageSize?: number } = {}): Promise<Paginated<CustomerOrder>> {
  const query = [
    params.bucket ? `bucket=${params.bucket}` : '',
    params.page ? `page=${params.page}` : '',
    params.pageSize ? `pageSize=${params.pageSize}` : '',
  ]
    .filter(Boolean)
    .join('&');
  return request<Paginated<CustomerOrder>>(`/customer/orders${query ? `?${query}` : ''}`);
}

export function fetchCustomerOrder(id: number): Promise<CustomerOrder> {
  return request<CustomerOrder>(`/customer/orders/${id}`);
}

/**
 * 取消自己的未支付订单。
 *
 * 已支付的单后端会拒（退款不是顾客自助接口），错误文案直接透出即可。
 */
export function cancelMyOrder(id: number): Promise<CustomerOrder> {
  return request<CustomerOrder>(`/customer/orders/${id}/cancel`, { method: 'POST' });
}

/** 为自己的订单发起支付：不需要 payToken，归属由账号证明，所以换设备也付得了 */
export function payMyOrder(id: number, channel: string): Promise<PrepayResult> {
  return request<PrepayResult>(`/customer/orders/${id}/pay`, { method: 'POST', data: { channel } });
}

export function fetchMember(merchantId: number): Promise<{
  asset: MemberAsset | null;
  tasks: MemberTask[];
  levels: MemberLevel[];
}> {
  return request<{ asset: MemberAsset | null; tasks: MemberTask[]; levels: MemberLevel[] }>(
    `/customer/member?merchantId=${merchantId}`,
  );
}

export function fetchPointLogs(merchantId: number): Promise<PointLog[]> {
  return request<PointLog[]>(`/customer/points?merchantId=${merchantId}`);
}

// ==================== 收货地址 ====================

export function fetchAddresses(): Promise<CustomerAddress[]> {
  return request<CustomerAddress[]>('/customer/addresses');
}

export function createAddress(payload: Partial<CustomerAddress> & { isDefault?: number }): Promise<CustomerAddress> {
  return request<CustomerAddress>('/customer/addresses', {
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
  });
}

export function updateAddress(id: number, payload: Record<string, unknown>): Promise<CustomerAddress> {
  return request<CustomerAddress>(`/customer/addresses/${id}`, { method: 'PUT', data: payload });
}

export function setDefaultAddress(id: number): Promise<CustomerAddress> {
  return request<CustomerAddress>(`/customer/addresses/${id}/default`, { method: 'PUT' });
}

export function removeAddress(id: number): Promise<unknown> {
  return request<unknown>(`/customer/addresses/${id}`, { method: 'DELETE' });
}

// ==================== 优惠券 ====================

export function fetchCouponCenter(merchantId: number): Promise<CouponCenterItem[]> {
  return request<CouponCenterItem[]>(`/customer/coupons/center?merchantId=${merchantId}`);
}

export function receiveCoupon(templateId: number): Promise<CustomerCoupon> {
  return request<CustomerCoupon>('/customer/coupons/receive', {
    method: 'POST',
    data: { templateId },
  });
}

export function claimBirthdayCoupon(merchantId: number): Promise<CustomerCoupon> {
  return request<CustomerCoupon>(`/customer/coupons/birthday?merchantId=${merchantId}`, {
    method: 'POST',
  });
}

export function fetchMyCoupons(tab: 'unused' | 'used' | 'expired', merchantId?: number): Promise<CustomerCoupon[]> {
  const query = [`tab=${tab}`, merchantId ? `merchantId=${merchantId}` : ''].filter(Boolean).join('&');
  return request<CustomerCoupon[]>(`/customer/coupons/mine?${query}`);
}

export function fetchUsableCoupons(merchantId: number, amount: number): Promise<CustomerCoupon[]> {
  return request<CustomerCoupon[]>(
    `/customer/coupons/usable?merchantId=${merchantId}&amount=${amount}`,
    { silent: true },
  );
}

// ==================== 评价 ====================

export function submitReview(payload: ReviewDraft): Promise<ReviewRow> {
  return request<ReviewRow>('/customer/reviews', { method: 'POST', data: payload as unknown as Record<string, unknown> });
}

export function fetchMyReviews(): Promise<ReviewRow[]> {
  return request<ReviewRow[]>('/customer/reviews/mine');
}

// ==================== 发票 ====================

export function fetchInvoiceTitles(): Promise<InvoiceTitle[]> {
  return request<InvoiceTitle[]>('/customer/invoice-titles');
}

export function createInvoiceTitle(payload: Record<string, unknown>): Promise<InvoiceTitle> {
  return request<InvoiceTitle>('/customer/invoice-titles', { method: 'POST', data: payload });
}

export function removeInvoiceTitle(id: number): Promise<unknown> {
  return request<unknown>(`/customer/invoice-titles/${id}`, { method: 'DELETE' });
}

export function fetchInvoiceableOrders(): Promise<InvoiceableOrder[]> {
  return request<InvoiceableOrder[]>('/customer/invoices/invoiceable');
}

export function applyInvoice(orderId: number, titleId: number): Promise<InvoiceRow> {
  return request<InvoiceRow>('/customer/invoices', { method: 'POST', data: { orderId, titleId } });
}

export function fetchMyInvoices(tab: 'processing' | 'issued'): Promise<InvoiceRow[]> {
  return request<InvoiceRow[]>(`/customer/invoices?tab=${tab}`);
}

// ==================== 在线客服 ====================

export function openServiceSession(merchantId: number, storeId?: number): Promise<ServiceSession> {
  const query = [`merchantId=${merchantId}`, storeId ? `storeId=${storeId}` : ''].filter(Boolean).join('&');
  return request<ServiceSession>(`/customer/service/session?${query}`);
}

export function sendServiceMessage(payload: {
  merchantId: number;
  content: string;
  orderId?: number;
  storeId?: number;
}): Promise<ServiceMessage> {
  return request<ServiceMessage>('/customer/service/messages', {
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
  });
}

export function pollServiceMessages(sessionId: number, afterId: number): Promise<{
  messages: ServiceMessage[];
  session: ServiceSession;
}> {
  return request<{ messages: ServiceMessage[]; session: ServiceSession }>(
    `/customer/service/poll?sessionId=${sessionId}&afterId=${afterId}`,
    { silent: true },
  );
}

// ==================== 排队取号 ====================

export function fetchQueueBoard(storeId: number): Promise<QueueBoard> {
  return request<QueueBoard>(`/customer/queue/board/${storeId}`, { silent: true });
}

export function takeQueue(payload: { storeId: number; tableType: string; partySize: number }): Promise<QueueRow> {
  return request<QueueRow>('/customer/queue', { method: 'POST', data: payload as unknown as Record<string, unknown> });
}

export function fetchMyQueue(): Promise<QueueRow | null> {
  return request<QueueRow | null>('/customer/queue/mine', { silent: true });
}

export function cancelQueue(id: number): Promise<QueueRow> {
  return request<QueueRow>(`/customer/queue/${id}/cancel`, { method: 'PUT' });
}
