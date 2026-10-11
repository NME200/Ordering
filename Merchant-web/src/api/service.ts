import type { PaginatedData } from '@shared/types/api';
import { request } from '@shared/utils/request';
import type { ServiceMessage, ServiceSession, ServiceSessionQuery } from '../types/service';

/**
 * 客服工作台接口（商户侧）。
 *
 * 消息是轮询模型（后端同源设计：没上 WebSocket），所以列表刷新会高频触发。
 * 轮询请求一律带 `silent`：网络抖一下不该每 5 秒弹一次错误提示。
 */

/** 会话列表（按最后一条消息时间倒序，含 unread / lastMessage / 顾客称呼与打码手机号） */
export function fetchServiceSessions(
  params: ServiceSessionQuery,
  silent = false,
): Promise<PaginatedData<ServiceSession>> {
  return request<PaginatedData<ServiceSession>>({ url: '/service/sessions', params, silent });
}

/** 会话详情：全量消息 + 会话本身，服务端顺带清客服侧未读 */
export function fetchServiceSession(
  id: number,
  silent = false,
): Promise<{ messages: ServiceMessage[]; session: ServiceSession }> {
  return request<{ messages: ServiceMessage[]; session: ServiceSession }>({
    url: `/service/sessions/${id}`,
    silent,
  });
}

/** 以客服身份回复 */
export function replyServiceSession(id: number, content: string): Promise<ServiceMessage> {
  return request<ServiceMessage>({
    url: `/service/sessions/${id}/reply`,
    method: 'post',
    data: { content },
  });
}

/** 结束会话 */
export function closeServiceSession(id: number): Promise<void> {
  return request<void>({ url: `/service/sessions/${id}/close`, method: 'put' });
}
