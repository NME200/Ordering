/**
 * 订单状态。
 *
 * 状态流转见 modules/order/constants/order-status-flow.ts，
 * 任何状态变更都必须经过该校验，禁止在业务代码里直接赋值。
 *
 * 取值按流程顺序递增，便于「大于某状态」这类范围查询。
 */
export enum OrderStatus {
  /** 待支付：下单后未付款 */
  PENDING_PAYMENT = 10,
  /** 已支付 / 待接单 */
  PAID = 20,
  /** 制作中：商户已接单 */
  PREPARING = 30,
  /** 待取餐：商户已出餐 */
  READY = 40,
  /** 已完成 */
  COMPLETED = 50,
  /** 已取消 */
  CANCELLED = 60,
}

/** 订单状态中文名 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: '待支付',
  [OrderStatus.PAID]: '待接单',
  [OrderStatus.PREPARING]: '制作中',
  [OrderStatus.READY]: '待取餐',
  [OrderStatus.COMPLETED]: '已完成',
  [OrderStatus.CANCELLED]: '已取消',
};

/** 订单状态枚举全部取值（按流程顺序），供 DTO 校验与统计使用 */
export const ORDER_STATUS_VALUES: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];
