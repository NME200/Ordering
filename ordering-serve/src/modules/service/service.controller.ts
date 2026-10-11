import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { ServiceService } from './service.service';
import {
  PollServiceDto,
  QueryServiceSessionDto,
  SendServiceMessageDto,
  ServiceMessageDto,
  ServiceSessionDto,
  StaffReplyDto,
} from './dto/service.dto';

/** 顾客侧会话上下文 */
class OpenSessionQueryDto {
  @ApiProperty({ description: '商户 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId!: number;

  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;
}

/**
 * 在线客服。
 *
 * 顾客侧走轮询（`GET .../poll?afterId=`）而不是长连接：
 * 小程序侧要额外的连接鉴权与心跳，而客服场景下 3~5 秒的延迟完全可接受。
 */
@Public()
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@ApiTags('顾客端 · 在线客服')
@Controller('customer/service')
export class ServiceCustomerController {
  constructor(private readonly service: ServiceService) {}

  @Get('session')
  @ApiOperation({ summary: '打开（或复用）与当前商户的会话' })
  open(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: OpenSessionQueryDto,
  ): Promise<ServiceSessionDto> {
    return this.service.openByCustomer(customer.customerId, query.merchantId, query.storeId);
  }

  @Post('messages')
  @RateLimit({ bucket: 'customer-service-send', limit: 30, windowSeconds: 60 })
  @ApiOperation({
    summary: '发送消息',
    description: 'merchantId 决定落到哪条会话 —— 会话本身就是「顾客 × 商户」，顾客写不进别人的会话。',
  })
  send(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: SendServiceMessageDto,
  ): Promise<ServiceMessageDto> {
    return this.service.sendByCustomer(
      customer.customerId,
      dto.merchantId,
      dto.content,
      dto.orderId,
      dto.storeId,
    );
  }

  @Get('poll')
  @RateLimit({ bucket: 'customer-service-poll', limit: 120, windowSeconds: 60 })
  @ApiOperation({ summary: '轮询新消息（顺带清顾客侧未读）' })
  @ApiQuery({ name: 'sessionId', example: 1 })
  poll(
    @CurrentCustomer() customer: AuthCustomer,
    @Query('sessionId', ParseIntPipe) sessionId: number,
    @Query() query: PollServiceDto,
  ): Promise<{ messages: ServiceMessageDto[]; session: ServiceSessionDto }> {
    return this.service.pollByCustomer(customer.customerId, sessionId, query.afterId ?? 0);
  }
}

/** 商户侧 */
@ApiBearerAuth()
@ApiTags('客服工作台')
@Controller('service/sessions')
export class ServiceStaffController {
  constructor(private readonly service: ServiceService) {}

  @Get()
  @Permissions(Permission.SERVICE_READ)
  @ApiOperation({ summary: '会话列表（按最后一条消息时间倒序）' })
  list(
    @Query() query: QueryServiceSessionDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<ServiceSessionDto>> {
    return this.service.paginateForStaff(query, currentUser);
  }

  @Get(':id')
  @Permissions(Permission.SERVICE_READ)
  @ApiOperation({ summary: '会话详情（全量消息，顺带清客服侧未读）' })
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<{ messages: ServiceMessageDto[]; session: ServiceSessionDto }> {
    return this.service.detailForStaff(id, currentUser);
  }

  @Post(':id/reply')
  @Permissions(Permission.SERVICE_UPDATE)
  @ApiOperation({ summary: '以客服身份回复' })
  reply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StaffReplyDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<ServiceMessageDto> {
    return this.service.reply(id, dto, currentUser);
  }

  @Put(':id/close')
  @Permissions(Permission.SERVICE_UPDATE)
  @ApiOperation({ summary: '结束会话' })
  close(@Param('id', ParseIntPipe) id: number, @CurrentUser() currentUser: AuthUser): Promise<void> {
    return this.service.close(id, currentUser);
  }
}
