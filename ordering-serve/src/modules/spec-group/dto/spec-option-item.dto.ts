import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';

/** 一个规格组内的规格项上限（同时约束新增与整体覆盖，避免无限嵌套拖垮下单算价） */
export const MAX_SPEC_OPTIONS = 30;

/**
 * 价格增量的取值范围（分）：±1000 元。
 *
 * 刻意收窄：此前是 ±1 亿元，配合「菜品价可为 0」能直接算出一张 -100 万元的订单，
 * 而金额列是 MySQL `int`，大额增量再乘上份数还会溢出成 500。
 * 餐饮场景里加料/杯型的增量不会超过千元量级；真正的兜底是下单时的
 * 「每行单价必须为正 + 应付金额不得超上限」校验（见 OrderService）。
 */
const PRICE_DIFF_MIN = -100000;
const PRICE_DIFF_MAX = 100000;

/**
 * 规格项入参（作为规格组的嵌套字段提交）。
 *
 * 编辑规格组时：带 id 表示更新已有选项，不带 id 表示新增；
 * 本次未提交的已有选项将被删除。
 */
export class SpecOptionItemDto {
  @ApiPropertyOptional({ description: '规格项 ID；新增时留空，更新时传入', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id 必须为整数' })
  @Min(1, { message: 'id 最小为 1' })
  id?: number;

  @ApiProperty({ description: '选项名称', example: '大杯', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: '规格项名称不能为空' })
  @MaxLength(32, { message: '规格项名称最长 32 个字符' })
  name!: string;

  @ApiPropertyOptional({
    description: '价格增量（分），可为负',
    example: 200,
    default: 0,
    minimum: PRICE_DIFF_MIN,
    maximum: PRICE_DIFF_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'priceDiff 必须为整数（单位：分）' })
  @Min(PRICE_DIFF_MIN, { message: `priceDiff 不能小于 ${PRICE_DIFF_MIN}` })
  @Max(PRICE_DIFF_MAX, { message: `priceDiff 不能大于 ${PRICE_DIFF_MAX}` })
  priceDiff?: number;

  @ApiPropertyOptional({ description: '排序值，越小越靠前；不传按提交顺序', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sort 必须为整数' })
  @Min(0, { message: 'sort 最小为 0' })
  @Max(9999, { message: 'sort 最大为 9999' })
  sort?: number;

  @ApiPropertyOptional({
    description: '状态：0 禁用 / 1 启用',
    enum: CommonStatus,
    default: CommonStatus.ENABLED,
  })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(CommonStatus, { message: 'status 只能是 0（禁用）或 1（启用）' })
  status?: CommonStatus;
}
