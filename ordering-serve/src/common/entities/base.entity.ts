import {
  Generated,
  PrimaryColumn,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../shared/utils/transformers';

/**
 * 全项目公共实体基类。
 *
 * 约定（见 CODEBUDDY.md 5.7 / 8.3）：
 * - 主键统一 bigint 自增；
 * - 公共审计列 created_at / updated_at / deleted_at（软删除）；
 * - 子实体通过 extends BaseEntity 继承，无需重复声明。
 */
export abstract class BaseEntity {
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer, comment: '主键 ID' })
  @Generated('increment')
  id!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', comment: '创建时间' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', comment: '更新时间' })
  updatedAt!: Date;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'datetime',
    nullable: true,
    comment: '删除时间（软删除）',
  })
  deletedAt!: Date | null;
}
