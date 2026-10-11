import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SERVICE_MESSAGE_MAX_LENGTH, ServiceSessionStatus } from '../../../shared/enums/service.enum';

/** 发送消息 */
export class SendServiceMessageDto {
  @ApiProperty({ description: '咨询哪个商户（会话按「顾客 × 商户」唯一）' })
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId!: number;

  @ApiProperty({ description: '消息内容', maxLength: SERVICE_MESSAGE_MAX_LENGTH })
  @IsString()
  @MaxLength(SERVICE_MESSAGE_MAX_LENGTH, {
    message: `消息最长 ${SERVICE_MESSAGE_MAX_LENGTH} 个字符`,
  })
  content!: string;

  @ApiPropertyOptional({ description: '附带的订单 ID（点「咨询某笔订单」时带上）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orderId 必须为整数' })
  @Min(1, { message: 'orderId 最小为 1' })
  orderId?: number;

  @ApiPropertyOptional({ description: '当前门店 ID，用于把会话落到该门店' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;
}

/** 拉取增量消息 */
export class PollServiceDto {
  @ApiPropertyOptional({ description: '只取 ID 大于此值的消息（首次进会话传 0）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'afterId 必须为整数' })
  @Min(0, { message: 'afterId 不能为负' })
  afterId?: number;
}

/** 商户侧会话列表查询 */
export class QueryServiceSessionDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '门店 ID（门店绑定角色强制本店）' })
  @IsOptional()
  @Type(() => Number)
  storeId?: number;

  @ApiPropertyOptional({ description: '状态筛选：open / replied / closed', enum: ServiceSessionStatus })
  @IsOptional()
  status?: ServiceSessionStatus;
}

/** 商户侧回复 */
export class StaffReplyDto {
  @ApiProperty({ description: '回复内容', maxLength: SERVICE_MESSAGE_MAX_LENGTH })
  @IsString()
  @MaxLength(SERVICE_MESSAGE_MAX_LENGTH, {
    message: `回复最长 ${SERVICE_MESSAGE_MAX_LENGTH} 个字符`,
  })
  content!: string;
}

/** 会话出参 */
export class ServiceSessionDto {
  @ApiProperty({ description: '会话 ID' })
  id!: number;

  @ApiProperty({ description: '商户 ID' })
  merchantId!: number;

  @ApiProperty({ description: '门店 ID' })
  storeId!: number | null;

  @ApiProperty({ description: '关联订单 ID' })
  orderId!: number | null;

  @ApiProperty({ description: '状态' })
  status!: ServiceSessionStatus;

  @ApiProperty({ description: '最后一条消息预览' })
  lastMessage!: string | null;

  @ApiProperty({ description: '最后一条消息时间' })
  lastMessageAt!: Date | null;

  @ApiProperty({ description: '本端未读数' })
  unread!: number;

  @ApiProperty({ description: '顾客昵称（商户侧列表用）' })
  customerName?: string;

  @ApiProperty({ description: '顾客手机号（打码，商户侧列表用）' })
  customerPhone?: string | null;
}

/** 消息出参 */
export class ServiceMessageDto {
  @ApiProperty({ description: '消息 ID，轮询游标' })
  id!: number;

  @ApiProperty({ description: '发送方：customer / staff' })
  sender!: string;

  @ApiProperty({ description: '发送者展示名' })
  senderName!: string;

  @ApiProperty({ description: '内容' })
  content!: string;

  @ApiProperty({ description: '附带订单号' })
  orderNo!: string | null;

  @ApiProperty({ description: '时间' })
  createdAt!: Date;
}
