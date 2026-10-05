import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';

/** 门店启停入参（禁用 / 恢复的唯一入口） */
export class UpdateStoreStatusDto {
  @ApiProperty({
    description: '目标状态：0 禁用 / 1 启用',
    enum: CommonStatus,
    example: CommonStatus.DISABLED,
  })
  @IsEnum(CommonStatus, { message: 'status 只能是 0（禁用）或 1（启用）' })
  status!: CommonStatus;
}
