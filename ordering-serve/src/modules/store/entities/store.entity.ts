import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AccountBanSource } from '../../../shared/enums/account-ban-source.enum';
import { BusinessStatus } from '../../../shared/enums/business-status.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { bigintTransformer, decimalTransformer } from '../../../shared/utils/transformers';

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

  /**
   * 门店头图 / logo。
   *
   * 「查看门店」列表要显示圆形店铺图，没录入时顾客端用店名首字兜底 ——
   * 存 NULL 而不是存一张占位图，是为了让「没配过」和「配了默认图」可区分。
   */
  @Column({ name: 'logo', type: 'varchar', length: 255, nullable: true, comment: '门店 logo 图片地址' })
  logo!: string | null;

  /** 营业时间文案，如「09:00-21:00」。只做展示，不参与打烊判断（打烊是 businessStatus） */
  @Column({ name: 'business_hours', type: 'varchar', length: 32, nullable: true, comment: '营业时间展示文案' })
  businessHours!: string | null;

  /**
   * 经纬度：nullable，没填的门店在顾客端只是不显示距离，不参与排序也不报错。
   *
   * 用 DECIMAL(10,7) 而不是 FLOAT：7 位小数约 1 cm 精度，
   * 且 FLOAT 在 MySQL 里对同一坐标的等值比较不可靠。
   */
  @Column({
    name: 'latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '纬度（-90 ~ 90），未录入为 NULL',
  })
  latitude!: number | null;

  @Column({
    name: 'longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '经度（-180 ~ 180），未录入为 NULL',
  })
  longitude!: number | null;

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
