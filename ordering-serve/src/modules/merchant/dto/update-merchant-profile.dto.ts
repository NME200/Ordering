import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BusinessStatus } from '../../../shared/enums/business-status.enum';

/**
 * 商户端维护「本店资料」的入参。
 *
 * 与平台端的 `UpdateMerchantDto` 是两份 DTO，不是父子关系：
 * 商家能改的只有对外营业信息，改不到 `status`（平台停用）、`expireAt`（服务到期）、
 * `remark`（平台内部备注）与 `code`（平台分配的识别码）。
 * 字段集刻意收窄，越权就只能靠漏字段而不是靠 service 记得拦。
 */
export class UpdateMerchantProfileDto {
  @ApiPropertyOptional({ description: '店名', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '店名最长 64 个字符' })
  name?: string;

  @ApiPropertyOptional({ description: '联系人', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '联系人最长 32 个字符' })
  contactName?: string;

  @ApiPropertyOptional({ description: '联系电话（对外营业电话）', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '联系电话最长 20 个字符' })
  contactPhone?: string;

  @ApiPropertyOptional({ description: '经营地址', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '经营地址最长 255 个字符' })
  address?: string;

  @ApiPropertyOptional({ description: '营业状态：0 打烊 / 1 营业中', enum: BusinessStatus })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(BusinessStatus, { message: 'businessStatus 只能是 0（打烊）或 1（营业中）' })
  businessStatus?: BusinessStatus;
}
