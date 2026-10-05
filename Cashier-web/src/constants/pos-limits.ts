/**
 * 收银台的开单边界 —— 与后端 `modules/order/constants/order-limits.ts` 一致。
 *
 * 这里重复声明一次是为了**在本地就拦下**注定被后端拒绝的请求：
 * 收银台上误触连点攒出 51 行明细，等到提交才报 80003/参数错误，
 * 顾客在旁边等着是很糟的体验。后端仍是唯一的权威校验方。
 */

/** 单笔订单最多菜品行数 */
export const MAX_ORDER_LINES = 50;

/** 单行明细最多份数 */
export const MAX_QUANTITY_PER_LINE = 999;

/** 一屏内快速加量的步长 */
export const QUANTITY_STEP = 1;
