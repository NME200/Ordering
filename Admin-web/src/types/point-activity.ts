import type {
  PointActivityRuleType,
  PointActivityScope,
} from '@shared/types/point-activity';

/**
 * 平台端积分活动的**写模型**（读模型与标签在 `@shared/types/point-activity`）。
 *
 * 规则字段摊平在顶层而不是塞 JSON：后端按 `ruleType` 只取用属于它的那几个，
 * 所以提交前必须按类型裁掉另一组（见 views/point-activity/index.vue 的 buildPayload）。
 */

export interface SavePointActivityPayload {
  name: string;
  ruleType: PointActivityRuleType;
  /** 倍率规则：下单加成百分比 */
  orderBonusPercent?: number;
  /** 倍率规则：评价加成百分比 */
  reviewBonusPercent?: number;
  /** 满额返规则：单笔实付门槛（分） */
  thresholdCent?: number;
  /** 满额返规则：达标后额外送的分 */
  bonusPoint?: number;
  /** ISO 时间串，由日期区间控件按现有约定产出 */
  startTime: string;
  endTime: string;
  scopeType: PointActivityScope;
  merchantIds: number[];
  /** 参与菜品 / 分类：两者取并集，都不填表示全部菜品参与 */
  dishIds?: number[];
  categoryIds?: number[];
  /** 参与的就餐方式（0 堂食 / 1 自提 / 2 外卖配送），不填表示不限 */
  diningTypes?: number[];
  perCustomerCap: number;
  bannerTitle?: string;
  bannerDesc?: string;
}

export interface PointActivityQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
  ruleType?: PointActivityRuleType;
}

/** 与后端 shared/enums/point-activity.enum.ts 的上限保持一致（后端仍是唯一准绳） */
export const MAX_BONUS_PERCENT = 200;
export const MAX_BONUS_POINT = 2000;
