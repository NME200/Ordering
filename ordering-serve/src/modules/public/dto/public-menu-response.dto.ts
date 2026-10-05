import { ApiProperty } from '@nestjs/swagger';
import { SpecType } from '../../../shared/enums/spec-type.enum';
import { PublicStoreResponseDto } from './public-store-response.dto';

/** 规格项（只给点单要用的字段，不含状态与排序内部值） */
export class PublicSpecOptionDto {
  @ApiProperty({ description: '规格项 ID', example: 3 })
  id!: number;

  @ApiProperty({ description: '规格项名称', example: '大杯' })
  name!: string;

  @ApiProperty({ description: '价格增量（分），可为负', example: 300 })
  priceDiff!: number;
}

/** 规格组 */
export class PublicSpecGroupDto {
  @ApiProperty({ description: '规格组 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '规格组名称', example: '杯型' })
  name!: string;

  @ApiProperty({ description: '选择类型：0 单选 / 1 多选', enum: SpecType })
  type!: SpecType;

  @ApiProperty({ description: '是否必选', example: true })
  isRequired!: boolean;

  @ApiProperty({ description: '可选规格项', type: [PublicSpecOptionDto] })
  options!: PublicSpecOptionDto[];
}

/** 菜单里的菜品 */
export class PublicMenuDishDto {
  @ApiProperty({ description: '菜品 ID', example: 12 })
  id!: number;

  @ApiProperty({ description: '菜品名称', example: '宫保鸡丁' })
  name!: string;

  @ApiProperty({ description: '菜品描述', nullable: true })
  description!: string | null;

  @ApiProperty({ description: '菜品图片地址', nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ description: '售价（分）—— 已是本店有效价', example: 3800 })
  price!: number;

  @ApiProperty({ description: '计价单位', example: '份' })
  unit!: string;

  @ApiProperty({ description: '排序值', example: 0 })
  sort!: number;

  @ApiProperty({ description: '是否推荐菜', example: false })
  isRecommend!: boolean;

  @ApiProperty({ description: '本店是否已沽清（今日售罄）', example: false })
  soldOut!: boolean;

  @ApiProperty({ description: '规格组', type: [PublicSpecGroupDto] })
  specGroups!: PublicSpecGroupDto[];
}

/** 菜单分类 */
export class PublicMenuCategoryDto {
  @ApiProperty({ description: '分类 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '分类名称', example: '热菜' })
  name!: string;

  @ApiProperty({ description: '排序值', example: 0 })
  sort!: number;

  @ApiProperty({ description: '该分类下的在售菜品', type: [PublicMenuDishDto] })
  dishes!: PublicMenuDishDto[];
}

/**
 * C 端一次拉全的菜单。
 *
 * 刻意**不含会员价**：C 端没有会员身份，摆出来只会让顾客追问为什么用不上。
 */
export class PublicMenuResponseDto {
  @ApiProperty({ description: '门店信息', type: PublicStoreResponseDto })
  store!: PublicStoreResponseDto;

  @ApiProperty({ description: '分类与菜品', type: [PublicMenuCategoryDto] })
  categories!: PublicMenuCategoryDto[];
}
