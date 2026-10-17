import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { OptionalCustomerGuard } from '../customer/guards/optional-customer.guard';
import { CreatePaymentDto } from '../payment/dto/create-payment.dto';
import {
  PaymentResponseDto,
  PrepayResponseDto,
} from '../payment/dto/payment-response.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { OrderStatusCountDto } from './dto/order-status-count.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { OrderService } from './order.service';

/**
 * 订单接口。
 *
 * 创建订单为 **C 端公开接口**（扫码点餐无需登录），
 * 其余订单管理与状态流转接口都需要登录 + 相应权限。
 */
@ApiTags('订单')
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Public()
  @UseGuards(OptionalCustomerGuard)
  @RateLimit({ bucket: 'public-order-create', limit: 60, windowSeconds: 60 })
  @Post()
  @ApiOperation({
    summary: '创建订单（扫码点餐）',
    description:
      '金额一律由服务端按菜品当前价 + 规格增量计算，请求中不接收任何价格字段。' +
      '带了顾客令牌则订单归属到账号（进「我的订单」、可用券），没带就是游客单。',
  })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentCustomer() customer: AuthCustomer | undefined,
  ): Promise<OrderResponseDto> {
    return this.orderService.create(dto, customer);
  }

  @Post('pos')
  @ApiBearerAuth()
  @Permissions(Permission.ORDER_CREATE)
  @ApiOperation({
    summary: '收银台代客开单（POS）',
    description:
      '租户与门店取自 Token：收银员 / 门店管理员不能跨店开单，商户管理员须显式指定 storeId。' +
      '开出的单为待支付，收款走 /orders/:id/offline-pay（现金）或 /orders/:id/pay（在线支付）。',
  })
  createPos(
    @Body() dto: CreatePosOrderDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<OrderResponseDto> {
    return this.orderService.createPos(dto, currentUser);
  }

  @Get()
  @ApiBearerAuth()
  @Permissions(Permission.ORDER_READ)
  @ApiOperation({ summary: '分页查询订单' })
  paginate(
    @Query() query: QueryOrderDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<OrderResponseDto>> {
    return this.orderService.paginate(query, currentUser);
  }

  /** 注意：必须声明在 :id 之前，否则会被 :id 路由匹配走 */
  @Get('status-count')
  @ApiBearerAuth()
  @Permissions(Permission.ORDER_READ)
  @ApiOperation({ summary: '订单状态计数（商户端概览）' })
  statusSummary(
    @Query() query: QueryOrderDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<OrderStatusCountDto[]> {
    return this.orderService.statusSummary(
      currentUser,
      query.merchantId,
      query.storeId,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @Permissions(Permission.ORDER_READ)
  @ApiOperation({ summary: '查询订单详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<OrderResponseDto> {
    return this.orderService.findOne(id, currentUser);
  }

  @Public()
  @RateLimit({ bucket: 'public-order-pay', limit: 60, windowSeconds: 60 })
  @Post(':id/pay')
  @ApiOperation({
    summary: '发起在线支付（C 端扫码点餐后调用）',
    description:
      '必须在请求体带上下单响应返回的 payToken，服务端据此校验调用方归属；' +
      '票据缺失或不匹配一律按「订单不存在」处理。' +
      '支付结果由渠道回调 POST /payments/callback/:channel 确认后自动推进订单状态。',
  })
  createPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePaymentDto,
  ): Promise<PrepayResponseDto> {
    return this.orderService.createPayment(id, dto);
  }

  @Post(':id/offline-pay')
  @ApiBearerAuth()
  @Permissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: '标记线下收款（现金 / 收款码），直接置为已支付' })
  payOffline(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.orderService.payOffline(id, currentUser);
  }

  @Put(':id/accept')
  @ApiBearerAuth()
  @Permissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: '商户接单' })
  accept(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<OrderResponseDto> {
    return this.orderService.accept(id, currentUser);
  }

  @Put(':id/ready')
  @ApiBearerAuth()
  @Permissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: '出餐（通知取餐）' })
  markReady(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<OrderResponseDto> {
    return this.orderService.markReady(id, currentUser);
  }

  @Put(':id/complete')
  @ApiBearerAuth()
  @Permissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: '完成订单' })
  complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<OrderResponseDto> {
    return this.orderService.complete(id, currentUser);
  }

  @Put(':id/cancel')
  @ApiBearerAuth()
  @Permissions(Permission.ORDER_CANCEL)
  @ApiOperation({ summary: '取消订单 / 拒单' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOrderDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<OrderResponseDto> {
    return this.orderService.cancel(id, dto, currentUser);
  }
}
