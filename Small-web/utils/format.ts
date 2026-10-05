/** 金额与时间的展示层格式化：接口里全是整数分与 ISO 串，只在这里转成人看的形状 */

/** 分 → 「38.00」。金额运算一律用分，转元只发生在渲染这一层 */
export function yuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

/** 收银台大数字：整数位与小数位拆开，小数部分用小字号 */
export function splitYuan(fen: number): { int: string; dec: string } {
  const [int, dec] = yuan(fen).split('.');
  return { int, dec: `.${dec}` };
}

/** 后端返回的 ISO 串在 iOS 上不能直接 new Date，必须先把 `-` 换成 `/` */
function toDate(value: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const safe = new Date(value.replace(/-/g, '/').replace('T', ' ').replace(/\.\d+Z?$/, ''));
  return Number.isNaN(safe.getTime()) ? null : safe;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 「14:05」 */
export function clock(value: string | Date | null): string {
  const date = toDate(value);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '—';
}

/** 「10-05 14:05」，我的订单列表用 */
export function dayClock(value: string | Date | null): string {
  const date = toDate(value);
  if (!date) return '—';
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clock(date)}`;
}
