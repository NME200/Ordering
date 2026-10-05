import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CommonStatus } from '../../../shared/enums/common-status.enum';

/** 商户列表查询入参 */
export class QueryMerchantDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '按商户名称模糊搜索', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @ApiPropertyOptional({ description: '状态筛选：0 禁用 / 1 启用', enum: CommonStatus })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(CommonStatus, { message: 'status 只能是 0（禁用）或 1（启用）' })
  status?: CommonStatus;
}
