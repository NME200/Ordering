import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { PopupFrequency, PopupQueueMode, PopupScene, PopupType } from '../constants/popup-schema';

/** 弹窗内容：图文型放图片与跳转，公告型放标题与正文；结构由 `POPUP_CONTENT_SCHEMAS` 约束 */
export type PopupContent = Record<string, unknown>;

/**
 * 活动弹窗配置。
 *
 * 独立一张表，不塞进 `app_configs` 的组件里：弹窗是**应用层触发器**，
 * 有自己的生效周期、频次、优先级与曝光统计，生命周期与页面组件完全不同
 * （见 Small-web/doc/popup-design.md 第一节）。
 *
 * 与布局配置同样是平台资源：`store_id` 为空表示全平台通用，
 * 指到某家门店时只有进那家店的顾客会看到。
 */
@Entity('popup_configs')
@Index('idx_popup_scene_status', ['scene', 'status'])
export class PopupConfig extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 64, comment: '后台管理用的名称，如「秋季新品」' })
  name!: string;

  @Column({ name: 'type', type: 'varchar', length: 20, comment: '类型：image / notice' })
  type!: PopupType;

  @Column({
    name: 'scene',
    type: 'varchar',
    length: 24,
    comment: '触发场景：app_launch / home / store_enter / pay_success',
  })
  scene!: PopupScene;

  @Column({
    name: 'store_id',
    type: 'bigint',
    nullable: true,
    comment: '只在指定门店生效；NULL 表示全平台通用',
  })
  storeId!: number | null;

  @Column({ name: 'priority', type: 'int', default: 10, comment: '数字越小越优先' })
  priority!: number;

  @Column({
    name: 'status',
    type: 'tinyint',
    default: CommonStatus.ENABLED,
    comment: '0 停用 / 1 启用',
  })
  status!: CommonStatus;

  @Column({ name: 'start_time', type: 'datetime', nullable: true, comment: '生效开始时间' })
  startTime!: Date | null;

  @Column({ name: 'end_time', type: 'datetime', nullable: true, comment: '生效结束时间' })
  endTime!: Date | null;

  @Column({
    name: 'frequency',
    type: 'varchar',
    length: 12,
    default: PopupFrequency.DAILY,
    comment: '频次：once / daily / always（小程序本地拦截，后端留痕）',
  })
  frequency!: PopupFrequency;

  @Column({
    name: 'max_show',
    type: 'int',
    default: 1,
    comment: '单次触发最多弹几个（由优先级最高的那条决定）',
  })
  maxShow!: number;

  @Column({
    name: 'queue_mode',
    type: 'varchar',
    length: 12,
    default: PopupQueueMode.QUEUE,
    comment: '多弹窗方式：queue 排队弹 / top_only 只弹第一个',
  })
  queueMode!: PopupQueueMode;

  @Column({ name: 'content', type: 'json', comment: '弹窗内容与样式' })
  content!: PopupContent;

  @Column({ name: 'created_by', type: 'bigint', nullable: true, comment: '创建人（平台账号 ID）' })
  createdBy!: number | null;
}
