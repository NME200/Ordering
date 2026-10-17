import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  GROWTH_PER_YUAN,
  MEMBER_LEVELS,
  nextMemberLevel,
  PointReason,
  POINT_PER_YUAN,
  resolveMemberLevel,
} from '../../shared/enums/customer.enum';
import { MemberAssetDto, PointLogDto } from './dto/customer-response.dto';
import { MemberProfile } from './entities/member-profile.entity';
import { PointLog } from './entities/point-log.entity';
import { Customer } from './entities/customer.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import {
  ActivityBonusRule,
  PointActivityService,
} from '../point-activity/point-activity.service';

/** 成长任务定义。写死在代码里：任务与权益是承诺，不在后台随手改 */
export interface MemberTask {
  key: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  done: boolean;
}

/**
 * 会员资产服务（积分 / 成长值 / 等级）。
 *
 * 三条规矩：
 * 1. **一切变动都走流水**。`point_logs` 上 `(orderId, reason)` 唯一，
 *    支付回调重复到达、退款与取消同时发生，第二次插入必然冲突，直接跳过 ——
 *    这是「一笔订单只加一次分」的唯一可靠实现。
 * 2. **能进事务就进事务**。调用方（支付回调）本身开着一个事务，
 *    把 EntityManager 传进来，订单状态与积分要么一起成，要么一起回滚。
 * 3. **等级由成长值推导，不单独存**。存了就要维护一致性，而它没有任何独立信息量。
 */
@Injectable()
export class MemberService {
  private readonly logger = new Logger(MemberService.name);

  constructor(
    @InjectRepository(MemberProfile)
    private readonly profileRepository: Repository<MemberProfile>,
    @InjectRepository(PointLog)
    private readonly pointLogRepository: Repository<PointLog>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly dataSource: DataSource,
    private readonly pointActivityService: PointActivityService,
  ) {}

  /** 取会员档案；没有就建一条全零的（首次进这家商户） */
  async getOrCreate(customerId: number, merchantId: number): Promise<MemberProfile> {
    const existing = await this.profileRepository.findOne({ where: { customerId, merchantId } });
    if (existing) {
      return existing;
    }
    try {
      return await this.profileRepository.save(
        this.profileRepository.create({ customerId, merchantId }),
      );
    } catch (error) {
      // 并发首登（同一顾客同时开两个页面）会撞唯一索引，读回来即可
      if (this.isDuplicate(error)) {
        const row = await this.profileRepository.findOne({ where: { customerId, merchantId } });
        if (row) {
          return row;
        }
      }
      throw error;
    }
  }

  /** 组装「我的」页资产栏 + 会员卡页需要的等级信息 */
  async buildAssetDto(
    customerId: number,
    merchantId: number,
    couponCount: number,
  ): Promise<MemberAssetDto> {
    const profile = await this.getOrCreate(customerId, merchantId);
    const level = resolveMemberLevel(profile.growth);
    const next = nextMemberLevel(level.level);

    const dto = new MemberAssetDto();
    dto.merchantId = merchantId;
    dto.point = profile.point;
    dto.balance = profile.balance;
    dto.growth = profile.growth;
    dto.level = level.level;
    dto.levelName = level.name;
    dto.nextLevel = next ? { ...next, remainGrowth: Math.max(0, next.needGrowth - profile.growth) } : null;
    dto.couponCount = couponCount;
    dto.totalPaid = profile.totalPaid;
    dto.orderCount = profile.orderCount;
    return dto;
  }

