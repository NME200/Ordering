/** 收银台（POS）专用类型 */

/**
 * 结算方式。
 *
 * - `settle`：开单后立即标记线下收款（现金 / 收款码已到手），订单直达「待接单」；
 * - `hold`：只开单，订单停在「待支付」，顾客去掏钱后再到订单通道收款。
 *
 * 两种都要保留：现实里常有「先记账、后收款」的一桌。
 */
export type CheckoutMode = 'settle' | 'hold';

/** 规格弹窗确认后回传的选择结果 */
export interface SpecSelection {
  /** 选中的规格项 ID（同一单选组最多 1 个） */
  specOptionIds: number[];
  quantity: number;
}
