import { ApiProperty } from '@nestjs/swagger';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { DishCategory } from '../entities/dish-category.entity';

/** 菜品分类出参 DTO */
export class DishCategoryResponseDto {
  @ApiProperty({ description: '分类 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '所属商户 ID', example: 1 })
  merchantId!: number;

  @ApiProperty({ description: '分类名称', example: '热菜' })
  name!: string;

  @ApiProperty({
    description: '归属门店 ID：null 表示全商户通用，非 null 表示该店专属',
    nullable: true,
    example: null,
  })
  storeId!: number | null;

  @ApiProperty({ description: '排序值', example: 0 })
  sort!: number;

  @ApiProperty({ description: '状态：0 禁用 / 1 启用', enum: CommonStatus })
  status!: CommonStatus;

  @ApiProperty({ description: '创建时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(entity: DishCategory): DishCategoryResponseDto {
    const dto = new DishCategoryResponseDto();
    dto.id = entity.id;
    dto.merchantId = entity.merchantId;
    dto.name = entity.name;
    dto.storeId = entity.storeId;
    dto.sort = entity.sort;
    dto.status = entity.status;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