  /**
   * 支付成功后累计成长值与积分。
   *
   * 口径：**实付 1 元 = 1 成长值 = 1 积分**，向下取整。
   * 用实付而不是应付，是因为用券抵扣掉的那部分钱从来没进商户账，
   * 按应付算会让「大额券 + 小额支付」刷出成倍成长值。
   */
  async accrueForPaidOrder(order: Order, manager?: EntityManager): Promise<void> {
    if (order.customerId === null) {
      // 游客下的单：没有归属账号，不累计任何资产
      return;
    }
    const em = manager ?? this.dataSource.manager;
    const paid = order.paidAmount ?? order.payableAmount;
    const yuan = Math.floor(paid / 100);
    const gain = yuan * POINT_PER_YUAN;
    const growth = yuan * GROWTH_PER_YUAN;

    const inserted = await this.tryWriteLog(
      {
        customerId: order.customerId,
        merchantId: order.merchantId,
        pointChange: gain,
        growthChange: growth,
        reason: PointReason.ORDER,
        orderId: order.id,
        remark: `订单 ${order.orderNo} 实付累计`,
      },
      em,
    );
    if (!inserted) {
      return;
    }

    /**
     * 平台积分活动的加成。**与基础分各记一条流水**：
     * 合在一起就没法回答「这 30 分是平台补贴还是常规消费给的」，
     * 退款时也只能按当前规则重算，而规则在活动期间是被改过的。
     */
    const bonus = await this.grantOrderBonus(order, order.customerId, paid, em);

    const pointAfter = await this.upsertDelta(
      em,
      order.customerId,
      order.merchantId,
      {
        point: gain + bonus,
        growth,
        orderCount: 1,
        totalPaid: paid,
        orderAt: order.paidAt ?? new Date(),
      },
    );
    /**
     * 「变动后余额」要回填到这一单的**两条**流水上：基础分与加成是同一次累加落账的，
     * 只更新 `order` 那一行的话，明细里的加加成行会一直挂着 0 分余额（实测抓到的真缺陷）。
     */
    await em.getRepository(PointLog).update(
      { orderId: order.id, reason: In([PointReason.ORDER, PointReason.ACTIVITY]) },
      { pointAfter },
    );
  }

  /**
   * 退款后扣回。
   *
   * 扣回允许把积分扣成负数吗 —— 不允许。顾客可能已经把这批积分花掉了，
   * 这里只做「有多少扣多少」（SQL 里的 GREATEST(0, …)），
   * 宁可少扣也不能出现负积分让顾客看到「-30 分」这种无法解释的数字。
   */
  async reverseForRefund(order: Order): Promise<void> {
    if (order.customerId === null) {
      return;
    }
    const paid = order.paidAmount ?? order.payableAmount;
    const yuan = Math.floor(paid / 100);
    const loss = yuan * POINT_PER_YUAN;

    const inserted = await this.tryWriteLog({
      customerId: order.customerId,
      merchantId: order.merchantId,
      pointChange: -loss,
      growthChange: -yuan * GROWTH_PER_YUAN,
      reason: PointReason.REFUND,
      orderId: order.id,
      remark: `订单 ${order.orderNo} 退款扣回`,
    });
    if (!inserted) {
      return;
    }

    /**
     * 活动加成的回冲按**当初发放时那条流水的原额**，不按当前规则重算：
     * 活动在订单之后可能被改过倍数、甚至已经下线，历史单的分账不能跟着变。
     */
    const revoke = await this.revokeOrderBonus(order);

    const pointAfter = await this.upsertDelta(
      this.dataSource.manager,
      order.customerId,
      order.merchantId,
      {
        point: -(loss + revoke),
        growth: -yuan * GROWTH_PER_YUAN,
        orderCount: -1,
        totalPaid: -paid,
        orderAt: null,
      },
    );
    await this.pointLogRepository.update(
      { orderId: order.id, reason: In([PointReason.REFUND, PointReason.ACTIVITY_REVOKE]) },
      { pointAfter },
    );
  }

