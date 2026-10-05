import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 取消 / 拒单入参 */
export class CancelOrderDto {
  @ApiPropertyOptional({ description: '取消原因', maxLength: 128, example: '顾客临时取消' })
  @IsOptional()
  @IsString()
  @MaxLength(128, { message: '取消原因最长 128 个字符' })
  reason?: string;
}
