import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { QueueStatus } from '../../shared/enums/queue.enum';
import { Permission } from '../../shared/enums/permission.enum';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { QueueService } from './queue.service';
import { QueryQueueDto, QueueDto, TakeQueueDto } from './dto/queue.dto';

/**
 * 顾客侧排队取号。
 *
 * `/board` 是**公开**的：没取号的人也想看看前面排了多少桌再决定进不进。
 * 其余接口都要令牌，且只能操作自己的号。
 */
@ApiTags('顾客端 · 排队取号')
@Controller('customer/queue')
export class QueueCustomerController {
  constructor(private readonly queueService: QueueService) {}

  @Public()
  @RateLimit({ bucket: 'queue-board', limit: 60, windowSeconds: 60 })
  @Get('board/:storeId')
  @ApiOperation({ summary: '门店叫号看板（公开）' })
  board(@Param('storeId', ParseIntPipe) storeId: number): ReturnType<QueueService['board']> {
    return this.queueService.board(storeId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post()
  @RateLimit({ bucket: 'queue-take', limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: '取号（同一时间只能有一个进行中的号）' })
  take(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: TakeQueueDto,
  ): Promise<QueueDto> {
    return this.queueService.take(customer.customerId, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('mine')
  @ApiOperation({ summary: '我的当前号（含前面等待桌数）' })
  mine(@CurrentCustomer() customer: AuthCustomer): Promise<QueueDto | null> {
    return this.queueService.mine(customer.customerId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Put(':id/cancel')
  @ApiOperation({ summary: '取消我的号' })
  cancel(
    @CurrentCustomer() customer: AuthCustomer,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<QueueDto> {
    return this.queueService.cancelByCustomer(customer.customerId, id);
  }
}

/** 门店侧叫号台：走全局员工守卫 + 权限点，一个字符都不能加 @Public() */
@ApiBearerAuth()
@Controller('queues')
@ApiTags('排队叫号')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get()
  @Permissions(Permission.QUEUE_READ)
  @ApiOperation({ summary: '当日队列（叫号台）' })
  list(@Query() query: QueryQueueDto, @CurrentUser() currentUser: AuthUser): Promise<QueueDto[]> {
    return this.queueService.paginate(query, currentUser);
  }

  @Post()
  @Permissions(Permission.QUEUE_CREATE)
  @ApiOperation({ summary: '门店代客取号' })
  take(@Body() dto: TakeQueueDto, @CurrentUser() currentUser: AuthUser): Promise<QueueDto> {
    return this.queueService.takeForStaff(dto, currentUser);
  }

  @Put(':id/call')
  @Permissions(Permission.QUEUE_UPDATE)
  @ApiOperation({ summary: '叫号' })
  call(@Param('id', ParseIntPipe) id: number, @CurrentUser() currentUser: AuthUser): Promise<QueueDto> {
    return this.queueService.advance(id, QueueStatus.CALLED, currentUser);
  }

  @Put(':id/seat')
  @Permissions(Permission.QUEUE_UPDATE)
  @ApiOperation({ summary: '入座' })
  seat(@Param('id', ParseIntPipe) id: number, @CurrentUser() currentUser: AuthUser): Promise<QueueDto> {
    return this.queueService.advance(id, QueueStatus.SEATED, currentUser);
  }

  @Put(':id/pass')
  @Permissions(Permission.QUEUE_UPDATE)
  @ApiOperation({ summary: '过号' })
  pass(@Param('id', ParseIntPipe) id: number, @CurrentUser() currentUser: AuthUser): Promise<QueueDto> {
    return this.queueService.advance(id, QueueStatus.PASSED, currentUser);
  }

  @Put(':id/recall')
  @Permissions(Permission.QUEUE_UPDATE)
  @ApiOperation({ summary: '过号召回（回到队尾，不插回原位）' })
  recall(@Param('id', ParseIntPipe) id: number, @CurrentUser() currentUser: AuthUser): Promise<QueueDto> {
    return this.queueService.advance(id, QueueStatus.WAITING, currentUser);
  }
}
