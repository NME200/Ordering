import { Column, CreateDateColumn, Entity, Generated, Index, PrimaryColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 菜品 ↔ 规格组 关联表。
 *
 * 刻意**不继承 BaseEntity**：这是纯关联表，没有软删除语义，
 * 解除关联时直接物理删除，避免「软删后重新关联同一组合」时的唯一约束冲突。
 */
@Entity('dish_spec_groups')
@Index('idx_dsg_dish', ['dishId'])
@Index('idx_dsg_group', ['specGroupId'])
@Unique('uk_dsg_dish_group', ['dishId', 'specGroupId'])
export class DishSpecGroup {
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer, comment: '主键 ID' })
  @Generated('increment')
  id!: number;

  @Column({
    name: 'dish_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '菜品 ID',
  })
  dishId!: number;

  @Column({
    name: 'spec_group_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '规格组 ID',
  })
  specGroupId!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', comment: '创建时间' })
  createdAt!: Date;
}
