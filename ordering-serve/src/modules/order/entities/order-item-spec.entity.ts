import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 订单明细的规格快照。
 *
 * 独立成表（而非在明细上存 JSON）是为了支持「哪个规格卖得最好」这类统计，
 * 同时也让规格名称 / 增量价格在菜品调整后依然可追溯。
 */
@Entity('order_item_specs')
@Index('idx_ois_item', ['orderItemId'])
@Index('idx_ois_option', ['specOptionId'])
export class OrderItemSpec extends BaseEntity {
  @Column({
    name: 'order_item_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属订单明细 ID',
  })
  orderItemId!: number;

  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属商户 ID（租户隔离字段，冗余便于校验）',
  })
  merchantId!: number;

  @Column({
    name: 'spec_group_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '规格组 ID',
  })
  specGroupId!: number;

  @Column({ name: 'spec_group_name', type: 'varchar', length: 32, comment: '规格组名称（快照）' })
  specGroupName!: string;

  @Column({
    name: 'spec_option_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '规格项 ID',
  })
  specOptionId!: number;

  @Column({ name: 'spec_option_name', type: 'varchar', length: 32, comment: '规格项名称（快照）' })
  specOptionName!: string;

  @Column({ name: 'price_diff', type: 'int', default: 0, comment: '价格增量（分，快照）' })
  priceDiff!: number;
}
