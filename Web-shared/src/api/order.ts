import type { PaginatedData } from '../types/api';
import type {
  CancelOrderPayload,
  CreatePosOrderPayload,
  Order,
  OrderQuery,
  OrderStatusCount,
} from '../types/order';
import { request } from '../utils/request';

/**
 * 订单接口。
 *
 * 注意：`POST /orders`（C 端扫码下单）与 `POST /orders/:id/pay`（发起在线支付）
 * 属于**公开接口**，由 Small-web 小程序调用，管理后台不涉及，这里不封装。
 */

/** 分页查询订单 */
export function fetchOrders(params: OrderQuery): Promise<PaginatedData<Order>> {
  return request<PaginatedData<Order>>({ url: '/orders', params });
}

/** 订单状态计数（商户端概览用，不分页） */
export function fetchOrderStatusCount(params?: {
  merchantId?: number;
  storeId?: number;
}): Promise<OrderStatusCount[]> {
  return request<OrderStatusCount[]>({ url: '/orders/status-count', params });
}

/** 查询订单详情（含明细与规格快照） */
export function fetchOrder(id: number): Promise<Order> {
  return request<Order>({ url: `/orders/${id}` });
}

/** 收银台代客开单（POS） */
export function createPosOrder(data: CreatePosOrderPayload): Promise<Order> {
  return request<Order>({ url: '/orders/pos', method: 'post', data });
}

/** 标记线下收款（现金 / 收款码），直接置为已支付 */
export function markOrderOfflinePaid(id: number): Promise<Order> {
  return request<Order>({ url: `/orders/${id}/offline-pay`, method: 'post', data: {} });
}

/** 商户接单 */
export function acceptOrder(id: number): Promise<Order> {
  return request<Order>({ url: `/orders/${id}/accept`, method: 'put' });
}

/** 出餐（通知取餐） */
export function readyOrder(id: number): Promise<Order> {
  return request<Order>({ url: `/orders/${id}/ready`, method: 'put' });
}

/** 完成订单 */
export function completeOrder(id: number): Promise<Order> {
  return request<Order>({ url: `/orders/${id}/complete`, method: 'put' });
}

/** 取消订单 / 拒单 */
export function cancelOrder(id: number, data: CancelOrderPayload): Promise<Order> {
  return request<Order>({ url: `/orders/${id}/cancel`, method: 'put', data });
}
