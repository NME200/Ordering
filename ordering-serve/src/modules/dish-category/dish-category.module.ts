import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dish } from '../dish/entities/dish.entity';
import { StoreModule } from '../store/store.module';
import { DishCategoryController } from './dish-category.controller';
import { DishCategoryService } from './dish-category.service';
import { DishCategory } from './entities/dish-category.entity';

/**
 * 菜品分类模块。
 * 导出 DishCategoryService，供菜品模块校验分类归属。
 *
 * 引入 StoreModule 只为复用它的门店范围解析（店专属分类要确认门店属于当前租户），
 * 门店实体本身由 StoreModule 自己注册，这里不重复 forFeature。
 */
@Module({
  imports: [TypeOrmModule.forFeature([DishCategory, Dish]), StoreModule],
  controllers: [DishCategoryController],
  providers: [DishCategoryService],
  exports: [DishCategoryService],
})
export class DishCategoryModule {}
