import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { isRoleAllowedInPortal } from '../../shared/constants/portal-map';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { PORTAL_LABELS } from '../../shared/enums/portal.enum';
import { ROLE_LABELS } from '../../shared/enums/role.enum';
import { parseDurationToSeconds } from '../../shared/utils/duration.util';
import { verifyPassword } from '../../shared/utils/password.util';
import { MerchantService } from '../merchant/merchant.service';
import { REDIS_CLIENT, RedisKeys } from '../redis/redis.constants';
import { UserService } from '../user/user.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResultDto } from './dto/login-result.dto';
import { ProfileDto } from './dto/profile.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/** 连续登录失败达到该次数后临时锁定 */
const MAX_LOGIN_FAIL = 5;

/** 登录失败计数窗口 / 锁定时长（秒） */
const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;

/**
 * 认证服务。
 *
 * 职责：登录、登出、查询当前账号、修改本人密码。
 * 租户上下文在登录时写入 Token，后续请求由 JwtStrategy 还原。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly merchantService: MerchantService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** 账号登录 */
  async login(dto: LoginDto): Promise<LoginResultDto> {
    const failKey = RedisKeys.loginFailCount(dto.username);
    await this.assertNotLocked(failKey);

    const user = await this.userService.findByUsernameWithPassword(dto.username);
    if (!user || !(await verifyPassword(dto.password, user.password))) {
      await this.recordLoginFailure(failKey);
      // 统一提示，不区分「账号不存在」与「密码错误」，避免账号枚举
      throw new BusinessException(
        ErrorCode.PASSWORD_INCORRECT,
        '用户名或密码错误',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.status !== CommonStatus.ENABLED) {
      throw new BusinessException(
        ErrorCode.USER_DISABLED,
        '账号已被禁用，请联系管理员',
        HttpStatus.FORBIDDEN,
      );
    }

    /**
     * 端归属校验：账号角色必须属于所登录的客户端（见 shared/constants/portal-map.ts）。
     *
     * 放在凭据校验**之后**：既避免账号枚举，也让提示只对已通过认证的人可见。
     * 这不是「前端隐藏入口」的重复，而是唯一有效的拦截点。
     */
    if (!isRoleAllowedInPortal(user.role, dto.portal)) {
      this.logger.warn(
        `拒绝跨端登录：${user.username}（${ROLE_LABELS[user.role]}）尝试登录${PORTAL_LABELS[dto.portal]}`,
      );
      throw new BusinessException(
        ErrorCode.PORTAL_NOT_ALLOWED,
        `该账号为「${ROLE_LABELS[user.role]}」，无法登录${PORTAL_LABELS[dto.portal]}，请使用对应的客户端`,
        HttpStatus.FORBIDDEN,
      );
    }

    // 商户维度的可用性校验：被禁用 / 已过期的商户不允许登录
    if (user.merchantId !== null) {
      await this.merchantService.assertEnabled(user.merchantId);
    }

    await this.redis.del(failKey);
    await this.userService.touchLastLogin(user.id);

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      merchantId: user.merchantId,
      storeId: user.storeId,
      tokenVersion: user.tokenVersion,
      jti: randomUUID(),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const expiresIn = this.configService.getOrThrow<string>('jwt.expiresIn');

    this.logger.log(
      `账号登录成功：${user.username}（${ROLE_LABELS[user.role]}）→ ${PORTAL_LABELS[dto.portal]}`,
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: ProfileDto.from(user),
    };
  }

  /** 退出登录：把当前 Token 加入黑名单，立即失效 */
  async logout(currentUser: AuthUser): Promise<void> {
    await this.revokeToken(currentUser.jti);
    this.logger.log(`账号退出登录：${currentUser.username}`);
  }

  /** 获取当前登录账号信息（从数据库读取最新状态） */
  async getProfile(currentUser: AuthUser): Promise<ProfileDto> {
    const user = await this.userService.findByIdForAuth(currentUser.userId);
    if (!user) {
      throw BusinessException.notFound(ErrorCode.USER_NOT_FOUND, '账号不存在');
    }
    return ProfileDto.from(user);
  }

  /**
   * 修改本人密码。
   * UserService 会自增会话版本号，该账号此前签发的**全部** Token 随之失效，
   * 因此这里不再单独黑名单当前 jti。
   */
  async changePassword(currentUser: AuthUser, dto: ChangePasswordDto): Promise<void> {
    await this.userService.changePassword(currentUser.userId, dto.oldPassword, dto.newPassword);
    this.logger.log(`账号修改密码：${currentUser.username}`);
  }

  // ==================== 内部辅助 ====================

  /** 校验是否处于登录失败锁定中 */
  private async assertNotLocked(failKey: string): Promise<void> {
    const raw = await this.redis.get(failKey);
    const failCount = raw ? Number(raw) : 0;
    if (failCount < MAX_LOGIN_FAIL) {
      return;
    }

    const ttl = await this.redis.ttl(failKey);
    const minutes = ttl > 0 ? Math.ceil(ttl / 60) : 1;
    throw new BusinessException(
      ErrorCode.USER_LOCKED,
      `登录失败次数过多，请 ${minutes} 分钟后再试`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** 记录一次登录失败，并刷新计数窗口 */
  private async recordLoginFailure(failKey: string): Promise<void> {
    await this.redis.incr(failKey);
    await this.redis.expire(failKey, LOGIN_FAIL_WINDOW_SECONDS);
  }

  /** 把 Token 的唯一标识加入黑名单，过期时间与 Token 有效期一致 */
  private async revokeToken(jti: string): Promise<void> {
    const ttl = parseDurationToSeconds(
      this.configService.getOrThrow<string>('jwt.expiresIn'),
    );
    await this.redis.set(RedisKeys.tokenBlacklist(jti), '1', 'EX', ttl);
  }
}
