import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { SpecType } from '../../../shared/enums/spec-type.enum';
import { MAX_SPEC_OPTIONS, SpecOptionItemDto } from './spec-option-item.dto';

/** 新增规格组入参（规格项作为嵌套字段一起提交） */
export class CreateSpecGroupDto {
  /**
   * 仅平台管理员需要 / 允许指定；其他角色传入会被忽略，
   * 实际取值一律来自 Token（见 common/utils/tenant.util.ts）。
   */
  @ApiPropertyOptional({ description: '所属商户 ID（仅平台管理员可指定）', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId?: number;

  @ApiProperty({ description: '规格组名称', example: '杯型', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: '规格组名称不能为空' })
  @MaxLength(32, { message: '规格组名称最长 32 个字符' })
  name!: string;

  @ApiProperty({
    description: '选购方式：1 单选 / 2 多选',
    enum: SpecType,
    default: SpecType.SINGLE,
  })
  @Type(() => Number)
  @IsEnum(SpecType, { message: 'type 只能是 1（单选）或 2（多选）' })
  type!: SpecType;

  @ApiPropertyOptional({ description: '是否必选', default: false })
  @IsOptional()
  @IsBoolean({ message: 'isRequired 必须为布尔值' })
  isRequired?: boolean;

  @ApiPropertyOptional({ description: '排序值，越小越靠前', default: 0 })
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

  @ApiProperty({
    description: `规格项列表（1 ~ ${MAX_SPEC_OPTIONS} 项）`,
    type: [SpecOptionItemDto],
  })
  @IsArray({ message: 'options 必须为数组' })
  @ArrayMinSize(1, { message: '规格组至少需要 1 个规格项' })
  @ArrayMaxSize(MAX_SPEC_OPTIONS, { message: `一个规格组最多 ${MAX_SPEC_OPTIONS} 个规格项` })
  @ValidateNested({ each: true })
  @Type(() => SpecOptionItemDto)
  options!: SpecOptionItemDto[];
}
