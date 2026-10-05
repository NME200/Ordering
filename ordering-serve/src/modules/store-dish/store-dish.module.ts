import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dish } from '../dish/entities/dish.entity';
import { StoreModule } from '../store/store.module';
import { StoreDishController } from './store-dish.controller';
import { StoreDish } from './entities/store-dish.entity';
import { StoreDishService } from './store-dish.service';

/**
 * 门店菜单模块（「继承 + 例外」的例外侧）。
 *
 * 只引 StoreModule 与 Dish **实体**，不引 DishModule —— 后者依赖本模块，
 * 互相引用会成环。
 */
@Module({
  imports: [TypeOrmModule.forFeature([StoreDish, Dish]), StoreModule],
  controllers: [StoreDishController],
  providers: [StoreDishService],
  exports: [StoreDishService],
})
export class StoreDishModule {}
