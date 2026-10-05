import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DishStatus } from '../../../shared/enums/dish-status.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 门店菜品例外 ——「继承 + 例外」门店菜单的例外侧。
 *
 * 只存**与商户标准菜单不同**的部分：没有本表记录 = 该店完全继承标准菜单
 * （在售与价格都跟随 `dishes`）。因此新开门店与新增菜品都不需要回填。
 *
 * 刻意**不继承 BaseEntity**：与 `dish_spec_groups` 同理 —— 唯一键
 * `(store_id, dish_id)` 与软删除会打架（「删掉例外」的语义是恢复继承，
 * 是物理动作），所以这里走硬删。
 */
@Entity('store_dishes')
@Index('idx_sd_store', ['storeId'])
@Unique('uk_sd_store_dish', ['storeId', 'dishId'])
export class StoreDish {
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer, comment: '主键 ID' })
  @Generated('increment')
  id!: number;

  @Column({
    name: 'store_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '门店 ID',
  })
  storeId!: number;

  @Column({
    name: 'dish_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '商户标准菜品 ID',
  })
  dishId!: number;

  @Column({
    name: 'sale_status',
    type: 'tinyint',
    default: DishStatus.ON_SHELF,
    comment: '本店是否售卖：0 停售 / 1 在售（覆盖 dishes.status）',
  })
  saleStatus!: DishStatus;

  @Column({
    name: 'price',
    type: 'int',
    nullable: true,
    comment: '门店售价（分）；NULL 表示跟随标准价',
  })
  price!: number | null;

  @Column({
    name: 'member_price',
    type: 'int',
    nullable: true,
    comment: '门店会员价（分）；NULL 表示跟随标准会员价',
  })
  memberPrice!: number | null;

  @Column({
    name: 'sold_out',
    type: 'boolean',
    default: false,
    comment: '沽清（当日售罄）：临时状态，与「停售」语义不同',
  })
  soldOut!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', comment: '创建时间' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', comment: '更新时间' })
  updatedAt!: Date;
}
