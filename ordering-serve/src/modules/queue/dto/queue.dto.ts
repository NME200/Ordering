import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  QUEUE_STATUS_VALUES,
  QUEUE_TABLE_TYPE_KEYS,
  QueueStatus,
  QUEUE_MAX_PARTY_SIZE,
} from '../../../shared/enums/queue.enum';

/** 取号 */
export class TakeQueueDto {
  @ApiProperty({ description: '门店 ID' })
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId!: number;

  @ApiProperty({ description: '桌型：small / medium / large', enum: QUEUE_TABLE_TYPE_KEYS })
  @IsIn(QUEUE_TABLE_TYPE_KEYS, { message: 'tableType 只能是 small / medium / large' })
  tableType!: string;

  @ApiProperty({ description: '就餐人数', example: 2 })
  @Type(() => Number)
  @IsInt({ message: 'partySize 必须为整数' })
  @Min(1, { message: '至少 1 人' })
  @Max(QUEUE_MAX_PARTY_SIZE, { message: `最多 ${QUEUE_MAX_PARTY_SIZE} 人` })
  partySize!: number;

  @ApiPropertyOptional({ description: '联系手机号（门店代客取号时填）' })
  @IsOptional()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;
}

/** 商户侧队列查询 */
export class QueryQueueDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '门店 ID（门店绑定角色强制本店）' })
  @IsOptional()
  @Type(() => Number)
  storeId?: number;

  @ApiPropertyOptional({ description: '状态筛选', enum: QUEUE_STATUS_VALUES })
  @IsOptional()
  @IsIn(QUEUE_STATUS_VALUES, { message: 'status 取值不合法' })
  status?: QueueStatus;

  @ApiPropertyOptional({ description: '营业日 YYYY-MM-DD，默认今天' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'bizDate 格式应为 YYYY-MM-DD' })
  bizDate?: string;
}

/** 队列行出参 */
export class QueueDto {
  @ApiProperty({ description: '排队记录 ID' })
  id!: number;

  @ApiProperty({ description: '门店 ID' })
  storeId!: number;

  @ApiProperty({ description: '门店名' })
  storeName!: string;

  @ApiProperty({ description: '营业日' })
  bizDate!: string;

  @ApiProperty({ description: '桌型' })
  tableType!: string;

  @ApiProperty({ description: '桌型中文名' })
  tableTypeLabel!: string;

  @ApiProperty({ description: '号面，如 A012' })
  queueNo!: string;

  @ApiProperty({ description: '人数' })
  partySize!: number;

  @ApiProperty({ description: '状态' })
  status!: QueueStatus;

  @ApiProperty({ description: '状态中文名' })
  statusLabel!: string;

  @ApiProperty({ description: '取号时间' })
  createdAt!: Date;

  @ApiProperty({ description: '叫号时间' })
  calledAt!: Date | null;

  @ApiProperty({ description: '入座时间' })
  seatedAt!: Date | null;

  @ApiProperty({ description: '前面还有几桌（waiting / called 时有意义）' })
  ahead!: number;

  @ApiProperty({ description: '当前正在叫到的号，用于「请留意 A0xx」提示' })
  callingNo!: string | null;
}
