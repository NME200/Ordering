import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ServiceSessionStatus } from '../../../shared/enums/service.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 客服会话。
 *
 * 「一个顾客 × 一个商户」一条，可反复重开：会话本身不删除，只切状态。
 * 另起新会话没有意义 —— 顾客要的是接着上次问，商户要的是完整上下文。
 *
 * `lastMessage` 是列表页预览用的冗余字段。会话列表每次都要取最后一条消息的话，
 * 商户侧一屏 20 条就是 20 次查询。
 */
@Entity('service_sessions')
@Unique('uk_service_customer_merchant', ['customerId', 'merchantId'])
@Index('idx_service_merchant_status', ['merchantId', 'status'])
export class ServiceSession extends BaseEntity {
  @Column({ name: 'customer_id', type: 'bigint', transformer: bigintTransformer, comment: '顾客 ID' })
  customerId!: number;

  @Column({ name: 'merchant_id', type: 'bigint', transformer: bigintTransformer, comment: '商户 ID' })
  merchantId!: number;

  @Column({
    name: 'store_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '最近一次咨询涉及的门店',
  })
  storeId!: number | null;

  @Column({
    name: 'order_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '关联订单（设计稿：进会话自动带上当前订单上下文）',
  })
  orderId!: number | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: ServiceSessionStatus.OPEN,
    comment: '状态：open 待回复 / replied 已回复 / closed 已结束',
  })
  status!: ServiceSessionStatus;

  @Column({
    name: 'last_message',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '最后一条消息内容快照（列表预览）',
  })
  lastMessage!: string | null;

  @Column({ name: 'last_message_at', type: 'datetime', nullable: true, comment: '最后一条消息时间' })
  lastMessageAt!: Date | null;

  @Column({ name: 'customer_unread', type: 'int', default: 0, comment: '顾客侧未读数' })
  customerUnread!: number;

  @Column({ name: 'staff_unread', type: 'int', default: 0, comment: '客服侧未读数' })
  staffUnread!: number;
}
