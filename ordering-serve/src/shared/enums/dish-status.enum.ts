/**
 * 菜品上下架状态。
 * 与「沽清（售罄）」区分：沽清是临时状态，后续由订单/库存模块管理。
 */
export enum DishStatus {
  /** 下架（不在菜单展示、不可下单） */
  OFF_SHELF = 0,
  /** 上架 */
  ON_SHELF = 1,
}

/** 菜品状态中文名 */
export const DISH_STATUS_LABELS: Record<DishStatus, string> = {
  [DishStatus.OFF_SHELF]: '已下架',
  [DishStatus.ON_SHELF]: '已上架',
};
