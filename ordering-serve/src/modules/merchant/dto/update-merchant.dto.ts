import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { CreateMerchantDto } from './create-merchant.dto';

/** 编辑商户入参：所有字段可选 */
export class UpdateMerchantDto extends PartialType(CreateMerchantDto) {
  @ApiPropertyOptional({ description: '状态：0 禁用 / 1 启用', enum: CommonStatus })
  @IsOptional()
  @IsEnum(CommonStatus, { message: 'status 只能是 0（禁用）或 1（启用）' })
  status?: CommonStatus;
}
