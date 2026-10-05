import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DishCategoryModule } from '../dish-category/dish-category.module';
import { SpecGroupModule } from '../spec-group/spec-group.module';
import { StoreModule } from '../store/store.module';
import { StoreDishModule } from '../store-dish/store-dish.module';
import { DishController } from './dish.controller';
import { DishService } from './dish.service';
import { DishSpecGroup } from './entities/dish-spec-group.entity';
import { Dish } from './entities/dish.entity';

/**
 * 菜品模块。
 * 依赖分类模块（校验分类归属）与规格组模块（校验规格组归属）。
 *
 * StoreModule 用于校验店专属归属，StoreDishModule 提供「本店例外」的
 * 读写与门店有效值合并（店长上下架落在这里，不动标准菜单）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Dish, DishSpecGroup]),
    DishCategoryModule,
    SpecGroupModule,
    StoreModule,
    StoreDishModule,
  ],
  controllers: [DishController],
  providers: [DishService],
  exports: [DishService],
})
export class DishModule {}
