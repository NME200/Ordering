import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CouponScene, CouponTemplateStatus, CouponType } from '../../../shared/enums/coupon.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 优惠券模板。
 *
 * `merchantId` 为 NULL 表示**平台券**：全场通用、由平台配置、成本由平台承担；
 * 非空则是商户自己的券，只有该商户的门店能用。这一区分写在数据层而不是靠约定，
 * 因为核销时要按它决定给谁结算，事后补不回来。
 *
 * 有效期两种模式互斥：`validDays`（领取后 N 天）或 `startAt/endAt`（固定区间）。
 * 校验器负责保证恰好填一种。
 */
@Entity('coupon_templates')
@Index('idx_coupon_template_merchant', ['merchantId'])
@Index('idx_coupon_template_scene', ['scene', 'status'])
export class CouponTemplate extends BaseEntity {
  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '所属商户 ID；NULL = 平台券（全场通用）',
  })
  merchantId!: number | null;

  @Column({ type: 'varchar', length: 64, comment: '券名，如「满 30 减 5」' })
  name!: string;

  @Column({ type: 'varchar', length: 16, comment: '类型：amount 满减 / discount 折扣' })
  type!: CouponType;

  @Column({
    type: 'int',
    comment: '满减为减免金额（分）；折扣为折扣率百分数，80 表示打 8 折',
  })
  value!: number;

  @Column({ type: 'int', default: 0, comment: '使用门槛（分），0 表示无门槛' })
  threshold!: number;

  /**
   * 抵扣上限（分），仅折扣券有意义。
   *
   * 折扣券不设上限时，「打 8 折」在 500 元的单上会减掉 100 元，
   * 商户配的时候以为是小促销，落地成了负毛利。
   */
  @Column({
    name: 'max_discount',
    type: 'int',
    nullable: true,
    comment: '最多抵扣金额（分）；NULL 表示不限（仍受订单应付 > 0 约束）',
  })
  maxDiscount!: number | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: CouponScene.NORMAL,
    comment: '场景：normal 领券中心 / newcomer 新客自动发 / birthday 生日当月领',
  })
  scene!: CouponScene;

  @Column({
    name: 'valid_days',
    type: 'smallint',
    nullable: true,
    comment: '领取后有效天数（与固定区间二选一）',
  })
  validDays!: number | null;

  @Column({ name: 'start_at', type: 'datetime', nullable: true, comment: '固定区间开始' })
  startAt!: Date | null;

  @Column({ name: 'end_at', type: 'datetime', nullable: true, comment: '固定区间结束' })
  endAt!: Date | null;

  @Column({
    name: 'total_count',
    type: 'int',
    default: 0,
    comment: '发行总量，0 表示不限量',
  })
  totalCount!: number;

  @Column({
    name: 'received_count',
    type: 'int',
    default: 0,
    comment: '已领取数量。扣库存靠带条件的 UPDATE 自增，不靠先读后写',
  })
  receivedCount!: number;

  @Column({
    name: 'per_limit',
    type: 'smallint',
    default: 1,
    comment: '每人限领张数（生日券按「每年一张」另行判定）',
  })
  perLimit!: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '使用说明，券面「使用规则」页展示' })
  description!: string | null;

  @Column({
    type: 'tinyint',
    default: CouponTemplateStatus.OFFLINE,
    comment: '状态：1 上架可领 / 0 下架',
  })
  status!: CouponTemplateStatus;
}
