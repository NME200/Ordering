/**
 * 顾客令牌的本地存取。
 *
 * 单独一个文件而不是塞进 pinia store，是因为 `utils/request.ts` 也要读它 ——
 * store 依赖 request（要发请求），request 再依赖 store 就成了循环引用，
 * 小程序端这种环编译期不一定报错，运行期表现为「store 是 undefined」。
 */
import { getVisitorKey } from './visitor';

const TOKEN_KEY = 'custo…n-v1';
const MERCHANT_KEY = 'custo…t-id';
/** 「这个账号已经绑过微信 openid」的本地记号，避免每次冷启动都补绑一遍 */
const WX_LINKED_KEY = 'custo…d-v1';

export function getCustomerToken(): string {
  return String(uni.getStorageSync(TOKEN_KEY) || '');
}

export function setCustomerToken(token: string): void {
  uni.setStorageSync(TOKEN_KEY, token);
}

export function clearCustomerToken(): void {
  uni.removeStorageSync(TOKEN_KEY);
  // 记号跟着令牌走：换账号（登出、被封禁后重注册）就得重新补绑一次
  uni.removeStorageSync(WX_LINKED_KEY);
}

export function isWechatLinked(): boolean {
  return String(uni.getStorageSync(WX_LINKED_KEY) || '') === '1';
}

export function markWechatLinked(): void {
  uni.setStorageSync(WX_LINKED_KEY, '1');
}

/**
 * 最近一次下单/进店时的商户 ID。
 *
 * 「我的」页的积分、余额、券数都是**按商户**的会员资产，
 * 顾客没进过任何店时它为空 —— 这时界面要显示「进店后可见」而不是 0，
 * 把「没有档案」和「有档案但是 0 分」混成一样，顾客会以为积分被吞了。
 */
export function getLastMerchantId(): number {
  return Number(uni.getStorageSync(MERCHANT_KEY) || 0);
}

export function setLastMerchantId(merchantId: number): void {
  if (merchantId > 0) uni.setStorageSync(MERCHANT_KEY, String(merchantId));
}

/** 供静默注册使用：设备标识 + 当前商户 */
export function sessionPayload(): { visitorKey: string; merchantId?: number } {
  const merchantId = getLastMerchantId();
  return merchantId ? { visitorKey: getVisitorKey(), merchantId } : { visitorKey: getVisitorKey() };
}