  /** 评价赠分。同一订单只可能有一条评价（reviews.orderId 唯一），所以天然幂等 */
  async awardReviewPoint(
    customerId: number,
    merchantId: number,
    orderId: number,
    point: number,
    diningType: number,
  ): Promise<number> {
    const inserted = await this.tryWriteLog({
      customerId,
      merchantId,
      pointChange: point,
      growthChange: 0,
      reason: PointReason.REVIEW,
      orderId,
      remark: '提交订单评价赠送',
    });
    if (!inserted) {
      return 0;
    }

    /**
     * 评价的活动加成**不受菜品条件约束**（评价是对整单服务的评价），
     * 但要跟着就餐方式走：配了「仅限堂食」的活动，不该给外卖单的评价送分。
     */
    const activity = await this.pointActivityService.effectiveFor(merchantId);
    const rule = await this.pointActivityService.bonusRuleForReview(activity, diningType);
    const bonus = rule ? await this.grantReviewBonus(rule, customerId, merchantId, orderId) : 0;

    const pointAfter = await this.upsertDelta(this.dataSource.manager, customerId, merchantId, {
      point: point + bonus,
      growth: 0,
      orderCount: 0,
      totalPaid: 0,
      orderAt: null,
    });
    await this.pointLogRepository.update(
      { orderId, reason: In([PointReason.REVIEW, PointReason.ACTIVITY_REVIEW]) },
      { pointAfter },
    );
    return point + bonus;
  }

  /** 积分流水（最近 N 条），给会员卡页的「积分明细」用 */
  async listLogs(customerId: number, merchantId: number, limit = 20): Promise<PointLogDto[]> {
    const rows = await this.pointLogRepository.find({
      where: { customerId, merchantId },
      order: { id: 'DESC' },
      take: limit,
    });
    return rows.map((row) => {
      const dto = new PointLogDto();
      dto.pointChange = row.pointChange;
      dto.pointAfter = row.pointAfter;
      dto.reason = row.remark ?? row.reason;
      dto.orderNo = null;
      dto.createdAt = row.createdAt;
      return dto;
    });
  }

  /**
   * 成长任务。
   *
   * 两条都必须是**真数据**：累计消费取 member_profiles.totalPaid，
   * 邀请取「被邀请且已绑定手机号」的人数 —— 不校验绑定的话，
   * 自己拿两台设备互扫就能把任务刷满。
   */
  async tasksFor(customerId: number, merchantId: number): Promise<MemberTask[]> {
    const profile = await this.getOrCreate(customerId, merchantId);
    const paidYuan = Math.floor(profile.totalPaid / 100);
    const inviteCount = await this.inviteCount(customerId);

    return [
      {
        key: 'consume',
        label: '累计消费满 200 元',
        current: Math.min(paidYuan, 200),
        target: 200,
        unit: '元',
        done: paidYuan >= 200,
      },
      {
        key: 'invite',
        label: '邀请 1 位好友注册',
        current: Math.min(inviteCount, 1),
        target: 1,
        unit: '位',
        done: inviteCount >= 1,
      },
    ];
  }

  /** 有效邀请人数（被邀请人已绑定手机号） */
  async inviteCount(customerId: number): Promise<number> {
    const rows = await this.customerRepository.find({
      where: { invitedBy: customerId },
      select: { id: true, phone: true },
    });
    return rows.filter((row) => Boolean(row.phone)).length;
  }

  /** 等级阶梯，前端画进度条用 */
  get levels(): typeof MEMBER_LEVELS {
    return MEMBER_LEVELS;
  }

  /** 批量取多个顾客的档案（商户侧顾客列表用，避免 N+1） */
  async profilesFor(
    customerIds: number[],
    merchantId: number,
  ): Promise<Map<number, MemberProfile>> {
    if (customerIds.length === 0) {
      return new Map();
    }
    const rows = await this.profileRepository.find({
      where: { customerId: In(customerIds), merchantId },
    });
    return new Map(rows.map((row) => [row.customerId, row]));
  }

  // ==================== 内部辅助 ====================

