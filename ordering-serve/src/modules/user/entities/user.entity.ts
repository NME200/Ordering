import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AccountBanSource } from '../../../shared/enums/account-ban-source.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { Permission } from '../../../shared/enums/permission.enum';
import { Role } from '../../../shared/enums/role.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 账号实体（B 端：平台管理员 / 平台运营专员 / 商户管理员 / 门店管理员 / 收银员）。
 *
 * 租户归属：
 * - 平台侧账号（管理员 / 运营专员）：merchant_id 为 NULL；
 * - 其余角色：merchant_id 必填，store_id 视角色可选。
 *
 * C 端（小程序）用户属于独立账号体系，后续单独建模。
 */
@Entity('users')
@Index('idx_user_merchant', ['merchantId'])
@Index('idx_user_username', ['username'])
export class User extends BaseEntity {
  @Column({
    name: 'merchant_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '所属商户 ID；平台管理员为 NULL',
  })
  merchantId!: number | null;

  @Column({
    name: 'store_id',
    type: 'bigint',
    transformer: bigintTransformer,
    nullable: true,
    comment: '所属门店 ID；商户管理员可为 NULL',
  })
  storeId!: number | null;

  @Column({ name: 'username', type: 'varchar', length: 32, comment: '登录用户名' })
  username!: string;

  /** select: false —— 默认查询不带出密码，需要时用 addSelect 显式取 */
  @Column({
    name: 'password',
    type: 'varchar',
    length: 100,
    select: false,
    comment: '密码（bcrypt 哈希）',
  })
  password!: string;

  @Column({ name: 'nickname', type: 'varchar', length: 32, comment: '姓名 / 昵称' })
  nickname!: string;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true, comment: '手机号' })
  phone!: string | null;

  @Column({ name: 'role', type: 'varchar', length: 32, comment: '角色标识' })
  role!: Role;

  /**
   * 账号级授权清单（平台管理员逐项勾选的能力）。
   *
   * - `NULL`：沿用角色默认权限（见 `shared/constants/permission-map.ts`）；
   * - 数组：显式授权，**完全替代**角色默认而非求并集。
   *
   * 只有平台侧账号（`merchant_id` 为 NULL）会用到这一列，且实际只有
   * 「平台运营专员」需要非 NULL —— 平台管理员恒为 NULL，避免把自己授权成零权限后锁死。
   * 商家账号一律 NULL：商家的能力边界由角色 + 租户范围决定，不接受平台侧的杂散授权。
   */
  @Column({
    name: 'permissions',
    type: 'json',
    nullable: true,
    comment: '账号级授权权限点清单；NULL 表示使用角色默认权限',
  })
  permissions!: Permission[] | null;

  @Column({
    name: 'status',
    type: 'tinyint',
    default: CommonStatus.ENABLED,
    comment: '状态：0 禁用 / 1 启用',
  })
  status!: CommonStatus;

  /**
   * 封禁发起方；仅在 `status` 为禁用时有值，启用状态下恒为 NULL。
   *
   * 这是「谁封的谁解」的依据 —— 只有 `status` 一个开关时，
   * 被平台封掉的账号在商家那边照样能解封，平台的止血动作就白做了。
   */
  @Column({
    name: 'banned_by',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '封禁发起方：platform / merchant；启用时为 NULL',
  })
  bannedBy!: AccountBanSource | null;

  /**
   * 会话版本号：重置密码 / 强制下线时自增，使该账号已签发的**全部** Token 立即失效。
   * Token 黑名单只能失效「当前这一条 jti」，而管理员无法拿到别人账号的 jti。
   */
  @Column({
    name: 'token_version',
    type: 'int',
    default: 0,
    comment: '会话版本号，与 JWT 中的 tokenVersion 比对，不一致即视为登录失效',
  })
  tokenVersion!: number;

  @Column({
    name: 'last_login_at',
    type: 'datetime',
    nullable: true,
    comment: '最后登录时间',
  })
  lastLoginAt!: Date | null;
}
