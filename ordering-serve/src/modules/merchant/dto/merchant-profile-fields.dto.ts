import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 商户（=一家店）的资料字段。
 *
 * 单独抽出来是为了让「新增」必填、「编辑」全可选这两份 DTO 共用同一套校验，
 * 同时避免把 `adminUsername` 这类只属于开通流程的字段带进编辑接口。
 */
export class MerchantProfileFieldsDto {
  @ApiProperty({ description: '商户名称（对外即店名）', example: '示例餐饮有限公司', maxLength: 64 })
  @IsString()
  @IsNotEmpty({ message: '商户名称不能为空' })
  @MaxLength(64, { message: '商户名称最长 64 个字符' })
  name!: string;

  @ApiPropertyOptional({
    description: '商户编码，全平台唯一；留空由服务端按序号生成',
    example: 'S001',
    maxLength: 32,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '商户编码最长 32 个字符' })
  code?: string;

  @ApiPropertyOptional({ description: '联系人', example: '张三', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '联系人最长 32 个字符' })
  contactName?: string;

  @ApiPropertyOptional({
    description: '联系电话（对外营业电话）',
    example: '13800000000',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '联系电话最长 20 个字符' })
  contactPhone?: string;

  @ApiPropertyOptional({ description: '经营地址', example: '演示市演示区人民路 1 号', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '经营地址最长 255 个字符' })
  address?: string;

  @ApiPropertyOptional({
    description: '服务到期时间（ISO 8601），不传表示不限',
    example: '2027-12-31T15:59:59.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'expireAt 需为合法的 ISO 8601 时间字符串' })
  expireAt?: string;

  @ApiPropertyOptional({ description: '备注', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '备注最长 255 个字符' })
  remark?: string;
}
