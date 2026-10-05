import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DishSpecGroup } from '../dish/entities/dish-spec-group.entity';
import { SpecGroup } from './entities/spec-group.entity';
import { SpecOption } from './entities/spec-option.entity';
import { SpecGroupController } from './spec-group.controller';
import { SpecGroupService } from './spec-group.service';

/**
 * 规格组模块。
 * 导出 SpecGroupService，供菜品模块校验规格组归属。
 */
@Module({
  imports: [TypeOrmModule.forFeature([SpecGroup, SpecOption, DishSpecGroup])],
  controllers: [SpecGroupController],
  providers: [SpecGroupService],
  exports: [SpecGroupService],
})
export class SpecGroupModule {}
