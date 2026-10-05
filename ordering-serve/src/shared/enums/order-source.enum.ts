/**
 * 订单来源。
 *
 * 用于区分「顾客自己扫码下的单」与「收银台代客开的单」，
 * 便于统计线上/线下占比，也便于对账时筛选线下单。
 */
export enum OrderSource {
  /** C 端扫码点餐（顾客自助下单） */
  SCAN = 'scan',
  /** 收银台代客开单（POS） */
  POS = 'pos',
}

/** 订单来源中文名 */
export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  [OrderSource.SCAN]: '扫码点餐',
  [OrderSource.POS]: '收银台开单',
};
