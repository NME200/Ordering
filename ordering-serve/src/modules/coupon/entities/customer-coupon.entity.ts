import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CustomerCouponStatus, CouponScene, CouponType } from '../../../shared/enums/coupon.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 顾客持有的券。
 *
 * 面额、门槛、名称全部是**领取时的快照**：模板后来被改小、下架、删掉，
 * 都不能影响已经发到顾客手里的那张券 —— 这是券和「折扣活动」最本质的区别。
 *
 * `expireAt` 在领取时就定格（相对有效期）或取模板区间（固定有效期）。
 * 库里允许出现已过期但状态仍是 unused 的行，读侧统一按 `expireAt` 判活，
 * 这样就不需要每天跑一个定时任务去刷状态；定时任务一旦漏跑，顾客会看到一张用不了的券。
 */
@Entity('customer_coupons')
@Index('idx_customer_coupon_customer', ['customerId', 'status'])
@Index('idx_customer_coupon_template', ['templateId'])
export class CustomerCoupon extends BaseEntity {
  @Column({ name: 'customer_id', type: 'bigint', transformer: bigintTransformer, comment: '持有顾客 ID' })
  customerId!: number;

  @Column({ name: 'template_id', type: 'bigint', transformer: bigintTransformer, comment: '来源模板 ID' })
  templateId!: number;

  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '券归属商户；NULL = 平台券（快照自模板）',
  })
  merchantId!: number | null;

  @Column({ type: 'varchar', length: 64, comment: '券名快照' })
  name!: string;

  @Column({ type: 'varchar', length: 16, comment: '类型快照：amount / discount' })
  type!: CouponType;

  @Column({ type: 'int', comment: '面额或折扣率快照' })
  value!: number;

  @Column({ type: 'int', default: 0, comment: '使用门槛快照（分）' })
  threshold!: number;

  @Column({ name: 'max_discount', type: 'int', nullable: true, comment: '最多抵扣快照（分）' })
  maxDiscount!: number | null;

  @Column({ type: 'varchar', length: 16, comment: '场景快照，用于「新客券」这类标签展示' })
  scene!: CouponScene;

  @Column({ name: 'received_at', type: 'datetime', comment: '领取 / 发放时间' })
  receivedAt!: Date;

  @Column({ name: 'expire_at', type: 'datetime', comment: '失效时间，到点即不可用' })
  expireAt!: Date;

  @Column({
    type: 'varchar',
    length: 16,
    default: CustomerCouponStatus.UNUSED,
    comment: '状态：unused / locked 被待支付订单占用 / used / expired',
  })
  status!: CustomerCouponStatus;

  @Column({ name: 'order_id', type: 'bigint', transformer: bigintTransformer, nullable: true, comment: '核销所在订单' })
  orderId!: number | null;

  @Column({ name: 'used_at', type: 'datetime', nullable: true, comment: '核销时间' })
  usedAt!: Date | null;
}
