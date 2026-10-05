import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { SpecType } from '../../../shared/enums/spec-type.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 规格组实体（商户级共享）。
 *
 * 一个规格组可被多个菜品复用，例如「甜度」适用于所有饮品。
 * 组内选项见 SpecOption；菜品与规格组的关联见 DishSpecGroup。
 *
 * 说明：组内选项数量有限（通常 < 20），关联查询按 groupId 批量取，
 * 因此这里不使用 ORM 关系映射，保持显式、可控。
 */
@Entity('spec_groups')
@Index('idx_spec_group_merchant', ['merchantId'])
export class SpecGroup extends BaseEntity {
  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属商户 ID（租户隔离字段）',
  })
  merchantId!: number;

  @Column({ name: 'name', type: 'varchar', length: 32, comment: '规格组名称，如「规格」「甜度」「加料」' })
  name!: string;

  @Column({
    name: 'type',
    type: 'tinyint',
    default: SpecType.SINGLE,
    comment: '选购方式：1 单选 / 2 多选',
  })
  type!: SpecType;

  @Column({
    name: 'is_required',
    type: 'boolean',
    default: false,
    comment: '是否必选：false 可跳过 / true 必选',
  })
  isRequired!: boolean;

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
