import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { parseDurationToSeconds } from '../../shared/utils/duration.util';
import { REDIS_CLIENT, RedisKeys } from '../redis/redis.constants';
import { Customer } from './entities/customer.entity';

/** 顾客令牌里的载荷。`kind` 是必填判别位，见 CustomerTokenService.verify */
interface CustomerJwtPayload {
  sub: number;
  kind: 'customer';
  tokenVersion: number;
  jti: string;
}

/**
 * 顾客令牌服务。
 *
 * 为什么不走 passport：全局 `JwtAuthGuard` 已经占了 `'jwt'` 这个策略名，
 * 它的 validate 会去查 `users` 表。C 端主体在 `customers` 表里，
 * 再注册一个策略名只是多一层间接，这里直接 verify 更清楚。
 *
 * **令牌必须带 `kind: 'customer'`，员工侧也必须拒掉带 kind 的令牌**：
 * 两边都用同一个签名密钥，且 `customers.id` 与 `users.id` 都是各自表的自增号，
 * 必然出现「顾客 3 号」和「员工 3 号」同号的情况。少了这道判别位，
 * 一张顾客令牌就能命中同号员工，直接拿到后台权限。
 */
@Injectable()
export class CustomerTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** 签发令牌。每次签发都是新 jti，登出只作废当前这一张 */
  async issue(customer: Customer): Promise<{ accessToken: string; expiresIn: string }> {
    const payload: CustomerJwtPayload = {
      sub: customer.id,
      kind: 'customer',
      tokenVersion: customer.tokenVersion,
      jti: randomUUID(),
    };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, expiresIn: this.configService.getOrThrow<string>('jwt.expiresIn') };
  }

  /**
   * 校验令牌并还原顾客上下文。
   *
   * 每次都回库读 status 与 tokenVersion：封禁一个顾客必须立即生效，
   * 顾客令牌有效期和员工一样是 7 天，只靠令牌里的快照等于封禁要等到下周。
   */
  async verify(rawToken: string | undefined): Promise<AuthCustomer> {
    if (!rawToken) {
      throw BusinessException.unauthorized('请先登录');
    }

    let payload: CustomerJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<CustomerJwtPayload>(rawToken);
    } catch {
      throw new BusinessException(
        ErrorCode.CUSTOMER_TOKEN_INVALID,
        '登录已失效，请重新进入小程序',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (payload.kind !== 'customer') {
      throw BusinessException.unauthorized('令牌类型不匹配');
    }
    if (await this.redis.get(RedisKeys.tokenBlacklist(payload.jti))) {
      throw BusinessException.unauthorized('登录已失效，请重新进入小程序');
    }

    const customer = await this.customerRepository.findOne({ where: { id: payload.sub } });
    if (!customer) {
      throw BusinessException.unauthorized('账号不存在');
    }
    if (customer.status !== CommonStatus.ENABLED) {
      throw new BusinessException(
        ErrorCode.CUSTOMER_TOKEN_INVALID,
        '账号已被停用，请联系客服',
        HttpStatus.FORBIDDEN,
      );
    }
    if (customer.tokenVersion !== payload.tokenVersion) {
      throw BusinessException.unauthorized('登录状态已失效，请重新进入小程序');
    }

    return {
      customerId: customer.id,
      visitorKey: customer.visitorKey,
      phone: customer.phone,
      nickname: customer.nickname,
      jti: payload.jti,
    };
  }

  /** 登出：把当前 jti 拉黑到自然过期 */
  async revoke(jti: string): Promise<void> {
    const ttl = parseDurationToSeconds(this.configService.getOrThrow<string>('jwt.expiresIn'));
    await this.redis.set(RedisKeys.tokenBlacklist(jti), '1', 'EX', ttl);
  }

  /** 从请求头取 Bearer 令牌 */
  extractBearer(authorization: string | undefined): string | undefined {
    if (!authorization?.startsWith('Bearer ')) {
      return undefined;
    }
    return authorization.slice(7).trim() || undefined;
  }
}
