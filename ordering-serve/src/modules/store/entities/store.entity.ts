import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AccountBanSource } from '../../../shared/enums/account-ban-source.enum';
import { BusinessStatus } from '../../../shared/enums/business-status.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 门店实体。
 *
 * 租户隔离：merchant_id 为必填的租户字段，所有查询都必须带上它
 * （见 CODEBUDDY.md 8.1）。
 */
@Entity('stores')
@Index('idx_store_merchant', ['merchantId'])
export class Store extends BaseEntity {
  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属商户 ID（租户隔离字段）',
  })
  merchantId!: number;

  @Column({ name: 'name', type: 'varchar', length: 64, comment: '门店名称' })
  name!: string;

  @Column({ name: 'code', type: 'varchar', length: 32, nullable: true, comment: '门店编码（商户内唯一）' })
  code!: string | null;

  @Column({ name: 'address', type: 'varchar', length: 255, nullable: true, comment: '门店地址' })
  address!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true, comment: '门店电话' })
  phone!: string | null;

  @Column({
    name: 'business_status',
    type: 'tinyint',
    default: BusinessStatus.OPEN,
    comment: '营业状态：0 打烊 / 1 营业中',
  })
  businessStatus!: BusinessStatus;

  @Column({
    name: 'status',
    type: 'tinyint',
    default: CommonStatus.ENABLED,
    comment: '状态：0 禁用 / 1 启用',
  })
  status!: CommonStatus;

  /**
   * 停用发起方；仅在 `status` 为禁用时有值，启用状态下恒为 NULL。
   *
   * 只有 `status` 一个开关时，平台停掉的店商家照样能自己打开，
   * 平台的止血动作就白做了 —— 与 `users.bannedBy` 同一套语义（见 CODEBUDDY 8.2.2）。
   */
  @Column({
    name: 'banned_by',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '停用发起方：platform / merchant；启用时为 NULL',
  })
  bannedBy!: AccountBanSource | null;
}
