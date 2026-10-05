import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../shared/enums/common-status.enum';

/**
 * 商户（租户）实体。
 *
 * 这是多租户体系里的「租户」本身：平台下辖多个商户，
 * 门店、员工等业务数据都通过 merchant_id 归属到具体商户。
 */
@Entity('merchants')
@Index('idx_merchant_name', ['name'])
export class Merchant extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 64, comment: '商户名称' })
  name!: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 32, nullable: true, comment: '联系人' })
  contactName!: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, nullable: true, comment: '联系电话' })
  contactPhone!: string | null;

  @Column({
    name: 'status',
    type: 'tinyint',
    default: CommonStatus.ENABLED,
    comment: '状态：0 禁用 / 1 启用',
  })
  status!: CommonStatus;

  @Column({ name: 'expire_at', type: 'datetime', nullable: true, comment: '服务到期时间，NULL 表示不限' })
  expireAt!: Date | null;

  @Column({ name: 'remark', type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark!: string | null;
}
