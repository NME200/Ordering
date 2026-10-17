import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { resolveMerchantScope, resolveStoreScope } from '../../common/utils/tenant.util';
import { DINING_TYPE_LABELS } from '../../shared/enums/dining-type.enum';
import { PAYMENT_CHANNEL_LABELS, PaymentChannel } from '../../shared/enums/payment-channel.enum';
import { OrderStatus } from '../../shared/enums/order-status.enum';
import { PaymentStatus } from '../../shared/enums/payment-status.enum';
import { RefundStatus } from '../../shared/enums/refund-status.enum';
import { Customer } from '../customer/entities/customer.entity';
import { MemberProfile } from '../customer/entities/member-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Payment } from '../payment/entities/payment.entity';
import { Store } from '../store/entities/store.entity';
import {
  HourPointDto,
  LiveOrderDto,
  MerchantScreenDto,
  MixItemDto,
  PlatformScreenDto,
  RankItemDto,
  ScreenOverviewDto,
  TrendPointDto,
} from './dto/screen.dto';

/** 商家大屏的趋势窗口（天） */
const MERCHANT_TREND_DAYS = 14;
/** 平台大屏的趋势窗口（天） */
const PLATFORM_TREND_DAYS = 30;
/** 排行榜与实时流各取多少条 */
const RANK_LIMIT = 10;
const LIVE_LIMIT = 20;

/** 已经付过钱的订单状态：算营业额、算占比、上排行都只看这些 */
const PAID_ORDER_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
];

/**
 * 统计范围。
 *
 * `merchantId === null` 表示不限租户（平台角色看全站）；门店绑定角色会被
 * `resolveStoreScope` 收成他自己那一家店，前端传什么都改不动 —— 与其余接口同一套口径。
 */
interface Scope {
  merchantId: number | null;
  storeId: number | null;
}

/**
 * 数据大屏的聚合读服务。
 *
 * 三条口径先说清楚，免得对着屏吵：
 * 1. **营业额取支付流水（实收），不取订单应付**。券抵扣、会员价、部分退款都会让两个数不一样，
 *    而店主关心的是「今天真收到多少」。
 * 2. **退款不从营业额里扣，单独摆一个数**。抵掉的话「实收」与渠道对账单就对不上了。
 * 3. **趋势里的金额按支付时间归日、单量按下单时间归日** —— 两条线本来就不是同一件事，
 *    硬凑成一个口径反而看不出「今天下的单明天才付」这种长尾。
 *
 * 每个接口十来个 GROUP BY，刻意不加缓存：屏每 10 秒刷一次，这个量级的数据加缓存反而要处理
 * 「刚退的款没进屏」的一致性问题。真成瓶颈再说。
 */
