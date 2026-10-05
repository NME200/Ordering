import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 菜品分类实体。
 *
 * 租户隔离：merchant_id 为必填租户字段，所有查询都必须带上它
 * （见 CODEBUDDY.md 8.1）。
 */
@Entity('dish_categories')
@Index('idx_dish_category_merchant', ['merchantId'])
@Index('idx_dish_category_store', ['storeId'])
export class DishCategory extends BaseEntity {
  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属商户 ID（租户隔离字段）',
  })
  merchantId!: number;

  /** 门店归属：NULL = 全商户通用，非 NULL = 该店专属分类 */
  @Column({
    name: 'store_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '门店归属：NULL 全商户通用 / 非 NULL 该店专属',
  })
  storeId!: number | null;

  @Column({ name: 'name', type: 'varchar', length: 32, comment: '分类名称，如「热菜」「饮品」' })
  name!: string;

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序值，越小越靠前' })
  sort!: number;

  @Column({
    name: 'status',
    type: 'tinyint',
    default: CommonStatus.ENABLED,
    comment: '状态：0 禁用 / 1 启用',
  })
  status!: CommonStatus;
}
