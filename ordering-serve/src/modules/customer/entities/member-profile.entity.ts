import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 商户维度会员资产（积分 / 余额 / 成长值 / 等级）。
 *
 * 一个顾客在一个商户下最多一行 —— 没进过这家商户就没有会员档案，
 * 「我的」页资产栏此时显示 0，而不是显示别家品牌的余额。
 *
 * `growth`（成长值）按**实付元数**累计，等级由它自动推导（见 MEMBER_LEVELS）；
 * `point` 与 `balance` 是分单位的可变动资产，任何增减都必须同事务写 `point_logs`，
 * 否则出现「积分对不上账」时没有任何回溯依据。
 */
@Entity('member_profiles')
@Unique('uk_member_customer_merchant', ['customerId', 'merchantId'])
@Index('idx_member_merchant', ['merchantId'])
export class MemberProfile extends BaseEntity {
  @Column({ name: 'customer_id', type: 'bigint', transformer: bigintTransformer, comment: '顾客 ID' })
  customerId!: number;

  @Column({ name: 'merchant_id', type: 'bigint', transformer: bigintTransformer, comment: '商户 ID（租户）' })
  merchantId!: number;

  @Column({ type: 'int', default: 0, comment: '积分余额' })
  point!: number;

  @Column({ type: 'int', default: 0, comment: '储值余额（分）。本轮没有充值入口，只随退款回冲' })
  balance!: number;

  @Column({ type: 'int', default: 0, comment: '成长值 = 累计实付元数（向下取整）' })
  growth!: number;

  @Column({ type: 'smallint', default: 0, comment: '等级序号，与 MEMBER_LEVELS 对齐' })
  level!: number;

  @Column({ name: 'order_count', type: 'int', default: 0, comment: '已支付订单数（成长任务用）' })
  orderCount!: number;

  @Column({ name: 'total_paid', type: 'int', default: 0, comment: '累计实付金额（分，成长任务用）' })
  totalPaid!: number;

  @Column({ name: 'first_order_at', type: 'datetime', nullable: true, comment: '首单时间，用于判断新客' })
  firstOrderAt!: Date | null;

  @Column({ name: 'last_order_at', type: 'datetime', nullable: true, comment: '最近一单时间' })
  lastOrderAt!: Date | null;
}
