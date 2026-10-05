import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DishStatus } from '../../../shared/enums/dish-status.enum';

/** 与菜品一致：金额 0 ~ 100 万元（分） */
const PRICE_MAX = 100000000;

/**
 * 写门店例外（UPSERT 语义：只改传进来的字段）。
 *
 * 价格类字段仅商户管理员与平台可写，门店绑定角色传了会被服务端拒绝
 * （见 `StoreDishService.assertPriceWritable`）。
 */
export class UpsertStoreDishDto {
  @ApiPropertyOptional({ description: '本店是否售卖：0 停售 / 1 在售', enum: DishStatus })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(DishStatus, { message: 'saleStatus 只能是 0（停售）或 1（在售）' })
  saleStatus?: DishStatus;

  @ApiPropertyOptional({ description: '门店售价（分）；不传表示不改', minimum: 0, maximum: PRICE_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'price 必须为整数分' })
  @Min(0, { message: 'price 不能为负' })
  @Max(PRICE_MAX, { message: `price 最大 ${PRICE_MAX} 分` })
  price?: number;

  @ApiPropertyOptional({
    description: '门店会员价（分）；传 null 表示清除门店会员价、跟随标准会员价',
    minimum: 0,
    maximum: PRICE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'memberPrice 必须为整数分' })
  @Min(0, { message: 'memberPrice 不能为负' })
  @Max(PRICE_MAX, { message: `memberPrice 最大 ${PRICE_MAX} 分` })
  memberPrice?: number | null;

  @ApiPropertyOptional({ description: '沽清（当日售罄）：true 置为售罄，false 恢复' })
  @IsOptional()
  @IsBoolean({ message: 'soldOut 必须为布尔值' })
  soldOut?: boolean;
}
