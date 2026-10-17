import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevOnlyGuard } from '../../common/guards/dev-only.guard';
import { CouponModule } from '../coupon/coupon.module';
import { CustomerModule } from '../customer/customer.module';
import { Customer } from '../customer/entities/customer.entity';
import { PaymentConfig } from '../payment-config/entities/payment-config.entity';
import { Order } from '../order/entities/order.entity';
import { Payment } from './entities/payment.entity';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';

/**
 * 支付模块。
 *
 * 直接注入 Order 与 PaymentConfig 仓储（而非 OrderService / PaymentConfigService），
 * 避免与 OrderModule、PaymentConfigModule 形成循环依赖 ——
 * OrderModule 需要 PaymentService 做「取消订单自动退款」，
 * PaymentConfigModule 需要 PaymentProviderRegistry 做「配置改完热生效」。
 * 订单状态流转的合法性由 order-status-flow 的纯函数保证，不依赖 OrderService。
 *
 * 引入 CustomerModule / CouponModule 是为了「支付成功后累计积分、把券转成已核销」：
 * 这两件事必须挂在**支付**这个事实上，挂在下单上会让未付款的订单也拿到积分。
 * 依赖方向是 支付 → 顾客 → 优惠券，没有任何一环反向指回支付，不会成环。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, PaymentConfig, Customer]),
    CustomerModule,
    CouponModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentProviderRegistry, DevOnlyGuard],
  exports: [PaymentService, PaymentProviderRegistry],
})
export class PaymentModule {}
