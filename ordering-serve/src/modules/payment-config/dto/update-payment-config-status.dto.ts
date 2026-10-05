import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';

/** 启用 / 停用某个支付渠道 */
export class UpdatePaymentConfigStatusDto {
  @ApiProperty({
    description: '是否启用：0 停用 / 1 启用',
    enum: CommonStatus,
    example: CommonStatus.ENABLED,
  })
  @IsEnum(CommonStatus, { message: 'enabled 只能是 0（停用）或 1（启用）' })
  enabled!: CommonStatus;
}
