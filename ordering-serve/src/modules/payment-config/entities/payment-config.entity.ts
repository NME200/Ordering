import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 支付渠道配置（**平台公共资源，刻意不带 merchant_id**）。
 *
 * 归属说明：本项目按「平台一套商户号、全局收款，再线下与商户结算」建模，
 * 渠道的商户号 / 私钥 / 证书属于 CODEBUDDY.md 8.3 里区分的「平台字典、系统配置」
 * 一类的公共资源，不是某个租户的私有资产，因此不适用 8.1 的业务表必须带
 * `merchant_id` 这条硬约束。将来若改成各商户自有收款账户，
 * 加一个可空 `merchant_id`（NULL 表示沿用平台默认）即可，读取路径不用动。
 *
 * 安全约定：
 * - `settings` 存的是 **AES-256-GCM 密文**（内含应用私钥、商户私钥、APIv3 密钥等
 *   资金级凭据），明文绝不落库，因此这里不能建索引、也不能用 SQL 过滤其内容；
 * - 任何对外接口都不会回传其中的敏感字段原文；
 * - 每次修改都记录操作人，便于资金事故时追责。
 */
@Entity('payment_configs')
@Unique('uk_payment_config_channel', ['channel'])
export class PaymentConfig extends BaseEntity {
  @Column({
    name: 'channel',
    type: 'varchar',
    length: 16,
    comment: '支付渠道标识：offline / mock / wechat / alipay',
  })
  channel!: PaymentChannel;

  @Column({
    type: 'tinyint',
    default: CommonStatus.DISABLED,
    comment: '是否启用：0 停用 / 1 启用',
  })
  enabled!: CommonStatus;

  @Column({
    name: 'settings',
    type: 'text',
    nullable: true,
    comment: '渠道配置密文（AES-256-GCM），明文是 JSON',
  })
  settings!: string | null;

  @Column({
    name: 'updated_by',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '最后修改人账号 ID（审计）',
  })
  updatedBy!: number | null;

  @Column({
    name: 'updated_by_name',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '最后修改人姓名快照（审计）',
  })
  updatedByName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark!: string | null;
}
