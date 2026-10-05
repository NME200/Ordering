import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisKeys } from './redis.constants';

/** 序列号补零位数：每种单号每天最多 999999 笔 */
const SEQ_PAD_LENGTH = 6;

/** 序列 key 保留天数：跨天后仍要能续上，给足余量 */
const SEQ_TTL_SECONDS = 2 * 24 * 60 * 60;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 通用单号生成器（Redis 自增）。
 *
 * 格式：`<前缀><yyyyMMdd><6 位当日序号>`，例如：
 * - 订单号 `O20261005000001`
 * - 支付单号 `P20261005000001`
 * - 退款单号 `R20261005000001`
 *
 * 由 Redis `INCR` 生成，天然并发安全、按日递增，便于运营按单号排序排查。
 * 该服务由全局 RedisModule 导出，各业务模块直接注入即可，无需额外 import。
 */
@Injectable()
export class SerialNoGenerator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * 生成下一个单号。
   * @param prefix 业务前缀，如 `O`（订单）、`P`（支付）、`R`（退款）
   */
  async next(prefix: string): Promise<string> {
    const now = new Date();
    const ymd = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
    const key = RedisKeys.serialSeq(prefix, ymd);

    const seq = await this.redis.incr(key);
    if (seq === 1) {
      await this.redis.expire(key, SEQ_TTL_SECONDS);
    }

    return `${prefix}${ymd}${String(seq).padStart(SEQ_PAD_LENGTH, '0')}`;
  }
}
