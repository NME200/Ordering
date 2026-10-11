import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import {
  DEFAULT_ENV_VERSION,
  MINIAPP_CONFIG_KEY,
  type MiniappEnvVersion,
} from '../constants/miniapp.constants';

/**
 * 小程序配置（**平台公共资源，刻意不带 merchant_id**）。
 *
 * 全平台一套：小程序只有一个主体，桌号二维码也是从同一个 AppID 生成的，
 * 和 payment_configs 一样属于「平台字典 / 系统配置」，不是某个租户的私有资产。
 *
 * 安全约定：
 * - `settings` 存 **AES-256-GCM 密文**（明文是 JSON，里面是 AppSecret）。
 *   AppSecret 能换到调用微信接口的 access_token，等于小程序的身份，绝不明文入库；
 * - 任何接口都不回传 AppSecret 原文，只回「是否已配置」；
 * - 每次修改记录操作人，凭据被改动时能追到人。
 */
@Entity('miniapp_configs')
@Unique('uk_miniapp_config_key', ['configKey'])
export class MiniappConfig extends BaseEntity {
  @Column({
    name: 'config_key',
    type: 'varchar',
    length: 16,
    default: MINIAPP_CONFIG_KEY,
    comment: '配置行标识，全平台固定一行',
  })
  configKey!: string;

  @Column({
    name: 'app_id',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '小程序 AppID，如 wx7d91e9…',
  })
  appId!: string | null;

  @Column({
    name: 'settings',
    type: 'text',
    nullable: true,
    comment: '敏感项密文（AES-256-GCM），明文是 JSON：{ appSecret }',
  })
  settings!: string | null;

  /**
   * 出码时写给哪个版本的小程序。
   *
   * 只有没发布的时候需要改：未发布时 release 的码扫不开，得选 trial / develop。
   * 详见 constants/miniapp.constants.ts。
   */
  @Column({
    name: 'env_version',
    type: 'varchar',
    length: 16,
    default: DEFAULT_ENV_VERSION,
    comment: '桌码指向的小程序版本：release 正式版 / trial 体验版 / develop 开发版',
  })
  envVersion!: MiniappEnvVersion;

  @Column({
    name: 'updated_by',
    type: 'bigint',
    nullable: true,
    comment: '最后修改人账号 ID',
  })
  updatedBy!: number | null;

  @Column({
    name: 'updated_by_name',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '最后修改人名称（冗余一份，便于追责时不用连表）',
  })
  updatedByName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark!: string | null;
}
