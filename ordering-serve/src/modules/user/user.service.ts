import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import {
  requireMerchantScope,
  resolveMerchantScope,
  resolveStoreScope,
} from '../../common/utils/tenant.util';
import { isGrantablePermission } from '../../shared/constants/permission-map';
import {
  canAssignRole,
  isPlatformRole,
  PLATFORM_ROLES,
  STORE_BOUND_ROLES,
} from '../../shared/constants/role-scope';
import { AccountBanSource } from '../../shared/enums/account-ban-source.enum';
import { AccountKind } from '../../shared/enums/account-kind.enum';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { Permission } from '../../shared/enums/permission.enum';
import { ROLE_LABELS, Role } from '../../shared/enums/role.enum';
import { hashPassword, verifyPassword } from '../../shared/utils/password.util';
import { StoreService } from '../store/store.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './entities/user.entity';

/** 租户归属范围 */
interface UserScope {
  merchantId: number | null;
  storeId: number | null;
}

/** 开通商户首个管理员账号所需的资料 */
export interface MerchantAdminInput {
  username: string;
  nickname: string;
  phone?: string | null;
  password: string;
}

/**
 * 账号服务。
 *
 * 同时承担三件事：
 * 1. 账号管理（增删改查，受租户 / 门店范围约束）；
 * 2. 平台账户与商家账户的**分层治理规则**（见下）；
 * 3. 为认证模块提供登录所需的查询能力（按用户名取密码、按 ID 取最新状态）。
 *
 * ## 分层治理规则
 *
 * 平台端与商户端管的是**两拨人**，规则在 `create` / `update` / `remove` 里就近校验，
 * 而不是散落到各个 Controller：
 *
 * - **平台账户**（`merchant_id` 为 NULL：平台管理员 / 运营专员）
 *   只有 PLATFORM_ADMIN 能新增、编辑、授权、封禁、删除、重置密码。
 *   运营专员虽同属平台侧，但它是被管理对象 —— 否则一个被授予 `user:update`
 *   的运营就能给自己或同僚加权限，授权这件事就不再是管理员专属了。
 * - **商家账户**（商户管理员 / 门店管理员 / 收银员）
 *   由商家在商户后台自行创建开通。平台侧角色**不能新建、不能删除**，
 *   对已存在的商家账号只有两个动作：封禁 / 解封（`status`）与重置密码。
 *   商户的第一条管理员账号在「创建商户」时一并开通（见 MerchantService.create）。
 *
 * 这么切的原因：商家员工是商家的经营资产，平台代人保管只会养出依赖；
 * 而商家联系平台求助（忘记密码、员工离职需立刻停号）时，平台又必须能止血。
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly storeService: StoreService,
  ) {}

  // ==================== 供认证模块调用 ====================

  /**
   * 按用户名查询账号并带出密码哈希。
   * password 列 select: false，必须用 QueryBuilder 显式 addSelect。
   */
  async findByUsernameWithPassword(username: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .getOne();
  }

  /**
   * 按 ID 查询账号，用于 JWT 校验时读取最新状态。
   * 此处不做租户过滤：ID 来自服务端签发的 Token，是可信来源。
   */
  async findByIdForAuth(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  /** 更新最后登录时间 */
  async touchLastLogin(id: number): Promise<void> {
    await this.userRepository.update(id, { lastLoginAt: new Date() });
  }

  /** 修改本人密码（需校验原密码） */
  async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw BusinessException.notFound(ErrorCode.USER_NOT_FOUND, '账号不存在');
    }
    if (!(await verifyPassword(oldPassword, user.password))) {
      throw BusinessException.badRequest(ErrorCode.OLD_PASSWORD_INCORRECT, '原密码不正确');
    }

    user.password = await hashPassword(newPassword);
    await this.userRepository.save(user);
    await this.revokeSessions(userId);
  }

  // ==================== 账号管理 ====================

  /** 分页查询账号 */
  async paginate(
    query: QueryUserDto,
    currentUser: AuthUser,
  ): Promise<PaginatedDto<UserResponseDto>> {
    const merchantId = resolveMerchantScope(currentUser, query.merchantId);
    const storeId = resolveStoreScope(currentUser, query.storeId);

    const qb = this.userRepository.createQueryBuilder('user');
    if (merchantId !== null) {
      qb.andWhere('user.merchantId = :merchantId', { merchantId });
    }
    if (storeId !== null) {
      qb.andWhere('user.storeId = :storeId', { storeId });
    }
    if (query.keyword) {
      qb.andWhere('(user.username LIKE :keyword OR user.nickname LIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }
    // 平台端两个页签的分类口径在这里展开成角色条件，前端不传角色清单
    if (query.accountKind === AccountKind.PLATFORM) {
      // 平台账户的名册只对平台管理员可见：授权给运营的 user:read 是
      // 「治理商家账号」的能力，不该顺带看到平台内部有谁
      this.assertPlatformAccountManager(currentUser);
      qb.andWhere('user.role IN (:...platformRoles)', { platformRoles: PLATFORM_ROLES });
    } else if (query.accountKind === AccountKind.MERCHANT_ADMIN) {
      qb.andWhere('user.role = :merchantAdminRole', { merchantAdminRole: Role.MERCHANT_ADMIN });
    }
    if (query.role !== undefined) {
      qb.andWhere('user.role = :role', { role: query.role });
    }
    if (query.status !== undefined) {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    qb.orderBy('user.id', 'DESC').skip(query.skip).take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return PaginatedDto.from({
      list: rows.map((row) => UserResponseDto.from(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 查询账号详情 */
  async findOne(id: number, currentUser: AuthUser): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.findByIdOrFail(id, currentUser));
  }

  /** 按 ID 查询账号，带租户 / 门店范围校验 */
  async findByIdOrFail(id: number, currentUser: AuthUser): Promise<User> {
    const merchantId = resolveMerchantScope(currentUser);
    const storeId = resolveStoreScope(currentUser);

    const where: FindOptionsWhere<User> = { id };
    if (merchantId !== null) {
      where.merchantId = merchantId;
    }
    if (storeId !== null) {
      where.storeId = storeId;
    }

    const user = await this.userRepository.findOne({ where });
    if (!user) {
      throw BusinessException.notFound(ErrorCode.USER_NOT_FOUND, '账号不存在');
    }
    return user;
  }

  /** 新增账号 */
  async create(dto: CreateUserDto, currentUser: AuthUser): Promise<UserResponseDto> {
    await this.assertUsernameAvailable(this.userRepository, dto.username);

    if (isPlatformRole(dto.role)) {
      this.assertPlatformAccountManager(currentUser);
      return UserResponseDto.from(
        await this.userRepository.save(
          this.userRepository.create({
            merchantId: null,
            storeId: null,
            username: dto.username,
            password: await hashPassword(dto.password),
            nickname: dto.nickname,
            phone: dto.phone ?? null,
            role: dto.role,
            status: CommonStatus.ENABLED,
            permissions: this.resolveGrantedPermissions(dto.role, dto.permissions),
            lastLoginAt: null,
          }),
        ),
      );
    }

    // 平台端不再代商家开通员工账号：商家员工属于商家的经营编制
    if (isPlatformRole(currentUser.role)) {
      throw BusinessException.forbidden(
        '商家账号由商家在商户后台自行创建开通；平台端仅在新增商户时开通商家管理员',
      );
    }

    const merchantId = requireMerchantScope(currentUser);
    const scope = await this.resolveUserScope(dto.role, merchantId, dto.storeId, currentUser);

    const entity = this.userRepository.create({
      merchantId: scope.merchantId,
      storeId: scope.storeId,
      username: dto.username,
      password: await hashPassword(dto.password),
      nickname: dto.nickname,
      phone: dto.phone ?? null,
      role: dto.role,
      status: CommonStatus.ENABLED,
      permissions: this.resolveGrantedPermissions(dto.role, dto.permissions),
      lastLoginAt: null,
    });

    return UserResponseDto.from(await this.userRepository.save(entity));
  }

  /** 编辑账号 */
  async update(id: number, dto: UpdateUserDto, currentUser: AuthUser): Promise<UserResponseDto> {
    const user = await this.findByIdOrFail(id, currentUser);
    const previousRole = user.role;

    if (isPlatformRole(user.role)) {
      this.assertPlatformAccountManager(currentUser);
      this.assertPlatformAccountMutable(user);
      await this.applyPlatformAccountChanges(user, dto, currentUser);
    } else {
      this.assertMerchantAccountEditable(user, dto, currentUser);
      this.assertStaffAccountManageable(user, currentUser);
      await this.applyMerchantAccountChanges(user, dto, currentUser);
    }

    // 封禁 / 解封单独走一道，且放在角色变更之后：判断归属要看变更后的角色
    this.applyStatusTransition(user, dto, currentUser);

    // 失手把自己关在门外的代价远高于一次报错难听：禁用与降级都不允许对自己下手
    if (user.id === currentUser.userId) {
      if (user.status === CommonStatus.DISABLED) {
        throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, '不能禁用当前登录的账号');
      }
      if (user.role !== previousRole) {
        throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, '不能变更当前登录账号的角色');
      }
    }

    return UserResponseDto.from(await this.userRepository.save(user));
  }

  /** 删除账号（软删除） */
  async remove(id: number, currentUser: AuthUser): Promise<void> {
    const user = await this.findByIdOrFail(id, currentUser);

    if (user.id === currentUser.userId) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, '不能删除当前登录的账号');
    }

    if (isPlatformRole(user.role)) {
      this.assertPlatformAccountManager(currentUser);
      this.assertPlatformAccountMutable(user);
    } else if (isPlatformRole(currentUser.role)) {
      throw BusinessException.badRequest(
        ErrorCode.PARAM_INVALID,
        '商家账号由商家在商户后台自行删除，平台端仅可封禁',
      );
    } else {
      this.assertStaffAccountManageable(user, currentUser);
    }

    await this.userRepository.softDelete(id);
  }

  /** 重置账号密码（管理员操作） */
  async resetPassword(
    id: number,
    dto: ResetPasswordDto,
    currentUser: AuthUser,
  ): Promise<void> {
    const user = await this.findByIdOrFail(id, currentUser);
    if (isPlatformRole(user.role)) {
      this.assertPlatformAccountManager(currentUser);
    } else {
      this.assertStaffAccountManageable(user, currentUser);
    }

    user.password = await hashPassword(dto.newPassword);
    await this.userRepository.save(user);
    // 密码被管理员重置后，该账号此前已登录的会话必须一并失效，
    // 否则拿不到新密码的人仍能继续用旧 Token 操作。
    await this.revokeSessions(user.id);
  }

  // ==================== 供商户模块调用 ====================

  /**
   * 在**给定事务内**开通商户的首个管理员账号。
   *
   * 只随「创建商户」发生：商户与管理员必须同生同死，否则会产生一个
   * 谁也登不进去的半成品租户。因此这里收 EntityManager 而不是自己的仓储。
   */
  async createMerchantAdmin(
    manager: EntityManager,
    merchantId: number,
    input: MerchantAdminInput,
  ): Promise<void> {
    const repository = manager.getRepository(User);
    await this.assertUsernameAvailable(repository, input.username);

    await repository.save(
      repository.create({
        merchantId,
        storeId: null,
        username: input.username,
        password: await hashPassword(input.password),
        nickname: input.nickname,
        phone: input.phone ?? null,
        role: Role.MERCHANT_ADMIN,
        status: CommonStatus.ENABLED,
        permissions: null,
        lastLoginAt: null,
      }),
    );
  }

  // ==================== 内部辅助 ====================

  /** 自增会话版本号，使该账号已签发的全部 Token 立即失效 */
  private async revokeSessions(userId: number): Promise<void> {
    await this.userRepository.increment({ id: userId }, 'tokenVersion', 1);
  }

  /** 平台账户（含授权）是平台管理员的专属职责 */
  private assertPlatformAccountManager(operator: AuthUser): void {
    if (operator.role !== Role.PLATFORM_ADMIN) {
      throw BusinessException.forbidden('仅平台管理员可维护平台账户及其授权');
    }
  }

  /**
   * 平台管理员账号本身不可编辑、禁用或授权。
   *
   * 管理员是唯一的授权方与上锁人：能改他就等于能把自己换成别人、
   * 把它的权限裁掉，或者把他禁到没人能解封。所以这一类账号在本接口里是只读的，
   * 只保留「重置密码」作为找回手段（见 resetPassword）。
   * 要调整谁当管理员，走「新增一个 + 由数据库处理旧的」，不做原地改写。
   */
  private assertPlatformAccountMutable(target: User): void {
    if (target.role === Role.PLATFORM_ADMIN) {
      throw BusinessException.forbidden('平台管理员账号不可编辑、禁用或授权');
    }
  }

  /**
   * 商户后台只管员工（门店管理员 / 收银员），商家管理员账号本身是只读的。
   *
   * 与平台侧同一条道理：能改另一个管理员就等于能把自己换成别人。
   * 平台侧不受此限 —— 处置商家管理员（封禁、重置密码）正是平台端的职责，
   * 其可动范围已由 assertMerchantAccountEditable 收窄到只剩状态与密码。
   */
  private assertStaffAccountManageable(target: User, operator: AuthUser): void {
    if (isPlatformRole(operator.role)) {
      return;
    }
    if (target.role === Role.MERCHANT_ADMIN) {
      throw BusinessException.forbidden(
        '商户管理员账号不可在商户后台编辑、删除或重置密码，请联系平台处理',
      );
    }
  }

  /** 平台端对商家账号只能封禁 / 解封，别的一律由商家自己维护 */
  private assertMerchantAccountEditable(
    target: User,
    dto: UpdateUserDto,
    operator: AuthUser,
  ): void {
    if (!isPlatformRole(operator.role)) {
      return;
    }
    const beyondGovernance =
      dto.nickname !== undefined ||
      dto.phone !== undefined ||
      dto.role !== undefined ||
      dto.storeId !== undefined ||
      dto.permissions !== undefined;
    if (beyondGovernance) {
      throw BusinessException.badRequest(
        ErrorCode.PARAM_INVALID,
        `平台端对商家账号（${ROLE_LABELS[target.role]}）仅可封禁 / 解封与重置密码，其余资料由商家在商户后台自行维护`,
      );
    }
  }

  /** 平台账户：管理员可改资料、换平台角色、调整授权清单 */
  private async applyPlatformAccountChanges(
    user: User,
    dto: UpdateUserDto,
    operator: AuthUser,
  ): Promise<void> {
    if (dto.role !== undefined) {
      if (!isPlatformRole(dto.role)) {
        throw BusinessException.badRequest(
          ErrorCode.PARAM_INVALID,
          '平台账户不能改为商家角色，请在商户后台为商家维护员工',
        );
      }
      if (!canAssignRole(dto.role, operator.role)) {
        throw BusinessException.forbidden(
          `无权分配「${ROLE_LABELS[dto.role]}」角色，只能分配不高于自身权限的账号`,
        );
      }
      user.role = dto.role;
    }
    if (dto.permissions !== undefined) {
      user.permissions = this.resolveGrantedPermissions(user.role, dto.permissions);
    }
    // 平台账户恒无租户与门店归属，避免历史脏数据留着跨端可见范围
    user.storeId = null;
    this.applyProfileFields(user, dto);
  }

  /** 商家账号：由商户侧角色按原有租户 / 门店规则维护 */
  private async applyMerchantAccountChanges(
    user: User,
    dto: UpdateUserDto,
    operator: AuthUser,
  ): Promise<void> {
    // 角色或门店发生变化时重新解析归属，避免越权分配
    if (dto.role !== undefined || dto.storeId !== undefined) {
      const nextRole = dto.role ?? user.role;
      const nextStoreId = dto.storeId !== undefined ? dto.storeId : (user.storeId ?? undefined);
      const scope = await this.resolveUserScope(
        nextRole,
        user.merchantId,
        nextStoreId,
        operator,
      );
      user.role = nextRole;
      user.merchantId = scope.merchantId;
      user.storeId = scope.storeId;
    }
    this.applyProfileFields(user, dto);
  }

  private applyProfileFields(user: User, dto: UpdateUserDto): void {
    if (dto.nickname !== undefined) {
      user.nickname = dto.nickname;
    }
    if (dto.phone !== undefined) {
      user.phone = dto.phone;
    }
  }

  /**
   * 处理启用 / 禁用（封禁）状态变更，并落定**封禁归属**。
   *
   * 规则是**单向的**，不是「谁封的谁解」：平台侧高于商家侧。
   * - 平台封的号，商家解不开 —— 否则平台替商家止的血，商家一拨开关就放回去了；
   * - 商家自己封的号，商家和平台都能解 —— 平台是上级，商家内部停错人时平台应当能纠正。
   *
   * 平台管理员账号在上面已被拦掉，这里不会再遇到 `platform_admin`。
   */
  private applyStatusTransition(user: User, dto: UpdateUserDto, operator: AuthUser): void {
    if (dto.status === undefined || dto.status === user.status) {
      // 幂等：状态没变就不碰封禁归属，否则商家编辑资料时顺带带上 status 会被误伤
      return;
    }

    const side = isPlatformRole(operator.role)
      ? AccountBanSource.PLATFORM
      : AccountBanSource.MERCHANT;

    if (side === AccountBanSource.MERCHANT && user.bannedBy === AccountBanSource.PLATFORM) {
      throw BusinessException.forbidden('该账号由平台封禁，只能由平台解封');
    }

    user.status = dto.status;
    user.bannedBy = dto.status === CommonStatus.DISABLED ? side : null;
  }

  /**
   * 校验并归一化账号级授权清单。
   *
   * - 平台管理员：恒为 NULL（走角色默认）。给它写清单等于给唯一的上锁人配一把钥匙，
   *   勾错一次就可能把自己关在门外；
   * - 平台运营专员：清单即其全部能力，落在可授权白名单内并去重；
   * - 商家账号：不接受授权，商家的能力边界由角色 + 租户范围决定。
   */
  private resolveGrantedPermissions(
    role: Role,
    granted?: Permission[],
  ): Permission[] | null {
    if (role === Role.PLATFORM_ADMIN) {
      if (granted !== undefined) {
        throw BusinessException.badRequest(
          ErrorCode.PARAM_INVALID,
          '平台管理员使用角色默认权限，无需单独授权',
        );
      }
      return null;
    }

    if (role !== Role.PLATFORM_OPERATOR) {
      if (granted !== undefined) {
        throw BusinessException.badRequest(
          ErrorCode.PARAM_INVALID,
          '商家账号不支持账号级授权',
        );
      }
      return null;
    }

    const list = [...new Set(granted ?? [])];
    const rejected = list.filter((permission) => !isGrantablePermission(permission));
    if (rejected.length > 0) {
      throw BusinessException.badRequest(
        ErrorCode.PARAM_INVALID,
        `以下权限点不可下放给运营专员：${rejected.join('、')}`,
      );
    }
    return list;
  }

  /** 依据角色推导账号最终应落库的租户 / 门店归属 */
  private async resolveUserScope(
    role: Role,
    merchantId: number | null,
    storeId: number | undefined,
    operator: AuthUser,
  ): Promise<UserScope> {
    // 只能分配不高于自身的角色：否则拥有 user:update 的门店管理员
    // 就能把本店收银员提为商户管理员，取得整个商户的经营权限。
    if (!canAssignRole(role, operator.role)) {
      throw BusinessException.forbidden(
        `无权分配「${ROLE_LABELS[role]}」角色，只能分配不高于自身权限的账号`,
      );
    }

    // 平台侧账号不属于任何租户
    if (isPlatformRole(role)) {
      return { merchantId: null, storeId: null };
    }

    // 商户管理员由平台开通商户时一并创建，商家自己不能再开一个
    if (role === Role.MERCHANT_ADMIN) {
      throw BusinessException.badRequest(
        ErrorCode.PARAM_INVALID,
        '商户后台只能开通门店管理员与收银员；商户管理员账号请联系平台处理',
      );
    }

    if (merchantId === null) {
      throw BusinessException.badRequest(
        ErrorCode.TENANT_CONTEXT_MISSING,
        '该角色必须归属某个商户',
      );
    }

    // 商户管理员：归属商户，但不绑定具体门店
    if (!STORE_BOUND_ROLES.includes(role)) {
      return { merchantId, storeId: null };
    }

    // 门店管理员 / 收银员：必须绑定门店，且门店必须属于该商户
    if (!storeId) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, '该角色必须指定所属门店');
    }

    const store = await this.storeService.findByIdOrFail(storeId, operator);
    if (store.merchantId !== merchantId) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, '所选门店不属于目标商户');
    }

    return { merchantId, storeId };
  }

  /** 用户名全平台唯一（软删除的账号不占用用户名）；用户名创建后不可改 */
  private async assertUsernameAvailable(
    repository: Repository<User>,
    username: string,
  ): Promise<void> {
    const existed = await repository.findOne({ where: { username } });
    if (existed) {
      throw BusinessException.conflict(ErrorCode.USERNAME_EXISTS, '该用户名已被占用');
    }
  }
}
