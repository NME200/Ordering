/**
 * 门店营业状态。
 * 与门店启用状态（CommonStatus）区分：禁用是管理动作，打烊是经营动作。
 */
export enum BusinessStatus {
  /** 打烊 */
  CLOSED = 0,
  /** 营业中 */
  OPEN = 1,
}

/** 营业状态中文名 */
export const BUSINESS_STATUS_LABELS: Record<BusinessStatus, string> = {
  [BusinessStatus.CLOSED]: '打烊',
  [BusinessStatus.OPEN]: '营业中',
};
