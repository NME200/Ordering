import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { CouponService } from './coupon.service';
import { CouponCenterItemDto, CustomerCouponDto, ReceiveCouponDto, QueryMyCouponDto } from './dto/coupon.dto';

/** 商户上下文：C 端所有营销接口都要知道「现在在谁家」 */
class MerchantQueryDto {
  @ApiProperty({ description: '商户 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId!: number;
}

/** 下单选券：除商户外还要带订单商品总额（分） */
class UsableCouponQueryDto extends MerchantQueryDto {
  @ApiProperty({ description: '订单商品总额（分）', example: 3200 })
  @Type(() => Number)
  @IsInt({ message: 'amount 必须为整数（分）' })
  @Min(0, { message: 'amount 不能为负' })
  amount!: number;
}

/**
 * 顾客侧优惠券接口。
 *
 * `@Public()` + `CustomerAuthGuard` 的组合是本项目 C 端接线的固定写法：
 * 全局员工守卫只认后台账号，顾客路由必须先放行、再由顾客守卫鉴权。
 */
@Public()
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@ApiTags('顾客端 · 优惠券')
@Controller('customer/coupons')
export class CouponCustomerController {
  constructor(private readonly couponService: CouponService) {}

  @Get('center')
  @RateLimit({ bucket: 'customer-coupon-center', limit: 60, windowSeconds: 60 })
  @ApiOperation({
    summary: '领券中心',
    description: '只出本商户可用 + 平台通用券；每张带「我还能不能领」与原因。',
  })
  center(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: MerchantQueryDto,
  ): Promise<CouponCenterItemDto[]> {
    return this.couponService.centerList(customer.customerId, query.merchantId);
  }

  @Post('receive')
  @RateLimit({ bucket: 'customer-coupon-receive', limit: 20, windowSeconds: 60 })
  @ApiOperation({ summary: '领取一张券' })
  receive(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: ReceiveCouponDto,
  ): Promise<CustomerCouponDto> {
    return this.couponService.receive(customer.customerId, dto.templateId);
  }

  @Post('birthday')
  @RateLimit({ bucket: 'customer-coupon-birthday', limit: 5, windowSeconds: 60 })
  @ApiOperation({
    summary: '领取生日券',
    description: '只在生日当月可领，每年一张；生日登记后不可修改。',
  })
  birthday(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: MerchantQueryDto,
  ): Promise<CustomerCouponDto> {
    return this.couponService.claimBirthdayCoupon(customer.customerId, query.merchantId);
  }

  @Get('mine')
  @ApiOperation({ summary: '我的优惠券（未使用 / 已使用 / 已过期）' })
  mine(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: QueryMyCouponDto,
  ): Promise<CustomerCouponDto[]> {
    return this.couponService.mineList(customer.customerId, query);
  }

  @Get('usable')
  @ApiOperation({
    summary: '下单可用券列表',
    description: '不可用的也返回并附原因，前端据此置灰，别让顾客以为券丢了。',
  })
  @ApiQuery({ name: 'merchantId', example: 1 })
  @ApiQuery({ name: 'amount', example: 3200, description: '订单商品总额（分）' })
  usable(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: UsableCouponQueryDto,
  ): Promise<CustomerCouponDto[]> {
    return this.couponService.usableForAmount(
      customer.customerId,
      query.merchantId,
      query.amount,
    );
  }
}
