import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * C 端门店列表入参。
 *
 * **刻意不收 lat/lng**：顾客位置只在小程序那一侧有，匿名接口既不该索要、
 * 也不该存（见 CODEBUDDY 8.5）。接口把每个门店的坐标原样下发，
 * 距离与「按距离排序」由前端 haversine 算 —— 顾客一动就变，服务端算一次反而立刻过期。
 */
export class QueryPublicStoresDto {
  @ApiPropertyOptional({ description: '只看某个商户的门店；不传则跨商户（多商户平台首页）', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId?: number;

  @ApiPropertyOptional({ description: '按门店名模糊搜索', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '搜索词最长 32 个字符' })
  keyword?: string;

  @ApiPropertyOptional({ description: '返回条数，默认 20', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit 必须为整数' })
  @Min(1, { message: 'limit 最小为 1' })
  @Max(50, { message: 'limit 最大为 50' })
  limit?: number;
}
