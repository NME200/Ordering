import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 新增商户入参。
 *
 * 除了商户本身的资料，还必须一并给出**首个商家管理员**的凭据：
 * 平台开通一个商户就是要让它能立刻登录商户后台，
 * 之后的员工账号由商家自己在商户后台创建（平台端不再代商家开通）。
 */
export class CreateMerchantDto {
  @ApiProperty({ description: '商户名称', example: '示例餐饮有限公司', maxLength: 64 })
  @IsString()
  @IsNotEmpty({ message: '商户名称不能为空' })
  @MaxLength(64, { message: '商户名称最长 64 个字符' })
  name!: string;

  @ApiProperty({
    description: '商家管理员用户名（全平台唯一，商家据此登录商户后台）',
    example: 'merchant01',
    maxLength: 32,
  })
  @IsString()
  @IsNotEmpty({ message: '商家管理员用户名不能为空' })
  @MaxLength(32, { message: '用户名最长 32 个字符' })
  adminUsername!: string;

  @ApiProperty({ description: '商家管理员初始密码', example: 'Abc123456', minLength: 6, maxLength: 32 })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(32, { message: '密码最长 32 位' })
  adminPassword!: string;

  @ApiProperty({ description: '商家管理员姓名', example: '张三', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: '商家管理员姓名不能为空' })
  @MaxLength(32, { message: '姓名最长 32 个字符' })
  adminNickname!: string;

  @ApiPropertyOptional({
    description: '商家管理员手机号（留空则取商户联系电话）',
    example: '13800000000',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '手机号最长 20 个字符' })
  adminPhone?: string;

  @ApiPropertyOptional({ description: '联系人', example: '张三', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '联系人最长 32 个字符' })
  contactName?: string;

  @ApiPropertyOptional({ description: '联系电话', example: '13800000000', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '联系电话最长 20 个字符' })
  contactPhone?: string;

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
