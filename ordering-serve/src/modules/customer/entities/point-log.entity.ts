import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PointReason } from '../../../shared/enums/customer.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 积分 / 成长值流水。
 *
 * 两个用途：
 * 1. **幂等**：`(orderId, reason)` 上有唯一索引。支付回调会重复到达、
 *    评价接口会被连点，没有这道约束同一笔订单能加两次积分；
 *    MySQL 唯一索引允许多个 NULL，所以人工调整（无订单）不受影响。
 * 2. **对账**：顾客问「我的积分怎么少了 50」时，这是唯一能回答问题的东西。
 */
@Entity('point_logs')
@Unique('uk_point_order_reason', ['orderId', 'reason'])
@Index('idx_point_customer_merchant', ['customerId', 'merchantId'])
@Index('idx_point_activity_customer', ['activityId', 'customerId'])
export class PointLog extends BaseEntity {
  @Column({ name: 'customer_id', type: 'bigint', transformer: bigintTransformer, comment: '顾客 ID' })
  customerId!: number;

  @Column({ name: 'merchant_id', type: 'bigint', transformer: bigintTransformer, comment: '商户 ID' })
  merchantId!: number;

  @Column({ name: 'point_change', type: 'int', default: 0, comment: '积分变动（正数增加，负数扣减）' })
  pointChange!: number;

  @Column({ name: 'growth_change', type: 'int', default: 0, comment: '成长值变动' })
  growthChange!: number;

  @Column({ name: 'point_after', type: 'int', default: 0, comment: '变动后的积分余额快照' })
  pointAfter!: number;

  @Column({
    type: 'varchar',
    length: 32,
    comment: '变动原因：order / refund / review / manual / activity / activity_review / activity_revoke',
  })
  reason!: PointReason;

  @Column({ name: 'order_id', type: 'bigint', transformer: bigintTransformer, nullable: true, comment: '关联订单 ID' })
  orderId!: number | null;

  /**
   * 关联的积分活动 ID。只有 `activity*` 三类原因才写。
   *
   * 刻意**不并进唯一键**：MySQL 唯一索引允许多个 NULL，把 activity_id 加进去
   * 会让常规的 (orderId, reason) 行失去幂等保护，重复支付回调就能加两次分。
   */
  @Column({
    name: 'activity_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '积分活动 ID（仅 activity* 原因有）',
  })
  activityId!: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '说明文案，直接给顾客看' })
  remark!: string | null;
}
