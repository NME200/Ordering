import type { CommonStatus, DiningType } from './enums';
import { DINING_TYPE_LABELS } from './enums';

/**
 * 平台积分营销活动的**读模型** —— 与后端 `modules/point-activity/dto/point-activity-response.dto.ts` 对齐。
 *
 * 放共享包是因为平台端与商户端读的是同一个响应结构：
 * 平台走 `GET /point-activities`（全量治理视图），商户走 `GET /point-activities/effective`
 * （按自己 Token 现算的本店生效活动）。写模型（提交表单用的 payload）只有平台端需要，
 * 仍留在 `Admin-web/src/types/point-activity.ts`。
 *
 * 金额与分数一律整数：`bonusPoint / perCustomerCap / thresholdCent` 分别是分与分，
 * 门槛按**实付**判，用券抵掉的部分不算。
 */

export type PointActivityRuleType = 'multiplier' | 'threshold_bonus';

export const RULE_TYPE_LABELS: Record<PointActivityRuleType, string> = {
  multiplier: '积分倍率',
  threshold_bonus: '满额返分',
};

export type PointActivityScope = 'all' | 'include' | 'exclude';

export const SCOPE_LABELS: Record<PointActivityScope, string> = {
  all: '全部商户',
  include: '仅指定商户',
  exclude: '排除指定商户',
};

/** 活动相对当前时刻的阶段，与启停无关：后端每次现算，前端不要自己比时间 */
export type PointActivityPhase = 'pending' | 'active' | 'ended';

export const PHASE_LABELS: Record<PointActivityPhase, string> = {
  pending: '未开始',
  active: '进行中',
  ended: '已结束',
};

/** 阶段配色：只有「进行中」值得显眼 */
export const PHASE_TAG_TYPES: Record<PointActivityPhase, 'primary' | 'success' | 'info'> = {
  pending: 'primary',
  active: 'success',
  ended: 'info',
};

export interface PointActivityRules {
  /** 倍率规则：下单积分在基础分上再加的百分比 */
  orderBonusPercent?: number;
  /** 倍率规则：评价积分在基础分上再加的百分比 */
  reviewBonusPercent?: number;
  /** 满额返规则：单笔实付门槛（分） */
  thresholdCent?: number;
  /** 满额返规则：达标后额外送的分 */
  bonusPoint?: number;
}

/** 命中条件：谁在什么情况下能拿到这份加成。空 / null = 不限 */
export interface PointActivityConditions {
  dishIds?: number[];
  categoryIds?: number[];
  diningTypes?: number[];
}

export interface PointActivity {
  id: number;
  name: string;
  ruleType: PointActivityRuleType;
  ruleTypeLabel: string;
  rules: PointActivityRules;
  conditions: PointActivityConditions | null;
  /** 已选菜品 / 分类的名称，由服务端批量回传，供表单回显与列表摘要 */
  dishNames: string[];
  categoryNames: string[];
  startTime: string;
  endTime: string;
  /** 0 停用 / 1 启用 */
  status: CommonStatus;
  phase: PointActivityPhase;
  phaseLabel: string;
  scopeType: PointActivityScope;
  scopeTypeLabel: string;
  merchantIds: number[];
  /** 商户名由服务端一次批量查回，界面不要自己再拉一遍商户列表 */
  merchantNames: string[];
  /** 同一顾客在本活动可得加成的上限（分），0 表示不限 */
  perCustomerCap: number;
  bannerTitle: string | null;
  bannerDesc: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  /** 净发放分（含退款扣回） */
  grantedPoint: number;
  grantedCustomers: number;
}

/** 规则一栏的口径：直接写成顾客能听懂的算式，而不是参数名 */
export function pointActivityRuleText(row: PointActivity): string {
  if (row.ruleType === 'multiplier') {
    const parts: string[] = [];
    if ((row.rules.orderBonusPercent ?? 0) > 0) {
      parts.push(`下单 +${row.rules.orderBonusPercent}%`);
    }
    if ((row.rules.reviewBonusPercent ?? 0) > 0) {
      parts.push(`评价 +${row.rules.reviewBonusPercent}%`);
    }
    return parts.join(' / ');
  }
  return `满 ${Math.floor((row.rules.thresholdCent ?? 0) / 100)} 元送 ${row.rules.bonusPoint ?? 0} 分`;
}

/** 列出前两个名字，剩下的用「等 N 个」收口：单元格放不下也不该放不下 */
function nameBrief(names: string[]): string {
  if (names.length <= 2) {
    return names.join('、');
  }
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 个`;
}

/**
 * 命中条件摘要：列表与商户只读页共用。
 *
 * 「哪些单算数」是最容易被问的一条（顾客问「我这单怎么没翻倍」），
 * 所以它必须能在界面上一句话读出来，而不是点开编辑才知道。
 */
export function pointActivityConditionText(row: PointActivity): string {
  const conditions = row.conditions;
  const parts: string[] = [];

  if ((conditions?.dishIds?.length ?? 0) > 0) {
    parts.push(`菜品 ${nameBrief(row.dishNames ?? [])}`);
  }
  if ((conditions?.categoryIds?.length ?? 0) > 0) {
    parts.push(`分类 ${nameBrief(row.categoryNames ?? [])}`);
  }
  if ((conditions?.diningTypes?.length ?? 0) > 0) {
    parts.push(
      `仅${(conditions?.diningTypes ?? [])
        .map((type) => DINING_TYPE_LABELS[type as DiningType])
        .join(' / ')}`,
    );
  }
  return parts.length > 0 ? parts.join('，') : '不限';
}
