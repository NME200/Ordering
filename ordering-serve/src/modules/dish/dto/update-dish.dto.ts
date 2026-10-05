import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDishDto } from './create-dish.dto';

/**
 * 编辑菜品入参。
 *
 * 刻意剔除两个字段：
 * - `merchantId`：菜品不允许跨租户迁移；
 * - `storeId`：店专属归属在创建时就定死。改归属会让这道菜突然出现在别的店
 *   （或从别的店消失），并牵动已有分类与本店例外的可见性，
 *   要做应当是一个单独的「转正 / 下放」动作，而不是编辑接口顺带改掉。
 *
 * 允许修改 categoryId（菜品可在对本店可见的分类之间调整）。
 */
export class UpdateDishDto extends PartialType(
  OmitType(CreateDishDto, ['merchantId', 'storeId']),
) {}
