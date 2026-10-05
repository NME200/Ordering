import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../shared/enums/error-code.enum';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../../shared/enums/order-status.enum';

/**
 * 订单状态流转表。
 *
 * **所有状态变更都必须经过 canTransition / assertOrderTransition 校验**，
 * 禁止在业务代码里直接给 order.status 赋值。这样新增状态或调整流程时只需改这一处。
 *
 * 流程图：
 *   待支付 ──支付成功──> 待接单 ──商户接单──> 制作中 ──出餐──> 待取餐 ──完成──> 已完成
 *     │                    │                  │
 *     └──── 取消/超时 ─────┴──── 拒单 ────────┘──> 已取消
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** 判断是否允许从 from 流转到 to */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * 校验状态流转，不合法直接抛业务异常。
 *
 * 供订单模块与支付模块共用：支付回调改订单状态时同样要过这一道，
 * 避免「已取消的订单被回调改成已支付」这类越权流转。
 */
export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw BusinessException.badRequest(
      ErrorCode.ORDER_STATUS_INVALID,
      `订单当前为「${ORDER_STATUS_LABELS[from]}」，不能变更为「${ORDER_STATUS_LABELS[to]}」`,
    );
  }
}