  /**
   * 会员档案的原子累加（没有记录就建一条）。
   *
   * 这里**必须用一条 UPSERT 而不是「读出来 + 改字段 + save()」**：
   * 本项目的 BaseEntity 用 `@PrimaryColumn + @Generated('increment')`，
   * 主键由 TypeORM 在插入前算 MAX(id)+1，所以只要跨出事务边界
   * （在事务外用默认仓储 save、事务内再 save 同一个实体），
   * 两次就会算出同一个主键，直接 ER_DUP_ENTRY 把整笔支付回滚掉 ——
   * 这是实测抓到的真缺陷，不是理论风险。
   *
   * 所有可能变负的量都用 `GREATEST(0, …)`：积分可以少扣，不能扣成负数。
   *
   * @returns 累加后的积分余额，用于回填流水快照
   */
  private async upsertDelta(
    em: EntityManager,
    customerId: number,
    merchantId: number,
    delta: {
      point: number;
      growth: number;
      orderCount: number;
      totalPaid: number;
      orderAt: Date | null;
    },
  ): Promise<number> {
    await em.query(
      `INSERT INTO member_profiles
         (customer_id, merchant_id, point, balance, growth, level, order_count, total_paid,
          first_order_at, last_order_at, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         point = GREATEST(0, point + VALUES(point)),
         growth = GREATEST(0, growth + VALUES(growth)),
         order_count = GREATEST(0, order_count + VALUES(order_count)),
         total_paid = GREATEST(0, total_paid + VALUES(total_paid)),
         first_order_at = COALESCE(first_order_at, VALUES(first_order_at)),
         last_order_at = COALESCE(VALUES(last_order_at), last_order_at),
         updated_at = NOW()`,
      [
        customerId,
        merchantId,
        delta.point,
        delta.growth,
        delta.orderCount,
        delta.totalPaid,
        delta.orderAt,
        delta.orderAt,
      ],
    );

    const rows: Array<{ id: number | string; growth: string | number }> = await em.query(
      'SELECT id, growth FROM member_profiles WHERE customer_id = ? AND merchant_id = ? LIMIT 1',
      [customerId, merchantId],
    );
    const profileId = Number(rows[0].id);
    const growth = Number(rows[0].growth);
    await em.query('UPDATE member_profiles SET level = ? WHERE id = ?', [
      resolveMemberLevel(growth).level,
      profileId,
    ]);

    const after: Array<{ point: string | number }> = await em.query(
      'SELECT point FROM member_profiles WHERE id = ? LIMIT 1',
      [profileId],
    );
    return Number(after[0].point);
  }

  /**
   * 写一条流水，冲突即视为「已经做过」。
   *
   * 返回 false 表示这次是重复调用（唯一索引命中），调用方必须跳过资产变更 ——
   * 幂等完全依赖数据库，不依赖「先查一次有没有」。
   */
  /**
   * 发放本单的平台活动加成。
   *
   * @returns 实际入账的加成分；0 表示没有活动、没配加成，或这个人本期已经拿满
   */
  private async grantOrderBonus(
    order: Order,
    customerId: number,
    paid: number,
    em: EntityManager,
  ): Promise<number> {
    /**
     * 先问「这家商户此刻有没有活动」，没有就一次明细都不读 ——
     * 这段跑在支付回调的事务里，不能为了一个多数时候不存在的功能多打一次库。
     */
    const activity = await this.pointActivityService.effectiveFor(order.merchantId);
    if (!activity) {
      return 0;
    }
    const items = await em.getRepository(OrderItem).find({
      where: { orderId: order.id },
      select: { dishId: true, subtotal: true },
    });
    const rule = await this.pointActivityService.bonusRuleForOrder(activity, {
      paidCent: paid,
      diningType: order.diningType,
      items,
    });
    if (!rule || rule.orderBonus <= 0) {
      return 0;
    }
    const bonus = await this.withinCap(rule, customerId, rule.orderBonus, em);
    if (bonus <= 0) {
      return 0;
    }
    const inserted = await this.tryWriteLog(
      {
        customerId,
        merchantId: order.merchantId,
        pointChange: bonus,
        growthChange: 0,
        reason: PointReason.ACTIVITY,
        orderId: order.id,
        activityId: rule.activityId,
        remark: `${rule.activityName}活动加成`,
      },
      em,
    );
    return inserted ? bonus : 0;
  }