@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Store) private readonly storeRepository: Repository<Store>,
    @InjectRepository(Merchant) private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(Customer) private readonly customerRepository: Repository<Customer>,
    @InjectRepository(MemberProfile) private readonly memberProfileRepository: Repository<MemberProfile>,
  ) {}

  /** 商家端大屏 */
  async merchantScreen(currentUser: AuthUser): Promise<MerchantScreenDto> {
    const scope: Scope = {
      merchantId: resolveMerchantScope(currentUser),
      storeId: resolveStoreScope(currentUser),
    };
    const [overview, trend, hourly, topDishes, storeRank, diningMix, liveOrders, scopeName] = await Promise.all([
      this.buildOverview(scope, 'merchant'),
      this.buildTrend(scope, MERCHANT_TREND_DAYS),
      this.buildHourly(scope),
      this.buildDishRank(scope),
      this.buildStoreRank(scope),
      this.buildDiningMix(scope),
      this.buildLiveOrders(scope),
      this.resolveScopeName(scope),
    ]);

    const dto = new MerchantScreenDto();
    dto.generatedAt = new Date().toISOString();
    dto.scopeName = scopeName;
    dto.overview = overview;
    dto.trend = trend;
    dto.hourly = hourly;
    dto.topDishes = topDishes;
    dto.storeRank = storeRank;
    dto.diningMix = diningMix;
    dto.liveOrders = liveOrders;
    return dto;
  }

  /** 平台端大屏 */
  async platformScreen(currentUser: AuthUser): Promise<PlatformScreenDto> {
    const scope: Scope = {
      merchantId: resolveMerchantScope(currentUser),
      storeId: resolveStoreScope(currentUser),
    };
    const [overview, trend, merchantRank, storeRank, channelMix, liveOrders, totals] = await Promise.all([
      this.buildOverview(scope, 'platform'),
      this.buildTrend(scope, PLATFORM_TREND_DAYS),
      this.buildMerchantRank(scope),
      this.buildStoreRank(scope),
      this.buildChannelMix(scope),
      this.buildLiveOrders(scope),
      this.buildTotals(),
    ]);

    const dto = new PlatformScreenDto();
    dto.generatedAt = new Date().toISOString();
    dto.overview = overview;
    dto.totals = totals;
    dto.trend = trend;
    dto.merchantRank = merchantRank;
    dto.storeRank = storeRank;
    dto.channelMix = channelMix;
    dto.liveOrders = liveOrders;
    return dto;
  }

  // ==================== 概览 ====================

  private async buildOverview(
    scope: Scope,
    newCustomerBasis: 'merchant' | 'platform',
  ): Promise<ScreenOverviewDto> {
    const today = startOfToday();

    const orderToday = applyScope(
      this.orderRepository
        .createQueryBuilder('order')
        .select('COUNT(*)', 'orderCount')
        .addSelect('SUM(CASE WHEN order.status IN (:...paid) THEN 1 ELSE 0 END)', 'paidOrderCount')
        .addSelect('SUM(CASE WHEN order.status = :cancelled THEN 1 ELSE 0 END)', 'cancelledCount')
        .where('order.createdAt >= :today', { today })
        .setParameters({ paid: PAID_ORDER_STATUSES, cancelled: OrderStatus.CANCELLED }),
      'order',
      scope,
    ).getRawOne<Record<string, string | null>>();

    const working = applyScope(
      this.orderRepository
        .createQueryBuilder('order')
        .select('SUM(CASE WHEN order.status = :paid THEN 1 ELSE 0 END)', 'pendingCount')
        .addSelect('SUM(CASE WHEN order.status = :preparing THEN 1 ELSE 0 END)', 'preparingCount')
        .addSelect('SUM(CASE WHEN order.status = :ready THEN 1 ELSE 0 END)', 'readyCount')
        .where('order.status IN (:...working)')
        .setParameters({
          paid: OrderStatus.PAID,
          preparing: OrderStatus.PREPARING,
          ready: OrderStatus.READY,
          working: [OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.READY],
        }),
      'order',
      scope,
    ).getRawOne<Record<string, string | null>>();

    const revenueToday = applyScope(
      this.paymentRepository
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)', 'revenueCent')
        .addSelect('COUNT(DISTINCT payment.storeId)', 'activeStoreCount')
        .where('payment.status = :success', { success: PaymentStatus.SUCCESS })
        .andWhere('payment.paidAt >= :today', { today }),
      'payment',
      scope,
    ).getRawOne<Record<string, string | null>>();

    const refundToday = applyScope(
      this.paymentRepository
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.refundAmount), 0)', 'refundCent')
        .where('payment.refundStatus = :refunded', { refunded: RefundStatus.SUCCESS })
        .andWhere('payment.refundedAt >= :today', { today }),
      'payment',
      scope,
    ).getRawOne<Record<string, string | null>>();

    // 商家看的「新客」是在本店所属商户下首单的人（会员档案的首单时间），
    // 平台看的才是全平台新注册账号 —— 同一个词，两个主体，不能混用一个查询。
    const newCustomers = this.countNewCustomers(scope, newCustomerBasis, today);

    const [orderRow, liveRow, revenueRow, refundRow, newCustomerCount] = await Promise.all([
      orderToday,
      working,
      revenueToday,
      refundToday,
      newCustomers,
    ]);

    const revenueCent = num(revenueRow?.revenueCent);
    const paidOrderCount = num(orderRow?.paidOrderCount);

    const dto = new ScreenOverviewDto();
    dto.revenueCent = revenueCent;
    dto.refundCent = num(refundRow?.refundCent);
    dto.orderCount = num(orderRow?.orderCount);
    dto.paidOrderCount = paidOrderCount;
    // 客单价＝实收 / 成交单数：一单多杯的店不会因此被算虚高
    dto.avgOrderCent = paidOrderCount > 0 ? Math.round(revenueCent / paidOrderCount) : 0;
    dto.pendingCount = num(liveRow?.pendingCount);
    dto.preparingCount = num(liveRow?.preparingCount);
    dto.readyCount = num(liveRow?.readyCount);
    dto.cancelledCount = num(orderRow?.cancelledCount);
    dto.newCustomerCount = newCustomerCount;
    dto.activeStoreCount = num(revenueRow?.activeStoreCount);
    return dto;
  }

  /**
   * 今日新客。
   *
   * 会员档案（`member_profiles`）**只有商户维度、没有门店维度** —— 同一个人在这条街
   * 和那条街消费是同一份档案。所以门店角色看到的这个数就是他所属商户的新客数，
   * 不能把 storeId 条件套上去（套了直接 SQL 报错），界面上那句标签写的是「今日新客（商户）」。
   */
  private async countNewCustomers(
    scope: Scope,
    basis: 'merchant' | 'platform',
    today: Date,
  ): Promise<number> {
    if (basis === 'platform') {
      return this.customerRepository.count({ where: { createdAt: MoreThanOrEqual(today) } });
    }
    const builder = this.memberProfileRepository
      .createQueryBuilder('profile')
      .where('profile.firstOrderAt >= :today', { today });
    if (scope.merchantId !== null) {
      builder.andWhere('profile.merchantId = :scopeMerchantId', { scopeMerchantId: scope.merchantId });
    }
    return builder.getCount();
  }

  /** 平台盘子：三个总数 */
  private async buildTotals(): Promise<{ merchants: number; stores: number; customers: number }> {
    const [merchants, stores, customers] = await Promise.all([
      this.merchantRepository.count(),
      this.storeRepository.count(),
      this.customerRepository.count(),
    ]);
    return { merchants, stores, customers };
  }

  // ==================== 趋势与分时 ====================

  /** 近 N 天趋势：库里没有的日期补 0，否则折线会自己「跳过」空白天 */
  private async buildTrend(scope: Scope, days: number): Promise<TrendPointDto[]> {
    const since = startOfDay(days - 1);
    const [revenueRows, orderRows] = await Promise.all([
      applyScope(
        this.paymentRepository
          .createQueryBuilder('payment')
          .select("DATE_FORMAT(payment.paidAt, '%Y-%m-%d')", 'day')
          .addSelect('COALESCE(SUM(payment.amount), 0)', 'value')
          .where('payment.status = :success', { success: PaymentStatus.SUCCESS })
          .andWhere('payment.paidAt >= :since', { since })
          .groupBy('day'),
        'payment',
        scope,
      ).getRawMany<Record<string, string>>(),
      applyScope(
        this.orderRepository
          .createQueryBuilder('order')
          .select("DATE_FORMAT(order.createdAt, '%Y-%m-%d')", 'day')
          .addSelect('COUNT(*)', 'value')
          .where('order.createdAt >= :since', { since })
          .groupBy('day'),
        'order',
        scope,
      ).getRawMany<Record<string, string>>(),
    ]);

    const revenue = toMap(revenueRows, 'day');
    const orders = toMap(orderRows, 'day');
    const points: TrendPointDto[] = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = dayKey(startOfDay(offset));
      points.push({
        date: day,
        revenueCent: num(revenue.get(day)),
        orderCount: num(orders.get(day)),
      });
    }
    return points;
  }

  /** 今日 0–23 时：整条补齐，缺的小时为 0 */
  private async buildHourly(scope: Scope): Promise<HourPointDto[]> {
    const today = startOfToday();
    const [orderRows, revenueRows] = await Promise.all([
      applyScope(
        this.orderRepository
          .createQueryBuilder('order')
          .select('HOUR(order.createdAt)', 'hour')
          .addSelect('COUNT(*)', 'value')
          .where('order.createdAt >= :today', { today })
          .groupBy('hour'),
        'order',
        scope,
      ).getRawMany<Record<string, string>>(),
      applyScope(
        this.paymentRepository
          .createQueryBuilder('payment')
          .select('HOUR(payment.paidAt)', 'hour')
          .addSelect('COALESCE(SUM(payment.amount), 0)', 'value')
          .where('payment.status = :success', { success: PaymentStatus.SUCCESS })
          .andWhere('payment.paidAt >= :today', { today })
          .groupBy('hour'),
        'payment',
        scope,
      ).getRawMany<Record<string, string>>(),
    ]);

    const orders = toMap(orderRows, 'hour');
    const revenue = toMap(revenueRows, 'hour');
    const points: HourPointDto[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      points.push({
        hour,
        orderCount: num(orders.get(String(hour))),
        revenueCent: num(revenue.get(String(hour))),
      });
    }
    return points;
  }

  // ==================== 排行与占比 ====================

  /** 今日菜品销量 Top：只数付过钱的单，未支付与取消的不算卖出去 */
  private async buildDishRank(scope: Scope): Promise<RankItemDto[]> {
    const today = startOfToday();
    const qb = this.orderItemRepository
      .createQueryBuilder('item')
      // 手写 join 不会自动带软删条件，漏掉就会把已删订单的菜品算进榜
      .innerJoin(Order, 'order', 'order.id = item.orderId AND order.deleted_at IS NULL')
      .select('item.dishId', 'id')
      .addSelect('item.dishName', 'name')
      .addSelect('SUM(item.quantity)', 'count')
      .addSelect('COALESCE(SUM(item.subtotal), 0)', 'value')
      .where('order.createdAt >= :today', { today })
      .andWhere('order.status IN (:...paid)')
      .setParameters({ paid: PAID_ORDER_STATUSES })
      .groupBy('item.dishId')
      .addGroupBy('item.dishName')
      .orderBy('count', 'DESC')
      .limit(RANK_LIMIT);
    if (scope.merchantId !== null) {
      qb.andWhere('order.merchantId = :scopeMerchantId', { scopeMerchantId: scope.merchantId });
    }
    if (scope.storeId !== null) {
      qb.andWhere('order.storeId = :scopeStoreId', { scopeStoreId: scope.storeId });
    }

    const rows = await qb.getRawMany<Record<string, string>>();
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name ?? ''),
      valueCent: num(row.value),
      count: num(row.count),
    }));
  }

  /** 今日门店实收 Top */
  private async buildStoreRank(scope: Scope): Promise<RankItemDto[]> {
    const today = startOfToday();
    const rows = await applyScope(
      this.paymentRepository
        .createQueryBuilder('payment')
        .select('payment.storeId', 'id')
        .addSelect('COALESCE(SUM(payment.amount), 0)', 'value')
        .addSelect('COUNT(*)', 'count')
        .where('payment.status = :success', { success: PaymentStatus.SUCCESS })
        .andWhere('payment.paidAt >= :today', { today })
        .groupBy('payment.storeId')
        .orderBy('value', 'DESC')
        .limit(RANK_LIMIT),
      'payment',
      scope,
    ).getRawMany<Record<string, string>>();

    const names = await this.storeNames(rows.map((row) => Number(row.id)));
    return rows.map((row) => ({
      id: Number(row.id),
      name: names.get(Number(row.id)) ?? `门店#${row.id}`,
      valueCent: num(row.value),
      count: num(row.count),
    }));
  }

  /** 今日商户实收 Top（平台版） */
  private async buildMerchantRank(scope: Scope): Promise<RankItemDto[]> {
    const today = startOfToday();
    const rows = await applyScope(
      this.paymentRepository
        .createQueryBuilder('payment')
        .select('payment.merchantId', 'id')
        .addSelect('COALESCE(SUM(payment.amount), 0)', 'value')
        .addSelect('COUNT(*)', 'count')
        .where('payment.status = :success', { success: PaymentStatus.SUCCESS })
        .andWhere('payment.paidAt >= :today', { today })
        .groupBy('payment.merchantId')
        .orderBy('value', 'DESC')
        .limit(RANK_LIMIT),
      'payment',
      scope,
    ).getRawMany<Record<string, string>>();

    const ids = rows.map((row) => Number(row.id));
    const names = new Map<number, string>();
    if (ids.length > 0) {
      const merchants = await this.merchantRepository.find({
        where: ids.map((id) => ({ id })),
        select: { id: true, name: true },
      });
      for (const merchant of merchants) {
        names.set(Number(merchant.id), merchant.name);
      }
    }
    return rows.map((row) => ({
      id: Number(row.id),
      name: names.get(Number(row.id)) ?? `商户#${row.id}`,
      valueCent: num(row.value),
      count: num(row.count),
    }));
  }

  /** 今日就餐方式占比 */
  private async buildDiningMix(scope: Scope): Promise<MixItemDto[]> {
    const today = startOfToday();
    const rows = await applyScope(
      this.orderRepository
        .createQueryBuilder('order')
        .select('order.diningType', 'key')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(order.paidAmount), 0)', 'value')
        .where('order.createdAt >= :today', { today })
        .andWhere('order.status IN (:...paid)')
        .setParameters({ paid: PAID_ORDER_STATUSES })
        .groupBy('order.diningType'),
      'order',
      scope,
    ).getRawMany<Record<string, string>>();

    return rows.map((row) => ({
      key: String(row.key),
      label: labelOf(DINING_TYPE_LABELS, Number(row.key)) ?? `方式${row.key}`,
      count: num(row.count),
      valueCent: num(row.value),
    }));
  }

  /** 今日支付渠道占比（含线下收款：店主看的是「钱从哪来的」） */
  private async buildChannelMix(scope: Scope): Promise<MixItemDto[]> {
    const today = startOfToday();
    const rows = await applyScope(
      this.paymentRepository
        .createQueryBuilder('payment')
        .select('payment.channel', 'key')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(payment.amount), 0)', 'value')
        .where('payment.status = :success', { success: PaymentStatus.SUCCESS })
        .andWhere('payment.paidAt >= :today', { today })
        .groupBy('payment.channel'),
      'payment',
      scope,
    ).getRawMany<Record<string, string>>();

    return rows.map((row) => ({
      key: String(row.key),
      label: labelOf(PAYMENT_CHANNEL_LABELS, row.key as PaymentChannel) ?? String(row.key),
      count: num(row.count),
      valueCent: num(row.value),
    }));
  }

  // ==================== 实时单流 ====================

  /**
   * 最近 N 单。
   *
   * 未支付的单不上屏：顾客没付钱的几分钟里单子一直在，刷频全是噪音。
   * 菜品摘要用一条 IN 查询补齐，不按单查 20 次。
   */
  private async buildLiveOrders(scope: Scope): Promise<LiveOrderDto[]> {
    const orders = await applyScope(
      this.orderRepository
        .createQueryBuilder('order')
        .where('order.status != :pending', { pending: OrderStatus.PENDING_PAYMENT })
        .orderBy('order.createdAt', 'DESC')
        .take(LIVE_LIMIT),
      'order',
      scope,
    ).getMany();
    if (orders.length === 0) {
      return [];
    }

    const [items, storeNames] = await Promise.all([
      this.orderItemRepository.find({
        where: orders.map((order) => ({ orderId: order.id })),
        select: { orderId: true, dishName: true, quantity: true },
      }),
      this.storeNames(orders.map((order) => Number(order.storeId))),
    ]);

    const grouped = new Map<number, string>();
    for (const item of items) {
      const orderId = Number(item.orderId);
      const line = `${item.dishName}×${item.quantity}`;
      grouped.set(orderId, grouped.has(orderId) ? `${grouped.get(orderId)}、${line}` : line);
    }

    const now = Date.now();
    return orders.map((order) => {
      const dto = new LiveOrderDto();
      dto.orderNo = order.orderNo;
      dto.storeName = storeNames.get(Number(order.storeId)) ?? `门店#${order.storeId}`;
      dto.tableNo = order.tableNo;
      dto.pickupCode = order.pickupCode;
      dto.diningType = order.diningType;
      dto.status = order.status;
      dto.payableCent = order.payableAmount;
      dto.itemCount = order.itemCount;
      dto.itemsSummary = grouped.get(Number(order.id)) ?? '';
      dto.remark = order.remark;
      dto.createdAt = new Date(order.createdAt).toISOString();
      dto.minutesAgo = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60_000));
      return dto;
    });
  }

  // ==================== 内部辅助 ====================

  private async storeNames(ids: number[]): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (unique.length === 0) {
      return new Map();
    }
    const stores = await this.storeRepository.find({
      where: unique.map((id) => ({ id })),
      select: { id: true, name: true },
    });
    return new Map(stores.map((store) => [Number(store.id), store.name]));
  }

  /** 大屏右上角那句「统计范围」：门店角色看到的是店名，商户角色看到商户名，平台看到全平台 */
  private async resolveScopeName(scope: Scope): Promise<string> {
    if (scope.storeId !== null) {
      const store = await this.storeRepository.findOne({
        where: { id: scope.storeId },
        select: { id: true, name: true },
      });
      return store?.name ?? `门店#${scope.storeId}`;
    }
    if (scope.merchantId !== null) {
      const merchant = await this.merchantRepository.findOne({
        where: { id: scope.merchantId },
        select: { id: true, name: true },
      });
      return merchant?.name ?? `商户#${scope.merchantId}`;
    }
    return '全平台';
  }
}

