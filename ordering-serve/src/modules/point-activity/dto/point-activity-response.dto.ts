import { ApiProperty } from '@nestjs/swagger';
import {
  POINT_ACTIVITY_RULE_TYPE_LABELS,
  POINT_ACTIVITY_SCOPE_LABELS,
  PointActivityRuleType,
  PointActivityScope,
} from '../../../shared/enums/point-activity.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { PointActivity, PointActivityConditions, PointActivityRules } from '../entities/point-activity.entity';

/** 活动相对当前时刻所处的阶段（不落库，每次现算） */
export enum PointActivityPhase {
  PENDING = 'pending',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export const POINT_ACTIVITY_PHASE_LABELS: Record<PointActivityPhase, string> = {
  [PointActivityPhase.PENDING]: '未开始',
  [PointActivityPhase.ACTIVE]: '进行中',
  [PointActivityPhase.ENDED]: '已结束',
};

/**
 * 积分活动出参。
 *
 * `grantedPoint / grantedCustomers` 是发放统计，列表用一条 GROUP BY 批量填，
 * 不在 `from()` 里查库 —— 否则一页 10 条就是 20 次查询。
 */
export class PointActivityResponseDto {
  @ApiProperty({ description: '活动 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '活动名', example: '周末双倍积分' })
  name!: string;

  @ApiProperty({ description: '规则类型', enum: PointActivityRuleType })
  ruleType!: PointActivityRuleType;

  @ApiProperty({ description: '规则类型名称', example: '积分倍率' })
  ruleTypeLabel!: string;

  @ApiProperty({ description: '规则参数（按 ruleType 取用）' })
  rules!: PointActivityRules;

  @ApiProperty({
    description: '命中条件；null 表示不限。菜品名与分类名另由 dishNames / categoryNames 给出',
    nullable: true,
  })
  conditions!: PointActivityConditions | null;

  @ApiProperty({ type: [String], description: '参与菜品的名称，仅供界面回显已选项' })
  dishNames!: string[];

  @ApiProperty({ type: [String], description: '参与分类的名称，仅供界面回显已选项' })
  categoryNames!: string[];

  @ApiProperty({ description: '生效开始时间（含）', type: String, format: 'date-time' })
  startTime!: Date;

  @ApiProperty({ description: '生效结束时间（不含）', type: String, format: 'date-time' })
  endTime!: Date;

  @ApiProperty({ description: '启停状态：0 停用 / 1 启用', enum: CommonStatus })
  status!: CommonStatus;

  @ApiProperty({ description: '所处阶段（与启停无关）：pending / active / ended', enum: PointActivityPhase })
  phase!: PointActivityPhase;

  @ApiProperty({ description: '阶段名称', example: '进行中' })
  phaseLabel!: string;

  @ApiProperty({ description: '商户范围', enum: PointActivityScope })
  scopeType!: PointActivityScope;

  @ApiProperty({ description: '商户范围名称', example: '仅指定商户' })
  scopeTypeLabel!: string;

  @ApiProperty({ description: 'include / exclude 命中的商户 ID 列表', type: [Number] })
  merchantIds!: number[];

  @ApiProperty({ description: '对应商户名，仅供界面显示', type: [String] })
  merchantNames!: string[];

  @ApiProperty({ description: '每人加成上限（分），0 表示不限' })
  perCustomerCap!: number;

  @ApiProperty({ description: '小程序活动条标题', nullable: true })
  bannerTitle!: string | null;

  @ApiProperty({ description: '小程序活动条文案', nullable: true })
  bannerDesc!: string | null;

  @ApiProperty({ description: '创建人（平台账号 ID）', nullable: true })
  createdBy!: number | null;

  @ApiProperty({ type: String, format: 'date-time', description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: '更新时间' })
  updatedAt!: Date;

  @ApiProperty({ description: '本活动已发放的加成积分合计', example: 1200 })
  grantedPoint!: number;

  @ApiProperty({ description: '本活动已参与的顾客数', example: 37 })
  grantedCustomers!: number;

  static from(
    entity: PointActivity,
    now: Date = new Date(),
  ): PointActivityResponseDto {
    const dto = new PointActivityResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.ruleType = entity.ruleType;
    dto.ruleTypeLabel = POINT_ACTIVITY_RULE_TYPE_LABELS[entity.ruleType];
    dto.rules = entity.rules;
    dto.conditions = entity.conditions;
    dto.dishNames = [];
    dto.categoryNames = [];
    dto.startTime = entity.startTime;
    dto.endTime = entity.endTime;
    dto.status = entity.status;
    dto.phase =
      entity.startTime > now
        ? PointActivityPhase.PENDING
        : entity.endTime <= now
          ? PointActivityPhase.ENDED
          : PointActivityPhase.ACTIVE;
    dto.phaseLabel = POINT_ACTIVITY_PHASE_LABELS[dto.phase];
    dto.scopeType = entity.scopeType;
    dto.scopeTypeLabel = POINT_ACTIVITY_SCOPE_LABELS[entity.scopeType];
    dto.merchantIds = entity.merchantIds ?? [];
    dto.merchantNames = [];
    dto.perCustomerCap = entity.perCustomerCap;
    dto.bannerTitle = entity.bannerTitle;
    dto.bannerDesc = entity.bannerDesc;
    dto.createdBy = entity.createdBy;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.grantedPoint = 0;
    dto.grantedCustomers = 0;
    return dto;
  }
}
