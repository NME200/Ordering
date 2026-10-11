import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 弹窗展示记录 —— 频次控制与数据看板的落点。
 *
 * 主体是 `visitor_key`（小程序生成、存在 Storage 里的设备标识），**不是顾客 ID**：
 * 顾客账号体系还没落地，弹窗恰恰在登录后面就要弹（冷启动、进首页）。
 * 账号落地后再补一列 customer_id 做人群判定与跨设备去重，这里先把「一台手机一天一次」做实。
 */
@Entity('popup_show_logs')
@Unique('uk_popup_visitor_date', ['popupId', 'visitorKey', 'showDate'])
@Index('idx_popup_log_popup', ['popupId'])
export class PopupShowLog extends BaseEntity {
  @Column({ name: 'popup_id', type: 'bigint', comment: '弹窗 ID' })
  popupId!: number;

  @Column({
    name: 'visitor_key',
    type: 'varchar',
    length: 64,
    comment: '访客设备标识（小程序生成）',
  })
  visitorKey!: string;

  @Column({ name: 'show_date', type: 'date', comment: '展示日期（本地日， YYYY-MM-DD）' })
  showDate!: string;

  @Column({ name: 'show_count', type: 'int', default: 0, comment: '当日曝光次数' })
  showCount!: number;

  @Column({ name: 'closed', type: 'tinyint', default: 0, comment: '当日是否被关闭过：0 否 / 1 是' })
  closed!: number;

  @Column({ name: 'clicked', type: 'tinyint', default: 0, comment: '当日是否点击主按钮：0 否 / 1 是' })
  clicked!: number;
}
