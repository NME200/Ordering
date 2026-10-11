import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAuthModule } from '../customer/customer-auth.module';
import { Customer } from '../customer/entities/customer.entity';
import { CouponController } from './coupon.controller';
import { CouponCustomerController } from './coupon-c.controller';
import { CouponService } from './coupon.service';
import { CouponTemplate } from './entities/coupon-template.entity';
import { CustomerCoupon } from './entities/customer-coupon.entity';

/**
 * 优惠券模块。
 *
 * 数据上只依赖自己的两张表 + customers（生日券要读生日），
 * 刻意不反向依赖 CustomerModule —— 顾客模块要调本模块发券，
 * 反向依赖会立刻成环。鉴权则复用 CustomerAuthModule 里的顾客守卫。
 */
@Module({
  imports: [TypeOrmModule.forFeature([CouponTemplate, CustomerCoupon, Customer]), CustomerAuthModule],
  controllers: [CouponController, CouponCustomerController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
