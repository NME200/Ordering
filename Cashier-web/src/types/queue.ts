import type { PaginationQuery } from '@shared/types/api';

/**
 * 排队叫号 —— 与后端 `modules/queue` 的出入参对齐。
 *
 * 队列按「门店 + 桌型 + 营业日」独立编号，号面形如 A012。
 * 状态机由服务端硬校验，界面只能给「当前状态允许的下一步」，
 * 多出来的按钮点了也只会收到 400。
 */

/** 排队状态 */
export type QueueStatus = 'waiting' | 'called' | 'seated' | 'passed' | 'cancelled';

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  waiting: '排队中',
  called: '已叫号',
  seated: '已入座',
  passed: '已过号',
  cancelled: '已取消',
};

export const QUEUE_STATUS_TAG_TYPES: Record<
  QueueStatus,
  'primary' | 'success' | 'info' | 'warning' | 'danger'
> = {
  waiting: 'warning',
  called: 'danger',
  seated: 'success',
  passed: 'info',
  cancelled: 'info',
};

/** 桌型：字母前缀 + 当日序号组成号面，人数范围与后端一致（超范围服务端会拒） */
export interface QueueTableType {
  key: string;
  label: string;
  shortLabel: string;
  prefix: string;
  minParty: number;
  maxParty: number;
}

export const QUEUE_TABLE_TYPES: QueueTableType[] = [
  {
    key: 'small',
    label: '小桌（1-2人）',
    shortLabel: '小桌',
    prefix: 'A',
    minParty: 1,
    maxParty: 2,
  },
  {
    key: 'medium',
    label: '中桌（3-6人）',
    shortLabel: '中桌',
    prefix: 'B',
    minParty: 3,
    maxParty: 6,
  },
  {
    key: 'large',
    label: '大桌（7人以上）',
    shortLabel: '大桌',
    prefix: 'C',
    minParty: 7,
    maxParty: 20,
  },
];

export function resolveTableType(key: string): QueueTableType | undefined {
  return QUEUE_TABLE_TYPES.find((item) => item.key === key);
}

/** 一次取号最多排多少桌，与后端 QUEUE_MAX_PARTY_SIZE 同一条线 */
export const QUEUE_MAX_PARTY_SIZE = 20;

/** 队列行（后端 QueueDto） */
export interface QueueRow {
  id: number;
  storeId: number;
  storeName: string;
  /** 营业日 YYYY-MM-DD */
  bizDate: string;
  tableType: string;
  tableTypeLabel: string;
  queueNo: string;
  partySize: number;
  status: QueueStatus;
  statusLabel: string;
  createdAt: string;
  calledAt: string | null;
  seatedAt: string | null;
  /**
   * 前面还有几桌。
   *
   * ⚠️ 门店侧列表接口（`GET /queues`）一律返回 0，只有单条推进时才带真实值，
   * 所以叫号台不拿它做展示，否则整屏都是「前面 0 桌」的假数据。
   */
  ahead: number;
  /** 当前正在叫到的号（同桌型） */
  callingNo: string | null;
}

/** 队列查询：当日全量，接口返回数组而不是分页体 */
export interface QueueQuery {
  storeId?: number;
  status?: QueueStatus;
  /** 营业日 YYYY-MM-DD，不传即今天 */
  bizDate?: string;
}

/** 代客取号入参 */
export interface QueueTakePayload {
  storeId: number;
  tableType: string;
  partySize: number;
  phone?: string;
}

/** 分页参数在本域只用来放宽单次返回条数上限（服务端 take 用 pageSize） */
export type QueueListQuery = QueueQuery & Partial<PaginationQuery>;
