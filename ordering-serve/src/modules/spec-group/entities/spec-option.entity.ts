import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 规格项实体。
 *
 * price_diff 为**相对菜品基础价的增量**，单位「分」，可为负数
 * （如「小杯 -200」）。最终价格 = 菜品价 + 所选项增量之和。
 */
@Entity('spec_options')
@Index('idx_spec_option_group', ['groupId'])
@Index('idx_spec_option_merchant', ['merchantId'])
export class SpecOption extends BaseEntity {
  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属商户 ID（租户隔离字段，冗余便于校验）',
  })
  merchantId!: number;

  @Column({
    name: 'group_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属规格组 ID',
  })
  groupId!: number;

  @Column({ name: 'name', type: 'varchar', length: 32, comment: '选项名称，如「大杯」「加珍珠」' })
  name!: string;

  @Column({ name: 'price_diff', type: 'int', default: 0, comment: '价格增量（分），可为负' })
  priceDiff!: number;

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
