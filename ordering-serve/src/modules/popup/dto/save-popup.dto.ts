import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import {
  POPUP_FREQUENCIES,
  POPUP_QUEUE_MODES,
  PopupFrequency,
  PopupQueueMode,
  PopupScene,
  PopupType,
} from '../constants/popup-schema';

/**
 * 新建 / 覆盖一个活动弹窗。
 *
 * `content` 这里只要求是对象，具体字段按 `type` 分派到各自的校验类 ——
 * 与装修组件同一套做法：图文型要图片地址，公告型要标题正文，形状完全不同。
 */
export class SavePopupDto {
  @ApiProperty({ description: '后台名称', example: '秋季新品', maxLength: 64 })
  @IsString()
  @MaxLength(64, { message: '名称最长 64 个字符' })
  name!: string;

  @ApiProperty({ description: '弹窗类型', enum: PopupType })
  @IsEnum(PopupType, { message: '不支持的弹窗类型' })
  type!: PopupType;

  @ApiProperty({ description: '触发场景', enum: PopupScene })
  @IsEnum(PopupScene, { message: '不支持的触发场景' })
  scene!: PopupScene;

  @ApiPropertyOptional({ description: '只在某家门店生效；不传为全平台通用' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number | null;

  @ApiPropertyOptional({ description: '优先级，数字越小越优先', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'priority 必须为整数' })
  @Min(1, { message: 'priority 最小为 1' })
  @Max(999, { message: 'priority 最大为 999' })
  priority?: number;

  @ApiPropertyOptional({ description: '状态：0 停用 / 1 启用', enum: CommonStatus })
  @IsOptional()
  @IsEnum(CommonStatus, { message: 'status 只能是 0 或 1' })
  status?: CommonStatus;

  @ApiPropertyOptional({ description: '生效开始时间（ISO 字符串）' })
  @IsOptional()
  @IsDateString({}, { message: 'startTime 需为 ISO 时间' })
  startTime?: string | null;

  @ApiPropertyOptional({ description: '生效结束时间（ISO 字符串）' })
  @IsOptional()
  @IsDateString({}, { message: 'endTime 需为 ISO 时间' })
  endTime?: string | null;

  @ApiPropertyOptional({ description: '频次', enum: POPUP_FREQUENCIES })
  @IsOptional()
  @IsIn(POPUP_FREQUENCIES as unknown as string[], { message: '不支持的频次' })
  frequency?: PopupFrequency;

  @ApiPropertyOptional({ description: '单次触发最多弹几个', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxShow 必须为整数' })
  @Min(1, { message: 'maxShow 最小为 1' })
  @Max(5, { message: 'maxShow 最大为 5' })
  maxShow?: number;

  @ApiPropertyOptional({ description: '多弹窗方式', enum: POPUP_QUEUE_MODES })
  @IsOptional()
  @IsEnum(PopupQueueMode, { message: 'queueMode 只能是 queue 或 top_only' })
  queueMode?: PopupQueueMode;

  @ApiProperty({ description: '内容与样式' })
  @IsObject({ message: 'content 必须为对象' })
  content!: Record<string, unknown>;
}
