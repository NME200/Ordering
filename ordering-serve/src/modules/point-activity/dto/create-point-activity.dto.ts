import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DINING_TYPE_VALUES } from '../../../shared/enums/dining-type.enum';
import {
  POINT_ACTIVITY_MAX_BONUS_PERCENT,
  POINT_ACTIVITY_MAX_BONUS_POINT,
  POINT_ACTIVITY_MAX_CATEGORY_IDS,
  POINT_ACTIVITY_MAX_DISH_IDS,
  PointActivityRuleType,
  PointActivityScope,
} from '../../../shared/enums/point-activity.enum';

/**
 * 新建积分活动入参。
 *
 * 规则字段刻意摊平而不是塞一个自由 JSON：装修配置那套「按组件类型校验 props」
 * 之所以要做整棵树的校验器，是因为组件天然异构；活动只有两种规则，
 * 摊平之后 `@Max` 这类上限能直接写在字段上，界面表单也少一层拼装。
 *
 * **哪些字段属于哪种规则由 Service 判**（`POINT_ACTIVITY_RULE_INVALID`），
 * 因为「倍率两个百分比都填 0」这种错不是格式错，是配置本身没有意义。
 */
export class CreatePointActivityDto {
  @ApiProperty({ description: '活动名，顾客与店员看到的都是它', maxLength: 64, example: '周末双倍积分' })
  @IsString()
  @MaxLength(64, { message: '活动名最长 64 个字符' })
  name!: string;

  @ApiProperty({ description: '规则类型', enum: PointActivityRuleType })
  @IsEnum(PointActivityRuleType, { message: 'ruleType 取值不合法' })
  ruleType!: PointActivityRuleType;

  @ApiPropertyOptional({
    description: '倍率规则：下单积分在基础分上再加的百分比（0 ~ 200）',
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orderBonusPercent 必须为整数' })
  @Min(0, { message: 'orderBonusPercent 不能为负' })
  @Max(POINT_ACTIVITY_MAX_BONUS_PERCENT, {
    message: `orderBonusPercent 最大 ${POINT_ACTIVITY_MAX_BONUS_PERCENT}`,
  })
  orderBonusPercent?: number;

  @ApiPropertyOptional({
    description: '倍率规则：评价积分在基础分上再加的百分比（0 ~ 200）',
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'reviewBonusPercent 必须为整数' })
  @Min(0, { message: 'reviewBonusPercent 不能为负' })
  @Max(POINT_ACTIVITY_MAX_BONUS_PERCENT, {
    message: `reviewBonusPercent 最大 ${POINT_ACTIVITY_MAX_BONUS_PERCENT}`,
  })
  reviewBonusPercent?: number;

  @ApiPropertyOptional({ description: '满额返规则：单笔实付满多少分触发', example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'thresholdCent 必须为整数' })
  @Min(1, { message: 'thresholdCent 至少为 1 分' })
  thresholdCent?: number;

  @ApiPropertyOptional({ description: '满额返规则：达标后额外送多少分', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'bonusPoint 必须为整数' })
  @Min(1, { message: 'bonusPoint 至少为 1 分' })
  @Max(POINT_ACTIVITY_MAX_BONUS_POINT, {
    message: `bonusPoint 最大 ${POINT_ACTIVITY_MAX_BONUS_POINT}`,
  })
  bonusPoint?: number;

  @ApiProperty({ description: '生效开始时间（含，ISO 8601）', example: '2026-11-01T00:00:00.000Z' })
  @IsDateString({}, { message: 'startTime 需为合法的 ISO 8601 时间字符串' })
  startTime!: string;

  @ApiProperty({ description: '生效结束时间（不含，ISO 8601）', example: '2026-11-04T00:00:00.000Z' })
  @IsDateString({}, { message: 'endTime 需为合法的 ISO 8601 时间字符串' })
  endTime!: string;

  @ApiPropertyOptional({
    description: '商户范围，默认全部商户',
    enum: PointActivityScope,
    default: PointActivityScope.ALL,
  })
  @IsOptional()
  @IsEnum(PointActivityScope, { message: 'scopeType 取值不合法' })
  scopeType?: PointActivityScope;

  @ApiPropertyOptional({
    description: 'include / exclude 时命中的商户 ID 列表；all 时不传',
    type: [Number],
  })
  @IsOptional()
  @IsArray({ message: 'merchantIds 必须为数组' })
  @ArrayMaxSize(200, { message: '单个活动最多指定 200 家商户' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'merchantIds 元素必须为整数' })
  merchantIds?: number[];

  @ApiPropertyOptional({
    description: '参与的菜品 ID 列表（与分类列表取并集；都不填表示全部菜品参与）',
    type: [Number],
  })
  @IsOptional()
  @IsArray({ message: 'dishIds 必须为数组' })
  @ArrayMaxSize(POINT_ACTIVITY_MAX_DISH_IDS, {
    message: `单个活动最多指定 ${POINT_ACTIVITY_MAX_DISH_IDS} 个菜品，太多既没法向顾客解释也会拖慢发分热路径`,
  })
  @Type(() => Number)
  @IsInt({ each: true, message: 'dishIds 元素必须为整数' })
  dishIds?: number[];

  @ApiPropertyOptional({ description: '参与的菜品分类 ID 列表（按菜品当前分类判）', type: [Number] })
  @IsOptional()
  @IsArray({ message: 'categoryIds 必须为数组' })
  @ArrayMaxSize(POINT_ACTIVITY_MAX_CATEGORY_IDS, {
    message: `单个活动最多指定 ${POINT_ACTIVITY_MAX_CATEGORY_IDS} 个分类`,
  })
  @Type(() => Number)
  @IsInt({ each: true, message: 'categoryIds 元素必须为整数' })
  categoryIds?: number[];

  @ApiPropertyOptional({
    description: '参与的就餐方式：0 堂食 / 1 自提 / 2 外卖配送。不填表示不限',
    type: [Number],
  })
  @IsOptional()
  @IsArray({ message: 'diningTypes 必须为数组' })
  @ArrayMaxSize(3, { message: '就餐方式最多三项' })
  @Type(() => Number)
  @IsIn(DINING_TYPE_VALUES, { each: true, message: 'diningTypes 只能取 0 / 1 / 2' })
  diningTypes?: number[];

  @ApiPropertyOptional({
    description: '同一顾客在本活动可得加成的上限（分），0 表示不限',
    example: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'perCustomerCap 必须为整数' })
  @Min(0, { message: 'perCustomerCap 不能为负' })
  perCustomerCap?: number;

  @ApiPropertyOptional({ description: '小程序活动条标题，留空则 C 端不显示活动条', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '活动条标题最长 64 个字符' })
  bannerTitle?: string;

  @ApiPropertyOptional({ description: '小程序活动条说明文案', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '活动条文案最长 200 个字符' })
  bannerDesc?: string;
}
