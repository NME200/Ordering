import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAuthModule } from './customer-auth.module';
import { CouponModule } from '../coupon/coupon.module';
import { CustomerCoupon } from '../coupon/entities/customer-coupon.entity';
import { MiniappModule } from '../miniapp/miniapp.module';
import { PointActivityModule } from '../point-activity/point-activity.module';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Payment } from '../payment/entities/payment.entity';
import { Review } from '../review/entities/review.entity';
import { Store } from '../store/entities/store.entity';
import { AddressService } from './address.service';
import { CustomerAdminController } from './customer-admin.controller';
import { CustomerController } from './customer.controller';
import { CustomerOrderService } from './customer-order.service';
import { CustomerService } from './customer.service';
import { CustomerAddress } from './entities/customer-address.entity';
import { Customer } from './entities/customer.entity';
import { MemberProfile } from './entities/member-profile.entity';
import { PointLog } from './entities/point-log.entity';
import { MemberService } from './member.service';

/**
 * 顾客域模块（账号 / 资料 / 地址 / 会员资产 / 我的订单）。
 *
 * 本模块**不导入 OrderModule**：「我的订单」直接用自己的仓储查 orders 表。
 * 原因是支付模块要调本模块加积分，而订单模块又依赖支付模块 ——
 * 一旦本模块反向依赖订单模块就成环，Nest 启动时才会发现，报错还很难读。
 * 代价是 C 端订单出参与商户端各写一份，但两者的授权模型本来就不一样。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      CustomerAddress,
      MemberProfile,
      PointLog,
      CustomerCoupon,
      Order,
      OrderItem,
      Payment,
      Store,
      Review,
    ]),
    CustomerAuthModule,
    CouponModule,
    // 微信登录与手机号组件：凭据和接口客户端都在 miniapp 那边
    MiniappModule,
    // 积分活动的加成口径由 PointActivityService 给（方向是本模块依赖它，不反向）
    PointActivityModule,
  ],
  controllers: [CustomerController, CustomerAdminController],
  providers: [CustomerService, MemberService, AddressService, CustomerOrderService],
  exports: [CustomerService, MemberService, AddressService],
})
export class CustomerModule {}
