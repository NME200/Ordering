import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 订单明细。
 *
 * **价格快照**：菜品名称、图片、基础单价在下单时全部落库，
 * 之后商户改价 / 改菜名都不会影响历史订单（见 CODEBUDDY.md 8.3 数据设计）。
 *
 * 小计 = (unit_price + spec_amount) * quantity，全部为整数分。
 */
@Entity('order_items')
@Index('idx_order_item_order', ['orderId'])
@Index('idx_order_item_merchant', ['merchantId'])
export class OrderItem extends BaseEntity {
  @Column({
    name: 'order_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属订单 ID',
  })
  orderId!: number;

  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属商户 ID（租户隔离字段，冗余便于校验）',
  })
  merchantId!: number;

  @Column({ name: 'dish_id', type: 'bigint', transformer: bigintTransformer, comment: '菜品 ID' })
  dishId!: number;

  @Column({ name: 'dish_name', type: 'varchar', length: 64, comment: '菜品名称（下单时快照）' })
  dishName!: string;

  @Column({
    name: 'dish_image_url',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '菜品图片（下单时快照）',
  })
  dishImageUrl!: string | null;

  @Column({ name: 'unit_price', type: 'int', comment: '菜品基础单价（分，下单时快照）' })
  unitPrice!: number;

  @Column({ name: 'spec_amount', type: 'int', default: 0, comment: '所选规格的增量合计（分/份）' })
  specAmount!: number;

  @Column({
    name: 'spec_summary',
    type: 'varchar',
    length: 128,
    default: '',
    comment: '规格摘要文字，如「大杯 / 加珍珠」',
  })
  specSummary!: string;

  @Column({ name: 'quantity', type: 'int', comment: '数量' })
  quantity!: number;

  @Column({
    name: 'subtotal',
    type: 'int',
    comment: '小计（分）= (unit_price + spec_amount) * quantity',
  })
  subtotal!: number;
}
