import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { InvoiceTitleKind } from '../../../shared/enums/invoice.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/** 顾客保存的发票抬头（设计稿 §三.16「管理抬头」） */
@Entity('invoice_titles')
@Index('idx_invoice_title_customer', ['customerId'])
export class InvoiceTitle extends BaseEntity {
  @Column({ name: 'customer_id', type: 'bigint', transformer: bigintTransformer, comment: '所属顾客 ID' })
  customerId!: number;

  @Column({ type: 'varchar', length: 16, comment: '抬头类型：personal / enterprise' })
  kind!: InvoiceTitleKind;

  @Column({ type: 'varchar', length: 64, comment: '抬头名称' })
  title!: string;

  @Column({
    name: 'tax_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '纳税人识别号，企业抬头必填',
  })
  taxNo!: string | null;

  @Column({ type: 'varchar', length: 64, comment: '接收电子发票的邮箱' })
  email!: string;

  @Column({ name: 'is_default', type: 'tinyint', default: 0, comment: '是否默认抬头' })
  isDefault!: number;
}
