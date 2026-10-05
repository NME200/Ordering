import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDishCategoryDto } from './create-dish-category.dto';

/**
 * 编辑菜品分类入参。
 * 刻意剔除 merchantId：分类不允许跨租户迁移。
 */
export class UpdateDishCategoryDto extends PartialType(
  OmitType(CreateDishCategoryDto, ['merchantId']),
) {}
