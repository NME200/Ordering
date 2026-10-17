import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { PointActivityRuleType } from '../../../shared/enums/point-activity.enum';

/** 积分活动列表查询入参（平台端） */
export class QueryPointActivityDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '按活动名模糊搜索', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  keyword?: string;

  @ApiPropertyOptional({ description: '启停状态筛选', enum: CommonStatus })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(CommonStatus, { message: 'status 取值不合法' })
  status?: CommonStatus;

  @ApiPropertyOptional({ description: '规则类型筛选', enum: PointActivityRuleType })
  @IsOptional()
  @IsEnum(PointActivityRuleType, { message: 'ruleType 取值不合法' })
  ruleType?: PointActivityRuleType;

  @ApiPropertyOptional({ description: '只看压在某家商户头上的活动（含全部商户的活动）', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  @Max(Number.MAX_SAFE_INTEGER, { message: 'merchantId 超出范围' })
  merchantId?: number;
}
