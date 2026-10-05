import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { DishStatus } from '../../../shared/enums/dish-status.enum';

/** 菜品上下架入参（用于列表页快速切换） */
export class UpdateDishStatusDto {
  @ApiProperty({ description: '状态：0 下架 / 1 上架', enum: DishStatus, example: DishStatus.OFF_SHELF })
  @Type(() => Number)
  @IsEnum(DishStatus, { message: 'status 只能是 0（下架）或 1（上架）' })
  status!: DishStatus;
}
