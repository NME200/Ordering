/**
 * 退款状态（记录在支付单上）。
 *
 * 当前只支持**整单全额退款**：一笔支付最多退款一次。
 * 若将来需要部分退款 / 多次退款，把退款信息拆成独立的 refunds 表即可。
 */
export enum RefundStatus {
  /** 未发生退款 */
  NONE = 0,
  /** 退款处理中 */
  PENDING = 10,
  /** 退款成功 */
  SUCCESS = 20,
  /** 退款失败 */
  FAILED = 30,
}

/** 退款状态中文名 */
export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  [RefundStatus.NONE]: '无退款',
  [RefundStatus.PENDING]: '退款中',
  [RefundStatus.SUCCESS]: '已退款',
  [RefundStatus.FAILED]: '退款失败',
};