/**
 * 把租户与门店范围挂到查询上。
 *
 * 单独一个函数是因为这类条件**漏一次就是跨租户读数**，而漏掉的样子和写对了一模一样：
 * 数据照样出、状态码照样 200，只有换账号登录时才露馅。null 表示平台角色不限范围。
 */
function applyScope<Entity extends ObjectLiteral>(
  builder: SelectQueryBuilder<Entity>,
  alias: string,
  scope: Scope,
): SelectQueryBuilder<Entity> {
  if (scope.merchantId !== null) {
    builder.andWhere(`${alias}.merchantId = :scopeMerchantId`, { scopeMerchantId: scope.merchantId });
  }
  if (scope.storeId !== null) {
    builder.andWhere(`${alias}.storeId = :scopeStoreId`, { scopeStoreId: scope.storeId });
  }
  return builder;
}

/** 原始行里的数字：MySQL 的 SUM / COUNT 回来全是字符串 */
function num(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 把 GROUP BY 的原始行收成 key → value 的表 */
function toMap(rows: Array<Record<string, string>>, keyField: string): Map<string, string> {
  return new Map(rows.map((row) => [String(row[keyField]), String(row.value)]));
}

function labelOf<K extends string | number>(labels: Record<K, string>, key: K): string | undefined {
  return labels?.[key];
}

/**
 * 日界一律按**东八区**算，与进程时区无关。
 *
 * 数据库连接串写死 `timezone: '+08:00'`（database.module.ts:33），datetime 列存的是
 * 东八区墙上时间；而 `new Date(y, m, d)` 取的是**进程本地时区**。容器默认 UTC 时两者差 8 小时，
 * 表现是「今日实收漏掉凌晨那一截、分时图整体平移」—— 在本机永远复现不出来，一上云就错。
 * 所以这里显式按 +08 求日历日，再换算回 UTC 瞬时交给 mysql2。
 */
const BEIJING_OFFSET_MS = 8 * 3600_000;

/** 今日 0 点（东八区）对应的 UTC 瞬时 */
function startOfToday(): Date {
  return startOfDay(0);
}

/** N 天前的 0 点（东八区）对应的 UTC 瞬时 */
function startOfDay(daysAgo: number): Date {
  const beijing = new Date(Date.now() + BEIJING_OFFSET_MS);
  return new Date(
    Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate() - daysAgo) - BEIJING_OFFSET_MS,
  );
}

/** 某个瞬时对应的东八区日历日，形如 2026-10-14 —— 与 SQL 里 DATE_FORMAT 的取值同一口径 */
function dayKey(date: Date): string {
  const beijing = new Date(date.getTime() + BEIJING_OFFSET_MS);
  const month = String(beijing.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijing.getUTCDate()).padStart(2, '0');
  return `${beijing.getUTCFullYear()}-${month}-${day}`;
}
