import type { PaginationQuery } from '@shared/types/api';

/**
 * 在线客服 —— 与后端 `modules/service` 的出入参对齐。
 *
 * 会话按「顾客 × 商户」一条，消息走**轮询**而非长连接（后端同源设计），
 * 所以工作台的未读数必须靠定时器刷新，不能指望它自己变。
 */

/** 会话状态 */
export type ServiceSessionStatus = 'open' | 'replied' | 'closed';

export const SERVICE_SESSION_STATUS_LABELS: Record<ServiceSessionStatus, string> = {
  open: '待回复',
  replied: '已回复',
  closed: '已结束',
};

export const SERVICE_SESSION_STATUS_OPTIONS: { label: string; value: ServiceSessionStatus }[] = [
  { label: '待回复', value: 'open' },
  { label: '已回复', value: 'replied' },
  { label: '已结束', value: 'closed' },
];

export const SERVICE_SESSION_STATUS_TAG_TYPES: Record<
  ServiceSessionStatus,
  'primary' | 'success' | 'info' | 'warning' | 'danger'
> = {
  open: 'danger',
  replied: 'primary',
  closed: 'info',
};

/** 会话行（后端 ServiceSessionDto） */
export interface ServiceSession {
  id: number;
  merchantId: number;
  storeId: number | null;
  orderId: number | null;
  status: ServiceSessionStatus;
  lastMessage: string | null;
  lastMessageAt: string | null;
  /** 客服端未读数 */
  unread: number;
  customerName?: string;
  /** 已打码 */
  customerPhone?: string | null;
}

/** 消息（后端 ServiceMessageDto） */
export interface ServiceMessage {
  id: number;
  /** customer / staff */
  sender: string;
  senderName: string;
  content: string;
  orderNo: string | null;
  createdAt: string;
}

/** 会话列表查询：merchantId 由 Token 决定，商户侧一律不传 */
export interface ServiceSessionQuery extends PaginationQuery {
  storeId?: number;
  status?: ServiceSessionStatus;
}
