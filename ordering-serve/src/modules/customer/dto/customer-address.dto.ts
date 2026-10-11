import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PHONE_PATTERN } from './customer-auth.dto';

/**
 * 收货地址入参。
 *
 * 省市区是三段文本而不是行政区划编码：小程序侧用的是 `picker` 的省市区选择器，
 * 落库编码需要另一份区划数据（且要随民政部调整），本轮只做展示与配送联系，文本够用。
 */
export class CreateCustomerAddressDto {
  @ApiProperty({ description: '收货人姓名', maxLength: 32 })
  @IsString({ message: '收货人必须为字符串' })
  @MaxLength(32, { message: '收货人最长 32 个字符' })
  receiverName!: string;

  @ApiProperty({ description: '收货人手机号', example: '13800138000' })
  @Matches(PHONE_PATTERN, { message: '手机号格式不正确' })
  phone!: string;

  @ApiProperty({ description: '省', maxLength: 32 })
  @IsString()
  @MaxLength(32, { message: '省最长 32 个字符' })
  province!: string;

  @ApiProperty({ description: '市', maxLength: 32 })
  @IsString()
  @MaxLength(32, { message: '市最长 32 个字符' })
  city!: string;

  @ApiProperty({ description: '区 / 县', maxLength: 32 })
  @IsString()
  @MaxLength(32, { message: '区最长 32 个字符' })
  district!: string;

  @ApiProperty({ description: '详细地址（街道 + 门牌 / 楼层房间号）', maxLength: 255 })
  @IsString()
  @MaxLength(255, { message: '详细地址最长 255 个字符' })
  detail!: string;

  @ApiPropertyOptional({ description: '标签：家 / 公司 / 学校', maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '标签最长 16 个字符' })
  tag?: string;

  @ApiPropertyOptional({ description: '是否设为默认地址：1 是 / 0 否', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'isDefault 只能是 0 或 1' })
  @Min(0, { message: 'isDefault 只能是 0 或 1' })
  isDefault?: number;
}

/** 编辑地址：全字段可选，只改传上来的部分 */
export class UpdateCustomerAddressDto {
  @ApiPropertyOptional({ description: '收货人姓名', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '收货人最长 32 个字符' })
  receiverName?: string;

  @ApiPropertyOptional({ description: '收货人手机号' })
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: '手机号格式不正确' })
  phone?: string;

  @ApiPropertyOptional({ description: '省', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '省最长 32 个字符' })
  province?: string;

  @ApiPropertyOptional({ description: '市', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '市最长 32 个字符' })
  city?: string;

  @ApiPropertyOptional({ description: '区 / 县', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '区最长 32 个字符' })
  district?: string;

  @ApiPropertyOptional({ description: '详细地址', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '详细地址最长 255 个字符' })
  detail?: string;

  @ApiPropertyOptional({ description: '标签', maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '标签最长 16 个字符' })
  tag?: string;

  @ApiPropertyOptional({ description: '是否设为默认地址：1 是 / 0 否' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'isDefault 只能是 0 或 1' })
  @Min(0, { message: 'isDefault 只能是 0 或 1' })
  isDefault?: number;
}

/** 地址出参。手机号**不打码**：这是顾客自己填的收货号，下单时要原样带给商家 */
export class CustomerAddressDto {
  @ApiProperty({ description: '地址 ID' })
  id!: number;

  @ApiProperty({ description: '收货人姓名' })
  receiverName!: string;

  @ApiProperty({ description: '收货人手机号（明文，仅本人可见）' })
  phone!: string;

  @ApiProperty({ description: '省' })
  province!: string;

  @ApiProperty({ description: '市' })
  city!: string;

  @ApiProperty({ description: '区 / 县' })
  district!: string;

  @ApiProperty({ description: '详细地址' })
  detail!: string;

  @ApiPropertyOptional({ description: '标签' })
  tag!: string | null;

  @ApiProperty({ description: '是否默认地址' })
  isDefault!: boolean;

  @ApiProperty({ description: '完整地址一行文本，列表页直接用' })
  fullAddress!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  static from(address: {
    id: number;
    receiverName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    detail: string;
    tag: string | null;
    isDefault: number;
    createdAt: Date;
  }): CustomerAddressDto {
    const dto = new CustomerAddressDto();
    dto.id = address.id;
    dto.receiverName = address.receiverName;
    dto.phone = address.phone;
    dto.province = address.province;
    dto.city = address.city;
    dto.district = address.district;
    dto.detail = address.detail;
    dto.tag = address.tag;
    dto.isDefault = address.isDefault === 1;
    dto.fullAddress = `${address.province}${address.city}${address.district}${address.detail}`;
    dto.createdAt = address.createdAt;
    return dto;
  }
}
