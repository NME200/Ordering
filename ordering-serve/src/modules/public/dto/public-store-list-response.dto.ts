import { ApiProperty } from '@nestjs/swagger';
import { Store } from '../../store/entities/store.entity';
import { PublicStoreResponseDto } from './public-store-response.dto';

/** 列表项：门店公开信息 + 月售 */
export class PublicStoreListItemDto extends PublicStoreResponseDto {
  /**
   * 近 30 天**已完成**订单的份数。
   *
   * 与菜单里每个菜品的 `monthlySales` 同一口径（只数已完成，进行中与已取消都不掺）。
   * 设计稿上的「评分」没有实现：项目没有评价表，宁可空着也不摆一个假星级。
   */
  @ApiProperty({ description: '近 30 天完成订单的菜品份数', example: 2000 })
  monthlySales!: number;

  /** 不叫 `from`：父类已有同名静态方法，签名不同会撞类型（继承的是静态侧） */
  static withSales(store: Store, monthlySales: number): PublicStoreListItemDto {
    const base = PublicStoreResponseDto.from(store);
    const dto = Object.assign(new PublicStoreListItemDto(), base);
    dto.monthlySales = monthlySales;
    return dto;
  }
}

/** 门店列表响应 */
export class PublicStoreListResponseDto {
  @ApiProperty({ description: '门店列表，按 ID 升序；按距离/月售排序由前端做', type: [PublicStoreListItemDto] })
  stores!: PublicStoreListItemDto[];
}
