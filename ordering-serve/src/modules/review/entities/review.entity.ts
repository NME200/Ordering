import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 顾客订单评价。
 *
 * `(orderId)` 上是**唯一索引**：一单一评，重复提交直接被数据库挡掉，
 * 不靠「先查一遍再插入」—— 连点两次时那两句都会查到空。
 * 同一道约束顺带保证了「评价赠分」不会发两次。
 *
 * 只有已完成（COMPLETED）的订单能评价；待评价桶 = 已完成且本表无记录。
 */
@Entity('reviews')
@Unique('uk_review_order', ['orderId'])
@Index('idx_review_store', ['storeId'])
@Index('idx_review_merchant', ['merchantId'])
@Index('idx_review_customer', ['customerId'])
export class Review extends BaseEntity {
  @Column({ name: 'customer_id', type: 'bigint', transformer: bigintTransformer, comment: '评价人 ID' })
  customerId!: number;

  @Column({ name: 'order_id', type: 'bigint', transformer: bigintTransformer, comment: '订单 ID（一单一评）' })
  orderId!: number;

  @Column({ name: 'order_no', type: 'varchar', length: 32, comment: '订单号快照，列表页不用再回查订单' })
  orderNo!: string;

  @Column({ name: 'merchant_id', type: 'bigint', transformer: bigintTransformer, comment: '商户 ID' })
  merchantId!: number;

  @Column({ name: 'store_id', type: 'bigint', transformer: bigintTransformer, comment: '门店 ID' })
  storeId!: number;

  @Column({ type: 'tinyint', comment: '总体评分 1-5' })
  rating!: number;

  @Column({ type: 'json', nullable: true, comment: '标签，如 ["出餐快","味道好"]' })
  tags!: string[] | null;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '文字评价' })
  content!: string | null;

  @Column({ type: 'json', nullable: true, comment: '图片地址列表' })
  images!: string[] | null;

  @Column({ type: 'tinyint', default: 0, comment: '是否匿名：1 是（列表里昵称打码）' })
  anonymous!: number;

  @Column({
    name: 'point_awarded',
    type: 'int',
    default: 0,
    comment: '本次评价赠送的积分（0 表示未发放，补发时据此判断）',
  })
  pointAwarded!: number;

  @Column({ name: 'reply_content', type: 'varchar', length: 500, nullable: true, comment: '商家回复' })
  replyContent!: string | null;

  @Column({ name: 'replied_at', type: 'datetime', nullable: true, comment: '回复时间' })
  repliedAt!: Date | null;

  @Column({
    name: 'replied_by',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '回复人账号 ID',
  })
  repliedBy!: number | null;
}
