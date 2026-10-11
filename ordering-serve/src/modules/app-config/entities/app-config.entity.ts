import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AppConfigStatus } from '../../../shared/enums/app-config-status.enum';
import { AppConfigPageKey } from '../constants/app-config-schema';

/** 组件的 props —— 结构由各组件的校验类单独约束，这里只保证是对象 */
export interface AppConfigSection {
  /** 前端拖拽用的稳定 ID（新增时由服务端补一个） */
  id: string;
  key: string;
  visible: boolean;
  props: Record<string, unknown>;
}

/** 一个页面能放哪几段：数组顺序就是渲染顺序 */
export type AppConfigPages = Record<AppConfigPageKey, AppConfigSection[]>;

/**
 * 一份完整的小程序布局：全局主题 + 四个装修页。
 *
 * 主题放在方案层而不是每页一份，是因为设计稿要求「四页共享同一套主题」——
 * 拆到页里就会出现首页是绿、我的页是橙，还得回答「改主题要发布几次」。
 */
export interface AppConfigContent {
  theme: Record<string, unknown>;
  pages: AppConfigPages;
}

/**
 * 小程序布局配置。
 *
 * 平台公共资源（与支付配置同层）：**不带 merchant_id**，全平台一套。
 * 内容用 JSON 列存，和 `users.permissions` 一样刻意不拆成
 * 「配置表 + 页面表 + 组件表 + 属性表」—— 装修配置只在发布时整体读写，
 * 没有按组件检索的需求。
 */
@Entity('app_configs')
@Index('idx_app_config_status', ['status'])
export class AppConfig extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 40, comment: '方案名称，如「国庆皮肤」' })
  name!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: AppConfigStatus.DRAFT,
    comment: '状态：draft 草稿 / published 生效中 / archived 历史',
  })
  status!: AppConfigStatus;

  @Column({
    name: 'content',
    type: 'json',
    comment: '布局内容：{ theme, pages }',
  })
  content!: AppConfigContent;

  /**
   * 发布时自增的版本号，C 端用它做本地缓存协商。
   * 草稿恒为 0 —— 只有发布出去的配置才有版本可言。
   */
  @Column({ name: 'version', type: 'int', default: 0, comment: '发布版本号；草稿为 0' })
  version!: number;

  @Column({
    name: 'created_by',
    type: 'bigint',
    nullable: true,
    comment: '创建人（平台账号 ID）',
  })
  createdBy!: number | null;

  @Column({ name: 'published_at', type: 'datetime', nullable: true, comment: '发布时间' })
  publishedAt!: Date | null;
}
