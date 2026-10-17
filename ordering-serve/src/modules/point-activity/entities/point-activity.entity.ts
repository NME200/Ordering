import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import {
  PointActivityRuleType,
  PointActivityScope,
} from '../../../shared/enums/point-activity.enum';

/**
 * 活动规则。落库时按 `ruleType` 只写该类型用得上的那几个字段，
 * 另一半留空 —— 存成一份「全都填了」的 JSON 会让改类型后留下无人知道的脏参数。
 *
 * - `multiplier`：`orderBonusPercent` / `reviewBonusPercent`，在常规分上**再加**的百分比，
 *   取整向下（1 元 = 1 分，加 50% 就是每满 2 元多 1 分）。成长值不吃倍率。
 * - `threshold_bonus`：单笔实付满 `thresholdCent` 分，额外送 `bonusPoint` 分（每单一次）。
 */
export interface PointActivityRules {
  orderBonusPercent?: number;
  reviewBonusPercent?: number;
  thresholdCent?: number;
  bonusPoint?: number;
}

/**
 * 命中条件：谁在什么情况下能拿到这份加成。
 *
 * 与 `rules` 分开放：`rules` 回答「加多少」，`conditions` 回答「哪些订单算数」。
 * 三条都是**空 = 不限**；`dishIds` 与 `categoryIds` 取**并集**（命中任一即参与）——
 * 运营问的本来就是「哪些菜参加」这一件事，拆成 AND 会配出谁都命中不了的组合。
 * `diningTypes` 是另一个维度，单独 AND：点外卖的不该吃到「仅限堂食」的补贴。
 */
export interface PointActivityConditions {
  dishIds?: number[];
  /** 按菜品**当前**所属分类判（订单快照里没有分类列）；菜品后来换分类会影响新单的判定，界面要写明 */
  categoryIds?: number[];
  /** 0 堂食 / 1 自提 / 2 外卖配送 */
  diningTypes?: number[];
}

/**
 * 平台积分营销活动。
 *
 * **平台公共资源，不带 `merchant_id`**（与 `popup_configs`、`app_configs` 同层）：
 * 规则由平台一套制定，靠 `scopeType + merchantIds` 决定压到哪几家商户头上，
 * 发出去的积分仍然落在各商户自己的 `member_profiles` 上 —— 资产按商户分档是顾客域的硬口径。
 *
 * 生效判定是 `status = 启用 AND startTime <= now < endTime AND 范围覆盖该商户`，
 * 三个条件都在服务端算，前端与小程序不参与。
 */
@Entity('point_activities')
@Index('idx_point_activity_status_time', ['status', 'startTime', 'endTime'])
export class PointActivity extends BaseEntity {
  @Column({ type: 'varchar', length: 64, comment: '活动名，顾客与店员看到的都是它' })
  name!: string;

  @Column({ name: 'rule_type', type: 'varchar', length: 32, comment: '规则类型：multiplier / threshold_bonus' })
  ruleType!: PointActivityRuleType;

  @Column({ type: 'json', comment: '规则参数，按 ruleType 取用' })
  rules!: PointActivityRules;

  @Column({
    type: 'json',
    nullable: true,
    comment: '命中条件（参与菜品 / 分类 / 就餐方式），NULL 或空数组表示不限',
  })
  conditions!: PointActivityConditions | null;

  @Column({ name: 'start_time', type: 'datetime', comment: '生效开始时间（含）' })
  startTime!: Date;

  @Column({ name: 'end_time', type: 'datetime', comment: '生效结束时间（不含）' })
  endTime!: Date;

  @Column({
    type: 'tinyint',
    default: CommonStatus.DISABLED,
    comment: '0 停用 / 1 启用。新建默认停用：设规则与开活动是两步，避免存到一半就开闸发分',
  })
  status!: CommonStatus;

  @Column({
    name: 'scope_type',
    type: 'varchar',
    length: 16,
    default: PointActivityScope.ALL,
    comment: '商户范围：all / include / exclude',
  })
  scopeType!: PointActivityScope;

  /**
   * 范围里涉及的商户 ID。`all` 时为空数组。
   *
   * 存 ID 而不是名称：商户改名不影响活动；代价是列表要自己把名称查回来显示。
   */
  @Column({
    name: 'merchant_ids',
    type: 'json',
    comment: 'include / exclude 命中的商户 ID 列表；scope_type=all 时为空数组',
  })
  merchantIds!: number[];

  @Column({
    name: 'per_customer_cap',
    type: 'int',
    default: 0,
    comment: '同一顾客在本活动可获得加成的上限（分），0 表示不限',
  })
  perCustomerCap!: number;

  @Column({
    name: 'banner_title',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '小程序活动条标题；留空则 C 端不显示活动条',
  })
  bannerTitle!: string | null;

  @Column({
    name: 'banner_desc',
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: '小程序活动条说明文案',
  })
  bannerDesc!: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true, comment: '创建人（平台账号 ID）' })
  createdBy!: number | null;
}
