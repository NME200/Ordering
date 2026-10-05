import type { PublicOrder } from '@/types/api';

/** 与后端 OrderStatus 对齐的常量（取值 10~60，按流程递增） */
export const Status = {
  PENDING: 10,
  PAID: 20,
  PREPARING: 30,
  READY: 40,
  COMPLETED: 50,
  CANCELLED: 60,
} as const;

export interface TimelineStep {
  label: string;
  /** 发生时间，未发生时为空串 */
  time: string;
  done: boolean;
}

/**
 * 订单时间轴。
 *
 * 公开查单接口刻意不给 `acceptedAt`（那是商户侧字段），
 * 所以「接单」这一步只按状态推进显示，不显示时间。
 */
export function timeline(order: PublicOrder): TimelineStep[] {
  const reached = (at: number): boolean => order.status >= at && order.status !== Status.CANCELLED;
  return [
    { label: '下单', time: order.createdAt, done: true },
    { label: '支付成功', time: order.paidAt ?? '', done: reached(Status.PAID) },
    { label: '商家接单', time: '', done: reached(Status.PREPARING) },
    { label: '已出餐', time: order.readyAt ?? '', done: reached(Status.READY) },
    { label: '完成', time: order.completedAt ?? '', done: reached(Status.COMPLETED) },
  ];
}

/** 还在流程中的单才需要继续轮询 */
export function isLive(status: number): boolean {
  return status === Status.PENDING || status === Status.PAID || status === Status.PREPARING || status === Status.READY;
}
