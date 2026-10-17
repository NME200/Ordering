import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DishCategory } from '../dish-category/entities/dish-category.entity';
import { Dish } from '../dish/entities/dish.entity';
import { MerchantModule } from '../merchant/merchant.module';
import { PointLog } from '../customer/entities/point-log.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Store } from '../store/entities/store.entity';
import { PointActivityController } from './point-activity.controller';
import { PointActivityService } from './point-activity.service';
import { PointActivity } from './entities/point-activity.entity';

/**
 * 平台积分营销活动模块。
 *
 * 直接注入 `PointLog / Merchant / Store / Dish / DishCategory` 五个仓储而不是借别人的 Service：
 * 发放统计要聚合流水、商户范围要拿商户全集、公开活动条要认门店可用性、
 * 命中条件要按现值判菜品分类 —— 都只读。借接口会逼着 CustomerModule 与 StoreModule
 * 反过来依赖本模块形成环（MemberService 要用本模块算加成，方向必须是
 * CustomerModule → PointActivityModule）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PointActivity,
      PointLog,
      Merchant,
      Store,
      Dish,
      DishCategory,
    ]),
    MerchantModule,
  ],
  controllers: [PointActivityController],
  providers: [PointActivityService],
  exports: [PointActivityService],
})
export class PointActivityModule {}
