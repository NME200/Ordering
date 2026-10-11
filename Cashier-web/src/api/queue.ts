import { request } from '@shared/utils/request';
import type { QueueRow, QueueStatus } from '../types/queue';

/**
 * 排队叫号接口（收银台）。
 *
 * 队列范围由服务端按 Token 强制：门店绑定角色（收银员 / 门店管理员）传的
 * storeId 会被忽略，一律落到本人所属门店。
 */

/** 当日队列（叫号台）。返回数组而非分页对象 */
export function fetchQueues(params: {
  storeId?: number;
  status?: QueueStatus;
  bizDate?: string;
  pageSize?: number;
}): Promise<QueueRow[]> {
  return request<QueueRow[]>({ url: '/queues', params });
}

/** 门店代客取号（到店没扫码 / 电话订位） */
export function takeQueue(data: {
  storeId: number;
  tableType: string;
  partySize: number;
  phone?: string;
}): Promise<QueueRow> {
  return request<QueueRow>({ url: '/queues', method: 'post', data });
}

/** 叫号：waiting → called */
export function callQueue(id: number): Promise<QueueRow> {
  return request<QueueRow>({ url: `/queues/${id}/call`, method: 'put' });
}

/** 入座：called → seated（终态） */
export function seatQueue(id: number): Promise<QueueRow> {
  return request<QueueRow>({ url: `/queues/${id}/seat`, method: 'put' });
}

/** 过号：waiting / called → passed */
export function passQueue(id: number): Promise<QueueRow> {
  return request<QueueRow>({ url: `/queues/${id}/pass`, method: 'put' });
}

/** 过号召回：passed → waiting，回队尾并换发新号面，不插回原位 */
export function recallQueue(id: number): Promise<QueueRow> {
  return request<QueueRow>({ url: `/queues/${id}/recall`, method: 'put' });
}
