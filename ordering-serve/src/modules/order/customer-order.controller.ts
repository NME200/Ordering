import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import {
  PAYMENT_CHANNEL_VALUES,
  PaymentChannel,
} from '../../shared/enums/payment-channel.enum';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { PaymentService } from '../payment/payment.service';
import { PrepayResponseDto } from '../payment/dto/payment-response.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderService } from './order.service';

/**
 * 发起支付的入参。渠道不传按模拟渠道，与公开那条路径保持一致。
 *
 * `@IsIn` 不能省：全局 ValidationPipe 开了 whitelist，
 * 没有任何校验装饰器的字段会在进入服务层之前就被剥掉，写成可选参数等于永远拿不到值。
 */
class CustomerPayDto {
  @ApiPropertyOptional({ description: '支付渠道，默认 mock', example: 'mock' })
  @IsOptional()
  @IsIn(PAYMENT_CHANNEL_VALUES, { message: '不支持的支付渠道' })
  channel?: PaymentChannel;
}

/**
 * 顾客对自己订单的写操作。
 *
 * 放在订单模块而不是顾客模块，是因为它要同时用 OrderService 与 PaymentService：
 * 顾客模块若反向依赖订单模块，就会形成 顾客 → 订单 → 支付 → 顾客 的环
 * （支付要调会员服务加积分，那条依赖不能拆）。
 * 读侧（列表 / 详情）留在 `CustomerController`，那里只需要仓储。
 */
@Public()
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@ApiTags('顾客端 · 我的订单')
@Controller('customer/orders')
export class CustomerOrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post(':id/cancel')
  @RateLimit({ bucket: 'customer-order-cancel', limit: 10, windowSeconds: 60 })
  @ApiOperation({
    summary: '取消我的未支付订单',
    description: '已支付或已流转的单不在这里退，需联系门店由经营者走退款 —— 退款不该是公开自助接口。',
  })
  cancel(
    @CurrentCustomer() customer: AuthCustomer,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderResponseDto> {
    return this.orderService.cancelByCustomer(id, customer.customerId);
  }

  @Post(':id/pay')
  @RateLimit({ bucket: 'customer-order-pay', limit: 20, windowSeconds: 60 })
  @ApiOperation({
    summary: '为我的订单发起支付（不需要 payToken）',
    description: '归属由 customer_id 证明，所以换设备或清过缓存也能把没付的单子付掉。',
  })
  pay(
    @CurrentCustomer() customer: AuthCustomer,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CustomerPayDto,
  ): Promise<PrepayResponseDto> {
    return this.paymentService.createPaymentForOwner(
      id,
      customer.customerId,
      dto.channel ?? PaymentChannel.MOCK,
    );
  }
}
