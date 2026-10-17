/**
 * 顾客账号与会员资产枚举（10.x 顾客域）。
 *
 * 账号建模口径：`customers` 是**平台级账号**（一个设备/手机号一条），
 * 而积分、余额、成长值、等级是**商户维度**的会员资产，落在 `member_profiles`。
 * 理由：本项目是多商户 SaaS 的平台小程序，顾客会在好几个品牌下点单，
 * 把储值金和等级挂在平台账号上等于跨租户共用一笔钱，账务与合规都过不去。
 */

/** 性别：只做展示与生日/纪念日营销，不参与任何资金判断 */
export enum CustomerGender {
  UNKNOWN = 0,
  MALE = 1,
  FEMALE = 2,
}

export const CUSTOMER_GENDER_LABELS: Record<CustomerGender, string> = {
  [CustomerGender.UNKNOWN]: '未填写',
  [CustomerGender.MALE]: '男',
  [CustomerGender.FEMALE]: '女',
};

/** 会员等级：按成长值自动升级，成长值 = 累计实付元数（向下取整） */
export interface MemberLevel {
  /** 等级序号，从 0 开始 */
  level: number;
  /** 等级名，直接展示给顾客 */
  name: string;
  /** 达到该等级所需的最低成长值 */
  needGrowth: number;
}

/**
 * 等级阶梯。
 *
 * 写死在代码里而不是配置表：等级名与门槛是品牌承诺，改它要同步改权益与文案，
 * 让运营在后台随手改一个数字会造成「已升到黄金的人权益对不上」。
 */
export const MEMBER_LEVELS: MemberLevel[] = [
  { level: 0, name: '普通会员', needGrowth: 0 },
  { level: 1, name: '白银会员', needGrowth: 100 },
  { level: 2, name: '黄金会员', needGrowth: 500 },
  { level: 3, name: '钻石会员', needGrowth: 2000 },
];

/** 成长值 → 等级（取满足门槛的最高一级） */
export function resolveMemberLevel(growth: number): MemberLevel {
  let current = MEMBER_LEVELS[0];
  for (const item of MEMBER_LEVELS) {
    if (growth >= item.needGrowth) {
      current = item;
    }
  }
  return current;
}

/** 下一等级；已是最高级时返回 null，前端据此决定进度条画不画 */
export function nextMemberLevel(level: number): MemberLevel | null {
  return MEMBER_LEVELS.find((item) => item.level === level + 1) ?? null;
}

/**
 * 积分与成长值流水原因。
 *
 * 流水表用 `reason + orderId` 做幂等：支付回调可能重复到达，
 * 没有唯一约束的话一笔订单能加两次积分。
 *
 * `activity*` 三个值是**平台积分活动的加成分**，与常规分分开各记一条：
 * 合在一条里就没法回答「这轮平台补贴了多少分」，退款时也只会按当前规则重算，
 * 而规则在活动期间被改过的话历史单就对不上账了。
 */
export enum PointReason {
  /** 下单实付赠送 */
  ORDER = 'order',
  /** 退款扣回 */
  REFUND = 'refund',
  /** 评价赠送 */
  REVIEW = 'review',
  /** 运营手动调整 */
  MANUAL = 'manual',
  /** 积分活动：下单实付的加成部分 */
  ACTIVITY = 'activity',
  /** 积分活动：评价赠送的加成部分 */
  ACTIVITY_REVIEW = 'activity_review',
  /** 积分活动：退款时按当初发放的原额扣回 */
  ACTIVITY_REVOKE = 'activity_revoke',
}

export const POINT_REASON_LABELS: Record<PointReason, string> = {
  [PointReason.ORDER]: '下单赠送',
  [PointReason.REFUND]: '退款扣回',
  [PointReason.REVIEW]: '评价赠送',
  [PointReason.MANUAL]: '人工调整',
  [PointReason.ACTIVITY]: '活动加成',
  [PointReason.ACTIVITY_REVIEW]: '活动加成',
  [PointReason.ACTIVITY_REVOKE]: '活动扣回',
};

/** 每实付 1 元累计的成长值与积分（同比例，便于对顾客解释「1 元 = 1 分」） */
export const GROWTH_PER_YUAN = 1;
export const POINT_PER_YUAN = 1;
/** 提交一条评价送的积分 */
export const REVIEW_POINT = 5;

/** 「我的」页订单四桶。与后端订单状态是**多对一**关系，别当成状态枚举 */
export const ORDER_BUCKETS = ['unpaid', 'processing', 'review', 'refund'] as const;
export type OrderBucket = (typeof ORDER_BUCKETS)[number];

export const ORDER_BUCKET_LABELS: Record<OrderBucket, string> = {
  unpaid: '待付款',
  processing: '待使用',
  review: '待评价',
  refund: '退款售后',
};
