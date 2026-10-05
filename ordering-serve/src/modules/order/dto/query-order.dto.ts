import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { OrderStatus } from '../../../shared/enums/order-status.enum';

/** 订单列表查询入参（商户端） */
export class QueryOrderDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '所属商户 ID（仅平台管理员可指定）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId?: number;

  @ApiPropertyOptional({ description: '门店 ID（门店管理员会被强制限定为本店）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;

  @ApiPropertyOptional({ description: '订单状态筛选', enum: OrderStatus })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(OrderStatus, { message: 'status 取值不合法' })
  status?: OrderStatus;

  @ApiPropertyOptional({ description: '按订单号 / 手机号模糊搜索', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  keyword?: string;

  @ApiPropertyOptional({ description: '下单时间起（ISO 8601）', example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'startTime 需为合法的 ISO 8601 时间字符串' })
  startTime?: string;

  @ApiPropertyOptional({ description: '下单时间止（ISO 8601）', example: '2026-10-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'endTime 需为合法的 ISO 8601 时间字符串' })
  endTime?: string;
}
