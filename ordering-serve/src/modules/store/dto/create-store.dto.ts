import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { BusinessStatus } from '../../../shared/enums/business-status.enum';

/** 新增门店入参 */
export class CreateStoreDto {
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

  @ApiProperty({ description: '门店名称', example: '人民路店', maxLength: 64 })
  @IsString()
  @IsNotEmpty({ message: '门店名称不能为空' })
  @MaxLength(64, { message: '门店名称最长 64 个字符' })
  name!: string;

  @ApiPropertyOptional({ description: '门店编码（商户内唯一）', example: 'S001', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '门店编码最长 32 个字符' })
  code?: string;

  @ApiPropertyOptional({ description: '门店地址', example: '某某市某某区人民路 1 号', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '门店地址最长 255 个字符' })
  address?: string;

  @ApiPropertyOptional({ description: '门店电话', example: '0571-88888888', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '门店电话最长 20 个字符' })
  phone?: string;

  @ApiPropertyOptional({
    description: '营业状态：0 打烊 / 1 营业中',
    enum: BusinessStatus,
    default: BusinessStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(BusinessStatus, { message: 'businessStatus 只能是 0（打烊）或 1（营业中）' })
  businessStatus?: BusinessStatus;
}
