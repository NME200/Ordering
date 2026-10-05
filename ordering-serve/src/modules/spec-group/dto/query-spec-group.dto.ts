import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CommonStatus } from '../../../shared/enums/common-status.enum';

/** 规格组列表查询入参 */
export class QuerySpecGroupDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '所属商户 ID（仅平台管理员可指定）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId?: number;

  @ApiPropertyOptional({ description: '按规格组名称模糊搜索', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  keyword?: string;

  @ApiPropertyOptional({ description: '状态筛选：0 禁用 / 1 启用', enum: CommonStatus })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(CommonStatus, { message: 'status 只能是 0（禁用）或 1（启用）' })
  status?: CommonStatus;
}
