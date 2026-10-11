import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponModule } from '../coupon/coupon.module';
import { CustomerAddress } from '../customer/entities/customer-address.entity';
import { CustomerAuthModule } from '../customer/customer-auth.module';
import { CustomerOrderController } from './customer-order.controller';
import { DishSpecGroup } from '../dish/entities/dish-spec-group.entity';
import { Dish } from '../dish/entities/dish.entity';
import { SpecGroup } from '../spec-group/entities/spec-group.entity';
import { SpecOption } from '../spec-group/entities/spec-option.entity';
import { Store } from '../store/entities/store.entity';
import { StoreDishModule } from '../store-dish/store-dish.module';
import { StoreModule } from '../store/store.module';
import { MerchantModule } from '../merchant/merchant.module';
import { PaymentModule } from '../payment/payment.module';
import { OrderItemSpec } from './entities/order-item-spec.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

/**
 * 订单模块。
 *
 * 下单是 C 端公开接口，租户上下文来自 storeId（而非 JWT），
 * 因此这里直接注入菜单相关仓储，按 store 解析出的 merchantId 做隔离，
 * 不复用需要 AuthUser 的 DishService / SpecGroupService。
 *
 * 同理，C 端下单不经过 JwtStrategy，商户是否仍被平台放行必须在这里单独校验，
 * 所以引入 MerchantModule。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderItemSpec,
      Store,
      Dish,
      DishSpecGroup,
      SpecGroup,
      SpecOption,
      CustomerAddress,
    ]),
    MerchantModule,
    PaymentModule,
    StoreDishModule,
    // 台位清单：堂食单的桌号要能对上本店在用的台位（见 OrderService.assertTableUsable）
    StoreModule,
    CouponModule,
    CustomerAuthModule,
  ],
  controllers: [OrderController, CustomerOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
