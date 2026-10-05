import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 发起退款入参（当前仅支持整单全额退款） */
export class RefundPaymentDto {
  @ApiPropertyOptional({ description: '退款原因', maxLength: 128, example: '顾客申请退款' })
  @IsOptional()
  @IsString()
  @MaxLength(128, { message: '退款原因最长 128 个字符' })
  reason?: string;
}
