/**
 * 格式化工具。
 *
 * 金额约定：后端一律以「整数分」传输与存储（见 CODEBUDDY.md 8.3），
 * 展示与录入时在此统一做元 / 分转换，业务代码不得自行乘除 100。
 */

/** 空值占位符 */
export const EMPTY_TEXT = '—';

/** 分 → 元（字符串，保留两位小数） */
export function fenToYuan(fen: number | null | undefined): string {
  if (fen === null || fen === undefined || Number.isNaN(fen)) {
    return EMPTY_TEXT;
  }
  return (fen / 100).toFixed(2);
}

/** 分 → 元（数字，便于参与计算） */
export function fenToYuanNumber(fen: number | null | undefined): number {
  if (fen === null || fen === undefined || Number.isNaN(fen)) {
    return 0;
  }
  return Math.round(fen) / 100;
}

/**
 * 元 → 分。
 * 用四舍五入规避 `1.15 * 100 = 114.99999…` 这类浮点误差。
 */
export function yuanToFen(yuan: number | string | null | undefined): number {
  if (yuan === null || yuan === undefined || yuan === '') {
    return 0;
  }
  const value = typeof yuan === 'string' ? Number(yuan) : yuan;
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.round(value * 100);
}

/** 带符号的价格增量展示，例如 +2.00 / -1.50 */
export function formatPriceDiff(fen: number | null | undefined): string {
  if (fen === null || fen === undefined || Number.isNaN(fen)) {
    return EMPTY_TEXT;
  }
  const sign = fen > 0 ? '+' : fen < 0 ? '-' : '';
  return `${sign}${(Math.abs(fen) / 100).toFixed(2)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 格式化为 `YYYY-MM-DD HH:mm` */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return EMPTY_TEXT;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** 格式化为 `YYYY-MM-DD` */
export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return EMPTY_TEXT;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 到期时间的业务语义展示。
 * 已过期返回 negative，便于表格用不同颜色区分。
 */
export function describeExpireAt(value: string | null | undefined): {
  text: string;
  expired: boolean;
} {
  const date = toDate(value ?? null);
  if (!date) {
    return { text: '不限', expired: false };
  }
  return { text: formatDate(date), expired: date.getTime() < Date.now() };
}

/** 纯文本兜底：null / 空串统一显示占位符 */
export function orEmpty(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? EMPTY_TEXT : value;
}
