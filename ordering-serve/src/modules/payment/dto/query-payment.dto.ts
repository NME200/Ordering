import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';
import { PaymentStatus } from '../../../shared/enums/payment-status.enum';

/** 支付流水查询入参（商户端） */
export class QueryPaymentDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ description: '按订单 ID 筛选（查某笔订单的支付记录）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orderId 必须为整数' })
  @Min(1, { message: 'orderId 最小为 1' })
  orderId?: number;

  @ApiPropertyOptional({ description: '支付渠道筛选', enum: PaymentChannel })
  @IsOptional()
  @IsEnum(PaymentChannel, { message: 'channel 取值不合法' })
  channel?: PaymentChannel;

  @ApiPropertyOptional({ description: '支付状态筛选', enum: PaymentStatus })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(PaymentStatus, { message: 'status 取值不合法' })
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: '按支付单号 / 订单号模糊搜索', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  keyword?: string;

  @ApiPropertyOptional({ description: '创建时间起（ISO 8601）' })
  @IsOptional()
  @IsDateString({}, { message: 'startTime 需为合法的 ISO 8601 时间字符串' })
  startTime?: string;

  @ApiPropertyOptional({ description: '创建时间止（ISO 8601）' })
  @IsOptional()
  @IsDateString({}, { message: 'endTime 需为合法的 ISO 8601 时间字符串' })
  endTime?: string;
}
