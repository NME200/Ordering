import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';

/** 活动启停入参（独立接口，不与资料编辑混在一起） */
export class UpdatePointActivityStatusDto {
  @ApiProperty({
    description: '目标状态：0 停用 / 1 启用。启用时服务端会再查一次时间窗与商户范围是否撞车',
    enum: CommonStatus,
    example: CommonStatus.ENABLED,
  })
  @IsEnum(CommonStatus, { message: 'status 只能是 0（停用）或 1（启用）' })
  status!: CommonStatus;
}
