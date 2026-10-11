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
    const seq = await this.nextSeq(prefix);
    return `${prefix}${todayYmd()}${String(seq).padStart(SEQ_PAD_LENGTH, '0')}`;
  }

  /**
   * 当天第几号，只回数字。
   *
   * 给「店员要念得出口」的短号用 —— 门店自提的取餐码就是它，`scope` 决定计数粒度：
   * `pickup-<storeId>` 表示「这家门店当天的第几单」。
   * 拿 `O20261011000042` 在柜台前报号是没法用的，所以才单独开这一条。
   *
   * ⚠️ 计数在 Redis：Redis 被清空后当天会从头再数，理论上可能撞号。
   * 撞号只是两个顾客同号，店员按下单时间与订单号仍能分开，所以没有加库级唯一约束。
   */
  async nextSeq(scope: string): Promise<number> {
    const ymd = todayYmd();
    const seq = await this.redis.incr(RedisKeys.serialSeq(scope, ymd));
    if (seq === 1) {
      await this.redis.expire(RedisKeys.serialSeq(scope, ymd), SEQ_TTL_SECONDS);
    }
    return seq;
  }
}

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
}
