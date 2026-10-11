import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { QueueStatus } from '../../../shared/enums/queue.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 排队取号。
 *
 * 队列按「门店 + 营业日 + 桌型」独立编号，号面是 `A012` 这种可读形式，
 * 其中序号由 `(storeId, bizDate, tableType)` 下的 `no` 自增得到，
 * 并有联合唯一索引兜底 —— 并发取号时两个请求算出同一个号是必然发生的，
 * 只能靠数据库挡，不能靠「先查最大值再 +1」。
 *
 * 过号（PASSED）不自动发生：没有定时任务替门店做主，由店员在叫号台上点。
 */
@Entity('queues')
@Unique('uk_queue_store_date_type_no', ['storeId', 'bizDate', 'tableType', 'no'])
@Index('idx_queue_store_status', ['storeId', 'bizDate', 'status'])
@Index('idx_queue_customer_status', ['customerId', 'status'])
export class Queue extends BaseEntity {
  @Column({ name: 'merchant_id', type: 'bigint', transformer: bigintTransformer, comment: '商户 ID' })
  merchantId!: number;

  @Column({ name: 'store_id', type: 'bigint', transformer: bigintTransformer, comment: '门店 ID' })
  storeId!: number;

  @Column({ name: 'store_name', type: 'varchar', length: 64, comment: '门店名快照（顾客侧展示）' })
  storeName!: string;

  @Column({ name: 'biz_date', type: 'varchar', length: 10, comment: '营业日 YYYY-MM-DD，跨天即换队列' })
  bizDate!: string;

  @Column({ name: 'table_type', type: 'varchar', length: 16, comment: '桌型 key：small / medium / large' })
  tableType!: string;

  @Column({ name: 'no', type: 'int', comment: '当日该桌型的序号' })
  no!: number;

  @Column({ name: 'queue_no', type: 'varchar', length: 16, comment: '号面，如 A012' })
  queueNo!: string;

  @Column({ name: 'party_size', type: 'smallint', comment: '就餐人数' })
  partySize!: number;

  @Column({
    name: 'customer_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '取号顾客 ID；门店代客取号时为 NULL',
  })
  customerId!: number | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true, comment: '联系手机号' })
  phone!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: QueueStatus.WAITING,
    comment: '状态：waiting / called / seated / passed / cancelled',
  })
  status!: QueueStatus;

  @Column({ name: 'called_at', type: 'datetime', nullable: true, comment: '叫号时间' })
  calledAt!: Date | null;

  @Column({ name: 'seated_at', type: 'datetime', nullable: true, comment: '入座时间' })
  seatedAt!: Date | null;

  @Column({
    name: 'created_by',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '代客取号的员工账号 ID（顾客自助取号为 NULL）',
  })
  createdBy!: number | null;
}
