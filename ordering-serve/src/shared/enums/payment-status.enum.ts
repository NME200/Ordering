/**
 * 支付单状态。
 *
 * 一笔订单可能产生多张支付单（用户取消后重试等），
 * 但同一时刻只允许一张处于 PENDING。
 */
export enum PaymentStatus {
  /** 待支付：已向渠道下单，等待用户付款 / 回调 */
  PENDING = 10,
  /** 支付成功 */
  SUCCESS = 20,
  /** 支付失败 */
  FAILED = 30,
  /** 已关闭：超时或订单取消导致未支付 */
  CLOSED = 40,
}

/** 支付单状态中文名 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: '待支付',
  [PaymentStatus.SUCCESS]: '支付成功',
  [PaymentStatus.FAILED]: '支付失败',
  [PaymentStatus.CLOSED]: '已关闭',
};
