/**
 * 规格组的选购方式。
 *
 * - 单选（SINGLE）：如「规格：中杯 / 大杯」，同一组内只能选一项；
 * - 多选（MULTI）：如「加料：珍珠 / 椰果 / 布丁」，可选多项。
 */
export enum SpecType {
  /** 单选 */
  SINGLE = 1,
  /** 多选 */
  MULTI = 2,
}

/** 规格组类型中文名 */
export const SPEC_TYPE_LABELS: Record<SpecType, string> = {
  [SpecType.SINGLE]: '单选',
  [SpecType.MULTI]: '多选',
};
