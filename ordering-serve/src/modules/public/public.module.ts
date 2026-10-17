import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { DishCategory } from '../dish-category/entities/dish-category.entity';
import { DishSpecGroup } from '../dish/entities/dish-spec-group.entity';
import { Dish } from '../dish/entities/dish.entity';
import { MerchantModule } from '../merchant/merchant.module';
import { OrderItem } from '../order/entities/order-item.entity';
import { Order } from '../order/entities/order.entity';
import { Payment } from '../payment/entities/payment.entity';
import { PopupModule } from '../popup/popup.module';
import { PointActivityModule } from '../point-activity/point-activity.module';
import { SpecOption } from '../spec-group/entities/spec-option.entity';
import { SpecGroup } from '../spec-group/entities/spec-group.entity';
import { Store } from '../store/entities/store.entity';
import { StoreDishModule } from '../store-dish/store-dish.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

/**
 * C 端公开读模块。
 *
 * 与 OrderModule 同样的理由：公开接口没有 AuthUser，直接注入实体仓储，
 * 不复用需要登录上下文的 DishService / StoreService。
 * 例外（门店菜单的「继承 + 例外」）通过 StoreDishModule 复用，保证四处口径一致。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Store,
      DishCategory,
      Dish,
      DishSpecGroup,
      SpecGroup,
      SpecOption,
      Order,
      OrderItem,
      Payment,
    ]),
    StoreDishModule,
    MerchantModule,
    AppConfigModule,
    PopupModule,
    // 活动条只读下发：可用性判定与门店/商户口径都由 PointActivityService 自己走一遍
    PointActivityModule,
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
