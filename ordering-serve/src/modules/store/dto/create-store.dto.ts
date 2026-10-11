import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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
    description: '门店 logo / 头图地址，留空则顾客端用店名首字兜底',
    example: 'https://cdn.example.com/store-1.png',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'logo 地址最长 255 个字符' })
  logo?: string | null;

  @ApiPropertyOptional({
    description: '营业时间展示文案（只做展示，打烊由营业状态决定）',
    example: '09:00-21:00',
    maxLength: 32,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '营业时间最长 32 个字符' })
  businessHours?: string | null;

  @ApiPropertyOptional({ description: '纬度（-90 ~ 90），留空则顾客端不显示距离', example: 29.8852 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'latitude 必须是数字' })
  @Min(-90, { message: 'latitude 最小为 -90' })
  @Max(90, { message: 'latitude 最大为 90' })
  latitude?: number | null;

  @ApiPropertyOptional({ description: '经度（-180 ~ 180）', example: 121.5281 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'longitude 必须是数字' })
  @Min(-180, { message: 'longitude 最小为 -180' })
  @Max(180, { message: 'longitude 最大为 180' })
  longitude?: number | null;

  @ApiPropertyOptional({
    description: '营业状态：0 打烊 / 1 营业中',
    enum: BusinessStatus,
    default: BusinessStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(BusinessStatus, { message: 'businessStatus 只能是 0（打烊）或 1（营业中）' })
  businessStatus?: BusinessStatus;
}
