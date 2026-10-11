/**
 * 排队取号枚举（16.x 叫号域）。
 *
 * 队列按「门店 + 桌型 + 营业日」独立编号，号面是 A012 这种可读形式。
 * 顾客侧只读自己的号与前面等待桌数，操作（叫号 / 入座 / 过号）全部在门店侧。
 */

export enum QueueStatus {
  /** 排队中 */
  WAITING = 'waiting',
  /** 已叫号，等待到店 */
  CALLED = 'called',
  /** 已入座 */
  SEATED = 'seated',
  /** 过号（叫号未到） */
  PASSED = 'passed',
  /** 顾客主动取消 */
  CANCELLED = 'cancelled',
}

export const QUEUE_STATUS_VALUES: QueueStatus[] = [
  QueueStatus.WAITING,
  QueueStatus.CALLED,
  QueueStatus.SEATED,
  QueueStatus.PASSED,
  QueueStatus.CANCELLED,
];

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  [QueueStatus.WAITING]: '排队中',
  [QueueStatus.CALLED]: '已叫号',
  [QueueStatus.SEATED]: '已入座',
  [QueueStatus.PASSED]: '已过号',
  [QueueStatus.CANCELLED]: '已取消',
};

/** 桌型：字母前缀 + 当日序号组成号面 */
export interface QueueTableType {
  key: string;
  label: string;
  prefix: string;
  minParty: number;
  maxParty: number;
}

export const QUEUE_TABLE_TYPES: QueueTableType[] = [
  { key: 'small', label: '小桌（1-2人）', prefix: 'A', minParty: 1, maxParty: 2 },
  { key: 'medium', label: '中桌（3-6人）', prefix: 'B', minParty: 3, maxParty: 6 },
  { key: 'large', label: '大桌（7人以上）', prefix: 'C', minParty: 7, maxParty: 20 },
];

export const QUEUE_TABLE_TYPE_KEYS = QUEUE_TABLE_TYPES.map((item) => item.key);

export function resolveTableType(key: string): QueueTableType | undefined {
  return QUEUE_TABLE_TYPES.find((item) => item.key === key);
}

/** 一次取号最多排多少桌，防止把队列当占座工具 */
export const QUEUE_MAX_PARTY_SIZE = 20;
