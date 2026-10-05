/**
 * 令牌与登录态的本地存储。
 *
 * 只做「存取」这一件事，不依赖 Pinia / Router，
 * 以免与请求层、路由守卫形成循环依赖。
 */

/**
 * 令牌存储键名。
 *
 * 三端（平台端 / 商户端 / 收银端）可能在同一浏览器里同时使用，
 * **必须各用各的键**，否则登录商户后台会把平台端的登录态覆盖掉。
 * 各工程在入口调用 `configureTokenKey()` 指定，例如：
 * - Admin-web    → `ordering_admin_token`
 * - Merchant-web → `ordering_merchant_token`
 * - Cashier-web  → `ordering_cashier_token`
 */
let tokenKey = 'ordering_token';

/** 由各工程在应用启动时指定令牌存储键名（须早于任何请求 / 会话初始化） */
export function configureTokenKey(key: string): void {
  tokenKey = key;
}

/** 读取访问令牌 */
export function getToken(): string {
  return localStorage.getItem(tokenKey) ?? '';
}

/** 写入访问令牌 */
export function setToken(token: string): void {
  localStorage.setItem(tokenKey, token);
}

/** 清除访问令牌 */
export function clearToken(): void {
  localStorage.removeItem(tokenKey);
}
