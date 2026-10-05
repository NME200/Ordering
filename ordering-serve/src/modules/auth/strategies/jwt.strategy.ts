import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import Redis from 'ioredis';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { AuthUser } from '../../../common/interfaces/auth-user.interface';
import { getEffectivePermissions } from '../../../shared/constants/permission-map';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { REDIS_CLIENT, RedisKeys } from '../../redis/redis.constants';
import { MerchantService } from '../../merchant/merchant.service';
import { UserService } from '../../user/user.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * JWT 校验策略。
 *
 * 每次请求都会做四件事：
 * 1. 检查 Token 是否在 Redis 黑名单中（登出后立即失效）；
 * 2. 从数据库读取账号最新状态，避免「已禁用账号仍能凭旧 Token 访问」；
 * 3. 校验账号所属**商户**仍然可用（未禁用、未到期），避免「商户已被平台停掉，
 *    其在职账号仍可在 Token 有效期内继续操作」；
 * 4. 比对会话版本号，使被重置密码 / 被强制下线的账号旧 Token 全部作废。
 *
 * 角色、权限点与租户上下文都取自数据库当前值而非 Token，因此改角色、改门店归属、
 * 改授权（`users.permissions`）与封禁都能即时生效，不需要等 Token 过期。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly userService: UserService,
    private readonly merchantService: MerchantService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  /** 校验通过后返回的对象会挂到 request.user */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const blacklisted = await this.redis.get(RedisKeys.tokenBlacklist(payload.jti));
    if (blacklisted) {
      throw BusinessException.unauthorized('登录已失效，请重新登录');
    }

    const user = await this.userService.findByIdForAuth(payload.sub);
    if (!user) {
      throw BusinessException.unauthorized('账号不存在或已被删除');
    }
    if (user.status !== CommonStatus.ENABLED) {
      throw BusinessException.unauthorized('账号已被禁用，请联系管理员');
    }

    /**
     * 商户（租户）维度校验。
     *
     * 只在登录时校验过一次是不够的：Token 有效期 7 天，平台禁用商户或商户欠费
     * 到期后，在职员工手里的旧 Token 仍能继续读写、C 端也仍能继续对该商户下单。
     * 平台管理员不属于任何租户（merchantId 为 null），跳过。
     */
    if (user.merchantId !== null) {
      await this.merchantService.assertUsableForRequest(user.merchantId);
    }

    // 会话版本号不一致 = 该账号被重置密码或被强制下线，旧 Token 一律作废
    if (payload.tokenVersion !== user.tokenVersion) {
      throw BusinessException.unauthorized('登录状态已失效，请重新登录');
    }

    return {
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      merchantId: user.merchantId,
      storeId: user.storeId,
      permissions: getEffectivePermissions(user.role, user.permissions),
      jti: payload.jti,
    };
  }
}
