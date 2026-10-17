/**
 * 平台积分营销活动的枚举与上限。
 *
 * 活动规则**只有平台能配**（见 `permission-map.ts` 与控制器上的 `@Roles`）：
 * 它决定的是「全体顾客拿多少分」，与装修配置、活动弹窗同一档，
 * 一旦下放到商户侧，一家店就能把自己家的补贴成本摊到整个平台的积分口径上。
 */

/** 规则类型：两种都能在单笔结算时算完，不依赖跨单累计 */
export enum PointActivityRuleType {
  /** 倍率：在常规积分上加一个百分比（下单分与评价分分别配） */
  MULTIPLIER = 'multiplier',
  /** 满额返：单笔实付满 X 元，额外送 Y 分 */
  THRESHOLD_BONUS = 'threshold_bonus',
}

export const POINT_ACTIVITY_RULE_TYPE_LABELS: Record<PointActivityRuleType, string> = {
  [PointActivityRuleType.MULTIPLIER]: '积分倍率',
  [PointActivityRuleType.THRESHOLD_BONUS]: '满额返分',
};

/** 商户范围。平台一套规则，但落地要能只给试点商户开 */
export enum PointActivityScope {
  ALL = 'all',
  INCLUDE = 'include',
  EXCLUDE = 'exclude',
}

export const POINT_ACTIVITY_SCOPE_LABELS: Record<PointActivityScope, string> = {
  [PointActivityScope.ALL]: '全部商户',
  [PointActivityScope.INCLUDE]: '仅指定商户',
  [PointActivityScope.EXCLUDE]: '排除指定商户',
};

/**
 * 加成百分比上限（在基础分上再加多少个百分点）。
 *
 * 200 即最高 3 倍。写死上限而不是「随便填」：倍率乘的是真实资金对应的积分，
 * 配错一个数量级就是平台自己印了一堆能换成东西的分数，且没有任何一张表能追回。
 */
export const POINT_ACTIVITY_MAX_BONUS_PERCENT = 200;

/** 满额返单次赠送上限（分） */
export const POINT_ACTIVITY_MAX_BONUS_POINT = 2000;

/** 每人本期可得加成上限（分）。0 表示不限，但界面要提示风险 */
export const POINT_ACTIVITY_UNLIMITED_CAP = 0;

/**
 * 命中条件的列表上限。
 *
 * 刻意设上限而不是随便填：条件列表要在每次支付回调时与订单明细比一遍，
 * 一个挂了几百个菜品 ID 的活动既没有真实运营场景，又会把这条热路径拖慢。
 */
export const POINT_ACTIVITY_MAX_DISH_IDS = 50;
export const POINT_ACTIVITY_MAX_CATEGORY_IDS = 20;
