import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';

/** 新增菜品分类入参 */
export class CreateDishCategoryDto {
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

  @ApiProperty({ description: '分类名称', example: '热菜', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: '分类名称不能为空' })
  @MaxLength(32, { message: '分类名称最长 32 个字符' })
  name!: string;

  /** 店专属分类：只有这家店看得到；不传即全商户通用 */
  @ApiPropertyOptional({ description: '归属门店 ID（不传 = 全商户通用）', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;

  @ApiPropertyOptional({ description: '排序值，越小越靠前', default: 0, minimum: 0 })
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
