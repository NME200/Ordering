const VISITOR_KEY = 'visitor-key-v1';

/**
 * 设备标识。
 *
 * 顾客端现在没有账号（C 端只有订单号 + payToken 双因子），而弹窗频次、
 * 将来的「我的订单」都要有个主体，所以在本地生成一个稳定 id：
 * 卸载重装会换，这是本机口径的既成事实，界面上不假装能跨设备认人。
 */
export function getVisitorKey(): string {
  const cached = uni.getStorageSync(VISITOR_KEY);
  if (typeof cached === 'string' && cached.length >= 8) return cached;

  const random = Math.random().toString(36).slice(2, 10);
  const key = `v-${Date.now().toString(36)}${random}`.slice(0, 32);
  uni.setStorageSync(VISITOR_KEY, key);
  return key;
}
