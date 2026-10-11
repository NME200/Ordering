import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 顾客收货地址。
 *
 * 挂在**平台账号**下而不是商户下：收货地址是顾客自己的信息，
 * 在 A 店存过、到 B 店还要用，按商户复制一份只会让顾客看到一堆重复地址。
 *
 * 刻意不存经纬度：本轮没有配送费按距离计费的逻辑，
 * 地图选点在小程序侧最终落成的就是「省市区 + 详细地址」三段文本。
 */
@Entity('customer_addresses')
@Index('idx_address_customer', ['customerId'])
export class CustomerAddress extends BaseEntity {
  @Column({
    name: 'customer_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属顾客 ID',
  })
  customerId!: number;

  @Column({ name: 'receiver_name', type: 'varchar', length: 32, comment: '收货人姓名' })
  receiverName!: string;

  @Column({ type: 'varchar', length: 20, comment: '收货人手机号' })
  phone!: string;

  @Column({ type: 'varchar', length: 32, comment: '省' })
  province!: string;

  @Column({ type: 'varchar', length: 32, comment: '市' })
  city!: string;

  @Column({ type: 'varchar', length: 32, comment: '区 / 县' })
  district!: string;

  @Column({ type: 'varchar', length: 255, comment: '详细地址（街道 + 门牌 / 楼层房间号）' })
  detail!: string;

  @Column({ type: 'varchar', length: 16, nullable: true, comment: '标签：家 / 公司 / 学校' })
  tag!: string | null;

  @Column({
    name: 'is_default',
    type: 'tinyint',
    default: 0,
    comment: '是否默认地址：1 是 / 0 否。同一顾客最多一条默认',
  })
  isDefault!: number;
}
