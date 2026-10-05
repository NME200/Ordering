import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevOnlyGuard } from '../../common/guards/dev-only.guard';
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
 * 渠道实现不再是模块级 provider：它们由 PaymentProviderFactory 按数据库配置实例化。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Payment, Order, PaymentConfig])],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentProviderRegistry, DevOnlyGuard],
  exports: [PaymentService, PaymentProviderRegistry],
})
export class PaymentModule {}
