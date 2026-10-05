import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DishStatus } from '../../../shared/enums/dish-status.enum';

/** 金额取值范围（分）：0 ~ 100 万元 */
const PRICE_MAX = 100000000;

/** 新增菜品入参 */
export class CreateDishDto {
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

  @ApiProperty({ description: '所属分类 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'categoryId 必须为整数' })
  @Min(1, { message: 'categoryId 最小为 1' })
  categoryId!: number;

  /**
   * 店专属菜：只有这家店能看到并下单；不传即全商户通用。
   * 服务端会校验该门店属于当前租户。
   */
  @ApiPropertyOptional({ description: '归属门店 ID（不传 = 全商户通用）', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;

  @ApiProperty({ description: '菜品名称', example: '宫保鸡丁', maxLength: 64 })
  @IsString()
  @IsNotEmpty({ message: '菜品名称不能为空' })
  @MaxLength(64, { message: '菜品名称最长 64 个字符' })
  name!: string;

  @ApiPropertyOptional({ description: '菜品描述', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '菜品描述最长 255 个字符' })
  description?: string;

  @ApiPropertyOptional({ description: '菜品图片地址', example: 'https://cdn.example.com/dish/1.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '图片地址最长 255 个字符' })
  @IsUrl({}, { message: 'imageUrl 需为合法的 URL' })
  imageUrl?: string;

  @ApiProperty({ description: '售价（分）', example: 3800, minimum: 0, maximum: PRICE_MAX })
  @Type(() => Number)
  @IsInt({ message: 'price 必须为整数（单位：分）' })
  @Min(0, { message: 'price 不能为负' })
  @Max(PRICE_MAX, { message: `price 不能大于 ${PRICE_MAX}` })
  price!: number;

  @ApiPropertyOptional({
    description: '会员价（分），不传表示不区分会员价',
    example: 3400,
    minimum: 0,
    maximum: PRICE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'memberPrice 必须为整数（单位：分）' })
  @Min(0, { message: 'memberPrice 不能为负' })
  @Max(PRICE_MAX, { message: `memberPrice 不能大于 ${PRICE_MAX}` })
  memberPrice?: number;

  @ApiPropertyOptional({ description: '计价单位', example: '份', maxLength: 8, default: '份' })
  @IsOptional()
  @IsString()
  @MaxLength(8, { message: '计价单位最长 8 个字符' })
  unit?: string;

  @ApiPropertyOptional({ description: '排序值，越小越靠前', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sort 必须为整数' })
  @Min(0, { message: 'sort 最小为 0' })
  @Max(9999, { message: 'sort 最大为 9999' })
  sort?: number;

  @ApiPropertyOptional({
    description: '状态：0 下架 / 1 上架',
    enum: DishStatus,
    default: DishStatus.ON_SHELF,
  })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(DishStatus, { message: 'status 只能是 0（下架）或 1（上架）' })
  status?: DishStatus;

  @ApiPropertyOptional({ description: '是否推荐菜', default: false })
  @IsOptional()
  @IsBoolean({ message: 'isRecommend 必须为布尔值' })
  isRecommend?: boolean;

  @ApiPropertyOptional({
    description: '关联的规格组 ID 列表（必须是本商户已存在的规格组）',
    type: [Number],
    example: [1, 2],
  })
  @IsOptional()
  @IsArray({ message: 'specGroupIds 必须为数组' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'specGroupIds 元素必须为整数' })
  @ArrayUnique({ message: 'specGroupIds 不能重复' })
  specGroupIds?: number[];
}
