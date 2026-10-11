import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { CustomerGender } from '../../../shared/enums/customer.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 顾客账号（平台级）。
 *
 * 这一层**只有身份，没有钱**：积分、余额、成长值、等级全部在 `member_profiles`（按商户）。
 * 原因是本小程序是平台小程序，同一台设备会在好几个品牌下点单，
 * 把储值金挂在账号上等于让 A 商户的余额去 B 商户消费，账务上根本过不去。
 *
 * 身份有两级，认人的优先级是 `openid` > `visitor_key` > `phone`：
 * - `openid` 是微信账号，顾客换手机、卸载重装都还是同一个人 —— 但只有跑在
 *   微信小程序里才拿得到，H5 与未配置凭据时没有；
 * - `visitor_key` 是设备本地生成的标识，是兜底身份：卸载重装会换，
 *   所以它撑得起「这台设备有个顾客」，撑不起「这个人有个账号」；
 * - `phone` 是可选增强，绑定后才算能被门店联系到。
 * 三个字段都允许 NULL / 都可能在迁移期同时存在，所以这里不建外键式约束。
 */
@Entity('customers')
@Unique('uk_customer_visitor_key', ['visitorKey'])
@Unique('uk_customer_openid', ['openid'])
@Unique('uk_customer_invite_code', ['inviteCode'])
@Unique('uk_customer_phone', ['phone'])
@Index('idx_customer_invited_by', ['invitedBy'])
export class Customer extends BaseEntity {
  @Column({
    name: 'visitor_key',
    type: 'varchar',
    length: 64,
    comment: '设备标识，由小程序生成并持久化；拿不到 openid 时的兜底身份',
  })
  visitorKey!: string;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '微信 openid（sns/jscode2session 换得）；一个微信号一个账号，非微信渠道为 NULL',
  })
  openid!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: '绑定手机号；一个手机号只允许一个账号，未绑定为 NULL',
  })
  phone!: string | null;

  @Column({
    name: 'phone_bound_at',
    type: 'datetime',
    nullable: true,
    comment: '绑定手机号的时间；用于判断「新客」窗口',
  })
  phoneBoundAt!: Date | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '昵称，未填时前端显示「食客 + ID 后四位」' })
  nickname!: string | null;

  /**
   * 头像。
   *
   * 存的是**完整可渲染值**，不是文件路径：微信「头像昵称填写能力」回调给的是
   * 一次性临时路径（`wxfile://` / `http://tmp/`），别人打不开、重启就失效，
   * 所以前端只能把它压小后转 base64 传上来 —— 和桌码图片同一套路。
   * 前端压到 256px 大约 8-15KB；这里按 200KB 封顶，超了直接拒。
   * 平台/商户的顾客列表出参里没有这一列（`CustomerAdminRowDto` 不含 avatar），
   * 不会把一堆 base64 拖进列表接口。
   */
  @Column({ type: 'mediumtext', nullable: true, comment: '头像：http(s) 外链或 data:image base64' })
  avatar!: string | null;

  @Column({
    type: 'tinyint',
    default: CustomerGender.UNKNOWN,
    comment: '性别：0 未填写 / 1 男 / 2 女',
  })
  gender!: CustomerGender;

  @Column({
    type: 'date',
    nullable: true,
    comment: '生日。**登记后不允许再改** —— 改生日等于每年都能重领一次生日券',
  })
  birthday!: string | null;

  @Column({
    type: 'tinyint',
    default: CommonStatus.ENABLED,
    comment: '状态：1 正常 / 0 封禁（封禁后令牌立即失效，不能下单）',
  })
  status!: CommonStatus;

  @Column({
    name: 'token_version',
    type: 'int',
    default: 0,
    comment: '会话版本号；自增后此前签发的全部令牌作废（封禁 / 强制下线）',
  })
  tokenVersion!: number;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true, comment: '最近一次换取令牌的时间' })
  lastLoginAt!: Date | null;

  /**
   * 邀请码与邀请人。
   *
   * 会员卡页的成长任务「邀请 1 位好友注册」必须有真数据，
   * 否则这一行永远显示 0/1 且永远点不动 —— 所以邀请关系落在账号层，
   * 判定「算一次有效邀请」的口径是**被邀请人绑定了手机号**（见 MemberService）。
   */
  @Column({
    name: 'invite_code',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '本人的邀请码（注册时生成，唯一）',
  })
  inviteCode!: string | null;

  @Column({
    name: 'invited_by',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '邀请人的顾客 ID；NULL 表示自然注册',
  })
  invitedBy!: number | null;

  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '注册时所在商户（仅用于溯源，不代表归属）',
  })
  registeredFromMerchantId!: number | null;
}
