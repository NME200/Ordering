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

    const pointAfter = await this.upsertDelta(
      em,
      order.customerId,
      order.merchantId,
      {
        point: gain,
        growth,
        orderCount: 1,
        totalPaid: paid,
        orderAt: order.paidAt ?? new Date(),
      },
    );
    await em
      .getRepository(PointLog)
      .update({ orderId: order.id, reason: PointReason.ORDER }, { pointAfter });
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

    const pointAfter = await this.upsertDelta(
      this.dataSource.manager,
      order.customerId,
      order.merchantId,
      { point: -loss, growth: -yuan * GROWTH_PER_YUAN, orderCount: -1, totalPaid: -paid, orderAt: null },
    );
    await this.pointLogRepository.update(
      { orderId: order.id, reason: PointReason.REFUND },
      { pointAfter },
    );
  }

  /** 评价赠分。同一订单只可能有一条评价（reviews.orderId 唯一），所以天然幂等 */
  async awardReviewPoint(
    customerId: number,
    merchantId: number,
    orderId: number,
    point: number,
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
    const pointAfter = await this.upsertDelta(this.dataSource.manager, customerId, merchantId, {
      point,
      growth: 0,
      orderCount: 0,
      totalPaid: 0,
      orderAt: null,
    });
    await this.pointLogRepository.update(
      { orderId, reason: PointReason.REVIEW },
      { pointAfter },
    );
    return point;
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
  private async tryWriteLog(
    input: {
      customerId: number;
      merchantId: number;
      pointChange: number;
      growthChange: number;
      reason: PointReason;
      orderId: number;
      remark: string;
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
