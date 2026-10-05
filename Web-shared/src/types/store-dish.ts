import type { DishStatus } from './enums';

/**
 * 门店菜品例外 ——「继承 + 例外」门店菜单的例外侧。
 *
 * 语义：没有例外记录 = 该店完全跟随商户标准菜单；
 * 字段为 null 表示该项仍跟随标准值（不是「值为空」）。
 */
export interface StoreDishOverride {
  storeId: number;
  dishId: number;
  /** 本店是否售卖（覆盖标准上下架，但不能把商户全局下架的菜救活） */
  saleStatus: DishStatus;
  /** 门店售价（分），null = 跟随标准价 */
  price: number | null;
  /** 门店会员价（分），null = 跟随标准会员价 */
  memberPrice: number | null;
  /** 沽清（当日售罄），与「停售」是两回事 */
  soldOut: boolean;
}

/** 设置门店例外的入参：只提交要改的字段，未提交的保持原例外值 */
export interface UpsertStoreDishPayload {
  saleStatus?: DishStatus;
  price?: number | null;
  memberPrice?: number | null;
  soldOut?: boolean;
}