  /** 评价的活动加成。与下单加成各占一个 reason，唯一键才不会互相撞 */
  private async grantReviewBonus(
    rule: ActivityBonusRule,
    customerId: number,
    merchantId: number,
    orderId: number,
  ): Promise<number> {
    if (rule.reviewBonus <= 0) {
      return 0;
    }
    /**
     * 读上限与写流水放进同一个事务：评价加成不像下单那样天然带事务，
     * 不自己开一个的话，同一个人在两台设备上同时提交评价就能各拿一份上限。
     */
    return this.dataSource.transaction(async (em) => {
      const bonus = await this.withinCap(rule, customerId, rule.reviewBonus, em);
      if (bonus <= 0) {
        return 0;
      }
      const inserted = await this.tryWriteLog(
        {
          customerId,
          merchantId,
          pointChange: bonus,
          growthChange: 0,
          reason: PointReason.ACTIVITY_REVIEW,
          orderId,
          activityId: rule.activityId,
          remark: `${rule.activityName}评价加成`,
        },
        em,
      );
      return inserted ? bonus : 0;
    });
  }

  /** 退款时把这一单发出去的活动加成按原额扣回 */
  private async revokeOrderBonus(order: Order): Promise<number> {
    const granted = await this.pointLogRepository.findOne({
      where: { orderId: order.id, reason: PointReason.ACTIVITY },
    });
    if (!granted || granted.pointChange <= 0 || granted.activityId === null) {
      return 0;
    }
    const inserted = await this.tryWriteLog({
      customerId: granted.customerId,
      merchantId: granted.merchantId,
      pointChange: -granted.pointChange,
      growthChange: 0,
      reason: PointReason.ACTIVITY_REVOKE,
      orderId: order.id,
      activityId: granted.activityId,
      remark: `订单 ${order.orderNo} 退款，活动加成同步扣回`,
    });
    return inserted ? granted.pointChange : 0;
  }

  /**
   * 每人上限截断。
   *
   * 上限按「同一个人在这一个活动上净拿到多少分」算，跨商户合计 ——
   * 活动是平台配的，限额防的是刷这个人能薅走的总量，按商户各算一遍等于没限。
   */
  private async withinCap(
    rule: ActivityBonusRule,
    customerId: number,
    want: number,
    em: EntityManager,
  ): Promise<number> {
    if (rule.perCustomerCap <= 0) {
      return want;
    }
    // 先锁这个人的账号行，再读已发合计。不锁的话同一顾客的两笔回调会同时读到同一个
    // 起点、各自按上限发一遍（上限 100 就能实发 200）—— 读合计与写流水必须串行。
    await this.lockCustomerForAssets(em, customerId);
    const granted = await this.pointActivityService.grantedForCustomer(rule.activityId, customerId);
    return Math.max(0, Math.min(want, rule.perCustomerCap - granted));
  }

  /**
   * 对 `customers` 那一行加写锁，把同一个顾客的资金类累加串起来。
   *
   * 选账号行而不是会员档案行：账号一定存在（会员档案可能还没建，锁不住不存在的行），
   * 而且它正好是「同一个人」这个粒度的唯一天然键。
   */
  private async lockCustomerForAssets(em: EntityManager, customerId: number): Promise<void> {
    await em
      .createQueryBuilder()
      .select('customer.id', 'id')
      .from(Customer, 'customer')
      .where('customer.id = :customerId', { customerId })
      .setLock('pessimistic_write')
      .getRawMany();
  }

  private async tryWriteLog(
    input: {
      customerId: number;
      merchantId: number;
      pointChange: number;
      growthChange: number;
      reason: PointReason;
      orderId: number;
      remark: string;
      activityId?: number | null;
    },
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(PointLog) : this.pointLogRepository;
    try {
      await repo.save(
        repo.create({ ...input, pointAfter: 0 }),
      );
      return true;
    } catch (error) {
      if (this.isDuplicate(error)) {
        this.logger.debug(`积分流水重复写入已忽略：订单 ${input.orderId} / ${input.reason}`);
        return false;
      }
      throw error;
    }
  }

  private isDuplicate(error: unknown): boolean {
    return (
      (error as { driverError?: { code?: string } })?.driverError?.code === 'ER_DUP_ENTRY' ||
      (error as { code?: string })?.code === 'ER_DUP_ENTRY'
    );
  }
}
