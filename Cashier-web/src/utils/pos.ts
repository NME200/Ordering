/**
 * 收银台本地工具。
 */

/**
 * 生成开单幂等令牌（后端 `clientToken`，唯一索引）。
 *
 * 收银台用它兜住两类真实事故：
 * - 触屏上连点两次「收款」产生两笔一样的单；
 * - 提交后页面被刷新，重试时不该再落一张新单。
 *
 * `crypto.randomUUID` 只在安全上下文可用，而收银台经常通过局域网 IP
 * （`http://192.168.x.x:5175`）访问，那不是安全上下文，因此必须有回退分支。
 */
export function newClientToken(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  const random = Array.from({ length: 8 }, () => Math.floor(Math.random() * 36).toString(36)).join(
    '',
  );
  return `pos-${Date.now().toString(36)}-${random}`;
}
