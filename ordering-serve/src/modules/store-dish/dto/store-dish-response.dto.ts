import { ApiProperty } from '@nestjs/swagger';
import { DishStatus } from '../../../shared/enums/dish-status.enum';
import { StoreDish } from '../entities/store-dish.entity';

/** 门店例外出参（前端据此回显开关与门店价，列表的有效值仍由菜品接口给） */
export class StoreDishResponseDto {
  @ApiProperty({ description: '门店 ID', example: 1 })
  storeId!: number;

  @ApiProperty({ description: '菜品 ID', example: 12 })
  dishId!: number;

  @ApiProperty({ description: '本店是否售卖：0 停售 / 1 在售', enum: DishStatus })
  saleStatus!: DishStatus;

  @ApiProperty({ description: '门店售价（分）；null 表示跟随标准价', nullable: true })
  price!: number | null;

  @ApiProperty({ description: '门店会员价（分）；null 表示跟随标准会员价', nullable: true })
  memberPrice!: number | null;

  @ApiProperty({ description: '是否沽清', example: false })
  soldOut!: boolean;

  static from(entity: StoreDish): StoreDishResponseDto {
    const dto = new StoreDishResponseDto();
    dto.storeId = entity.storeId;
    dto.dishId = entity.dishId;
    dto.saleStatus = entity.saleStatus;
    dto.price = entity.price;
    dto.memberPrice = entity.memberPrice;
    dto.soldOut = entity.soldOut;
    return dto;
  }
}
