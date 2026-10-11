import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { InvoiceStatus, InvoiceTitleKind } from '../../../shared/enums/invoice.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 开票申请。
 *
 * 本轮**不接任何开票服务商**：顾客提交后落到商户，由商户线下开电子发票再回填发票号，
 * 所以状态机保留了「开票中」这个人工环节。
 *
 * `orderId` 唯一 —— 一单一票。要拆票的场景（一张单开给两家公司）本轮不支持，
 * 但必须挡住「同一笔钱申请两次」，那是能被刷出两张发票的真口子。
 *
 * `amount` 取订单**实付**而不是应付：用券抵扣掉的部分没有真实收款，开票金额必须与流水一致。
 */
@Entity('invoice_applications')
@Unique('uk_invoice_order', ['orderId'])
@Index('idx_invoice_merchant_status', ['merchantId', 'status'])
@Index('idx_invoice_customer', ['customerId'])
export class InvoiceApplication extends BaseEntity {
  @Column({ name: 'customer_id', type: 'bigint', transformer: bigintTransformer, comment: '申请顾客 ID' })
  customerId!: number;

  @Column({ name: 'merchant_id', type: 'bigint', transformer: bigintTransformer, comment: '商户 ID' })
  merchantId!: number;

  @Column({ name: 'store_id', type: 'bigint', transformer: bigintTransformer, comment: '门店 ID' })
  storeId!: number;

  @Column({ name: 'order_id', type: 'bigint', transformer: bigintTransformer, comment: '订单 ID' })
  orderId!: number;

  @Column({ name: 'order_no', type: 'varchar', length: 32, comment: '订单号快照' })
  orderNo!: string;

  @Column({ type: 'int', comment: '开票金额（分）= 订单实付' })
  amount!: number;

  @Column({ type: 'varchar', length: 16, comment: '抬头类型快照' })
  kind!: InvoiceTitleKind;

  @Column({ type: 'varchar', length: 64, comment: '抬头名称快照' })
  title!: string;

  @Column({ name: 'tax_no', type: 'varchar', length: 32, nullable: true, comment: '税号快照' })
  taxNo!: string | null;

  @Column({ type: 'varchar', length: 64, comment: '接收邮箱' })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '顾客备注（开票内容说明）' })
  remark!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: InvoiceStatus.PENDING,
    comment: '状态：pending / issuing / issued / rejected',
  })
  status!: InvoiceStatus;

  @Column({
    name: 'invoice_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '发票号，商户回填；置为已开票时必填',
  })
  invoiceNo!: string | null;

  @Column({
    name: 'invoice_url',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '电子发票下载地址（可选，商户线下拿到后回填）',
  })
  invoiceUrl!: string | null;

  @Column({
    name: 'handled_by',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '受理人账号 ID',
  })
  handledBy!: number | null;

  @Column({ name: 'handled_at', type: 'datetime', nullable: true, comment: '最近一次处理时间' })
  handledAt!: Date | null;

  @Column({
    name: 'handle_note',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '处理说明；驳回时这里是给顾客看的唯一解释',
  })
  handleNote!: string | null;
}
