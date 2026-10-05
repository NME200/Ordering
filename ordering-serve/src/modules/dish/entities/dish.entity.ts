import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { DishStatus } from '../../../shared/enums/dish-status.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 菜品实体。
 *
 * 价格约定（见 CODEBUDDY.md 8.3）：金额一律用**整数分**存储，
 * 展示层再转换为元，避免浮点误差。
 *
 * 规格/加料通过 dish_spec_groups 关联到商户级共享的规格组，
 * 实际售价 = price + 所选项的 price_diff 之和（下单时计算）。
 */
@Entity('dishes')
@Index('idx_dish_merchant', ['merchantId'])
@Index('idx_dish_category', ['categoryId'])
@Index('idx_dish_store', ['storeId'])
export class Dish extends BaseEntity {
  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属商户 ID（租户隔离字段）',
  })
  merchantId!: number;

  /**
   * 门店归属：NULL = 全商户通用，非 NULL = 该店专属（别的店查不到、也下不了单）。
   *
   * 与 `store_dishes` 的分工是两件事：本列决定「这个菜属于谁」，
   * `store_dishes` 决定「某家店卖不卖、卖多少钱」，不要混用。
   */
  @Column({
    name: 'store_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '门店归属：NULL 全商户通用 / 非 NULL 该店专属',
  })
  storeId!: number | null;

  @Column({
    name: 'category_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属分类 ID',
  })
  categoryId!: number;

  @Column({ name: 'name', type: 'varchar', length: 64, comment: '菜品名称' })
  name!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true, comment: '菜品描述' })
  description!: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 255, nullable: true, comment: '菜品图片地址' })
  imageUrl!: string | null;

  @Column({ name: 'price', type: 'int', comment: '售价（分）' })
  price!: number;

  @Column({ name: 'member_price', type: 'int', nullable: true, comment: '会员价（分），NULL 表示不区分' })
  memberPrice!: number | null;

  @Column({ name: 'unit', type: 'varchar', length: 8, default: '份', comment: '计价单位，如「份」「杯」' })
  unit!: string;

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序值，越小越靠前' })
  sort!: number;

  @Column({
    name: 'status',
    type: 'tinyint',
    default: DishStatus.ON_SHELF,
    comment: '状态：0 下架 / 1 上架',
  })
  status!: DishStatus;

  @Column({ name: 'is_recommend', type: 'boolean', default: false, comment: '是否推荐菜' })
  isRecommend!: boolean;

  @Column({ name: 'sold_count', type: 'int', default: 0, comment: '累计销量（由订单模块维护）' })
  soldCount!: number;
}
