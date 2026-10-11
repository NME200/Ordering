/**
 * 就餐方式。
 *
 * 只用于**记录与展示**：三种方式的菜品与价格完全一致，起送价 / 立减这类
 * 差异需要促销与配送费模型，后端目前没有任何一张表支撑，所以刻意不做。
 */
export enum DiningType {
  /** 堂食（扫码点餐默认） */
  DINE_IN = 0,
  /** 到店自提 */
  PICKUP = 1,
  /** 外卖配送 */
  DELIVERY = 2,
}

export const DINING_TYPE_LABELS: Record<DiningType, string> = {
  [DiningType.DINE_IN]: '堂食',
  [DiningType.PICKUP]: '自提',
  [DiningType.DELIVERY]: '外卖配送',
};

/** 枚举全部取值，供 DTO 校验使用 */
export const DINING_TYPE_VALUES: DiningType[] = [
  DiningType.DINE_IN,
  DiningType.PICKUP,
  DiningType.DELIVERY,
];
