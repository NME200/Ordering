import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ServiceSender } from '../../../shared/enums/service.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/** 客服会话消息。顾客侧按 `afterId` 增量轮询，因此 sessionId + id 是主查询路径 */
@Entity('service_messages')
@Index('idx_service_message_session', ['sessionId'])
export class ServiceMessage extends BaseEntity {
  @Column({ name: 'session_id', type: 'bigint', transformer: bigintTransformer, comment: '所属会话 ID' })
  sessionId!: number;

  @Column({ type: 'varchar', length: 16, comment: '发送方：customer / staff' })
  sender!: ServiceSender;

  @Column({
    name: 'sender_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '发送者 ID（顾客 ID 或员工账号 ID，按 sender 区分）',
  })
  senderId!: number;

  @Column({ name: 'sender_name', type: 'varchar', length: 32, comment: '发送者展示名快照' })
  senderName!: string;

  @Column({ type: 'varchar', length: 500, comment: '消息内容' })
  content!: string;

  @Column({
    name: 'order_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '随消息附带的订单号（顾客点「咨询某订单」时带上）',
  })
  orderNo!: string | null;

  @Column({ name: 'read_at', type: 'datetime', nullable: true, comment: '对方已读时间' })
  readAt!: Date | null;
}
