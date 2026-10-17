import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { REVIEW_POINT } from '../../shared/enums/customer.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import {
  PointActivityRuleType,
  PointActivityScope,
} from '../../shared/enums/point-activity.enum';
import { Merchant } from '../merchant/entities/merchant.entity';
import { PointLog } from '../customer/entities/point-log.entity';
import { DishCategory } from '../dish-category/entities/dish-category.entity';
import { Dish } from '../dish/entities/dish.entity';
import { Store } from '../store/entities/store.entity';
import { MerchantService } from '../merchant/merchant.service';
import { CreatePointActivityDto } from './dto/create-point-activity.dto';
import { PointActivityResponseDto } from './dto/point-activity-response.dto';
import { QueryPointActivityDto } from './dto/query-point-activity.dto';
import { UpdatePointActivityDto } from './dto/update-point-activity.dto';
import {
  PointActivity,
  PointActivityConditions,
  PointActivityRules,
} from './entities/point-activity.entity';

/** 小程序活动条：只给事实文案，顾客拿多少分一律在服务端算 */
export interface PublicPointActivityBanner {
  id: number;
  name: string;
  ruleType: PointActivityRuleType;
  ruleTypeLabel: string;
  title: string;
  description: string | null;
  endTime: Date;
}

/** 发分时要用的规则快照（避免 MemberService 去猜 JSON 的形状） */
export interface ActivityBonusRule {
  activityId: number;
  activityName: string;
  /** 下单加成：本单额外送多少分 */
  orderBonus: number;
  /** 评价加成：一条评价额外送多少分 */
  reviewBonus: number;
  /** 每人本期加成上限（分），0 表示不限 */
  perCustomerCap: number;
}

/**
 * 算加成要的这一单的事实。
 *
 * `items` 只带判定用的两个字段：菜品 ID 来自订单快照（改价改名都不影响历史单判定），
 * `subtotal` 是该行小计（含规格增量）。分类归属只能查菜品现值 —— 快照里没有分类列，
 * 这一点界面与注释都要写明：**菜品后来换了分类，会影响之后新单的判定**。
 */
export interface OrderBonusInput {
  paidCent: number;
  diningType: number;
  items: { dishId: number; subtotal: number }[];
}

/** 满额返的合理性上限：送的分不得超过基础分的 3 倍 */
const THRESHOLD_BONUS_MAX_RATIO = 3;

/**
 * 积分营销活动服务。
 *
 * 三条硬口径：
 * 1. **只有平台能写**。控制器上 `@Roles(PLATFORM_ADMIN)` 硬锁，权限点也不进
 *    可授权白名单 —— 它决定的是全体顾客拿多少分。
 * 2. **同一时刻一家商户头上最多一个生效活动**。启用时校验时间窗 × 商户范围是否重叠，
 *    重叠直接 409。两条规则怎么叠加永远解释不清，而解释不清的补贴会被顾客拿去对账。
 * 3. **读侧现算，不缓存结果**。活动行本身很小，`status + 时间窗 + 范围` 三个条件
 *    都在这一处判定；MemberService 只拿结果，不自己写第二套判定。
 */
@Injectable()
export class PointActivityService {
  private readonly logger = new Logger(PointActivityService.name);

  constructor(
    @InjectRepository(PointActivity)
    private readonly activityRepository: Repository<PointActivity>,
    @InjectRepository(PointLog)
    private readonly pointLogRepository: Repository<PointLog>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(Dish)
    private readonly dishRepository: Repository<Dish>,
    @InjectRepository(DishCategory)
    private readonly categoryRepository: Repository<DishCategory>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly merchantService: MerchantService,
  ) {}

  // ==================== 平台端治理 ====================

  /** 列表：带发放统计与商户名，一条 GROUP BY 拿全，不按行查库 */
  async paginate(query: QueryPointActivityDto): Promise<PaginatedDto<PointActivityResponseDto>> {
    const builder = this.activityRepository.createQueryBuilder('activity');

    if (query.keyword) {
      builder.andWhere('activity.name LIKE :keyword', { keyword: `%${query.keyword}%` });
    }
    if (query.status !== undefined) {
      builder.andWhere('activity.status = :status', { status: query.status });
    }
    if (query.ruleType) {
      builder.andWhere('activity.ruleType = :ruleType', { ruleType: query.ruleType });
    }
    if (query.merchantId !== undefined) {
      builder.andWhere(
        `(activity.scopeType = :allScope OR (activity.scopeType = :includeScope AND JSON_CONTAINS(activity.merchantIds, JSON_ARRAY(:merchantId)))` +
          ` OR (activity.scopeType = :excludeScope AND NOT JSON_CONTAINS(activity.merchantIds, JSON_ARRAY(:merchantId))))`,
        {
          allScope: PointActivityScope.ALL,
          includeScope: PointActivityScope.INCLUDE,
          excludeScope: PointActivityScope.EXCLUDE,
          merchantId: query.merchantId,
        },
      );
    }

    const [rows, total] = await builder
      .orderBy('activity.startTime', 'DESC')
      .addOrderBy('activity.id', 'DESC')
      .skip(query.skip)
      .take(query.pageSize)
      .getManyAndCount();

    return PaginatedDto.from({
      list: await this.decorate(rows),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async findOne(id: number): Promise<PointActivityResponseDto> {
    const [dto] = await this.decorate([await this.findByIdOrFail(id)]);
    return dto;
  }

  /** 新建。刻意**默认停用**：设规则与开活动是两步，存到一半就开闸发分是事故 */
  async create(dto: CreatePointActivityDto, currentUser: AuthUser): Promise<PointActivityResponseDto> {
    const rules = this.buildRules(dto.ruleType, dto);
    const scope = this.normalizeScope(dto.scopeType ?? PointActivityScope.ALL, dto.merchantIds ?? []);
    const window = this.normalizeWindow(dto.startTime, dto.endTime);
    const conditions = this.normalizeConditions(dto);
    await this.assertConditionsInScope(conditions, scope.scopeType, scope.merchantIds);

    const saved = await this.activityRepository.save(
      this.activityRepository.create({
        name: dto.name.trim(),
        ruleType: dto.ruleType,
        rules,
        conditions,
        startTime: window.startTime,
        endTime: window.endTime,
        status: CommonStatus.DISABLED,
        scopeType: scope.scopeType,
        merchantIds: scope.merchantIds,
        perCustomerCap: dto.perCustomerCap ?? 0,
        bannerTitle: dto.bannerTitle?.trim() || null,
        bannerDesc: dto.bannerDesc?.trim() || null,
        createdBy: currentUser.userId,
      }),
    );
    const [dto2] = await this.decorate([saved]);
    return dto2;
  }

  /**
   * 编辑资料与规则。
   *
   * 换规则类型时**不继承旧参数**：倍率活动改成满额返，把上一次的百分比留在 JSON 里
   * 只会让下一次换回来时悄悄复活一个没人填过的值。
   */
  async update(id: number, dto: UpdatePointActivityDto): Promise<PointActivityResponseDto> {
    const activity = await this.findByIdOrFail(id);
    const ruleType = dto.ruleType ?? activity.ruleType;
    const typeChanged = ruleType !== activity.ruleType;

    const provided: Partial<CreatePointActivityDto> = {
      ruleType,
      orderBonusPercent: dto.orderBonusPercent,
      reviewBonusPercent: dto.reviewBonusPercent,
      thresholdCent: dto.thresholdCent,
      bonusPoint: dto.bonusPoint,
    };
    const merged = typeChanged
      ? provided
      : {
          ruleType,
          orderBonusPercent: dto.orderBonusPercent ?? activity.rules.orderBonusPercent,
          reviewBonusPercent: dto.reviewBonusPercent ?? activity.rules.reviewBonusPercent,
          thresholdCent: dto.thresholdCent ?? activity.rules.thresholdCent,
          bonusPoint: dto.bonusPoint ?? activity.rules.bonusPoint,
        };

    if (dto.name !== undefined) {
      activity.name = dto.name.trim();
    }
    activity.ruleType = ruleType;
    activity.rules = this.buildRules(ruleType, merged);

    if (dto.startTime !== undefined || dto.endTime !== undefined) {
      const window = this.normalizeWindow(
        dto.startTime ?? activity.startTime.toISOString(),
        dto.endTime ?? activity.endTime.toISOString(),
      );
      activity.startTime = window.startTime;
      activity.endTime = window.endTime;
    }
    if (dto.scopeType !== undefined || dto.merchantIds !== undefined) {
      const scope = this.normalizeScope(
        dto.scopeType ?? activity.scopeType,
        dto.merchantIds ?? activity.merchantIds,
      );
      activity.scopeType = scope.scopeType;
      activity.merchantIds = scope.merchantIds;
    }
    if (dto.perCustomerCap !== undefined) {
      activity.perCustomerCap = dto.perCustomerCap;
    }
    /**
     * 命中条件：**显式传空数组就是取消这一项限制**，不传表示保持原样。
     * 用「传没传」而不是「是不是空」来判，否则改文案会把条件顺手清空。
     */
    if (
      dto.dishIds !== undefined ||
      dto.categoryIds !== undefined ||
      dto.diningTypes !== undefined
    ) {
      activity.conditions = this.normalizeConditions({
        dishIds: dto.dishIds ?? activity.conditions?.dishIds,
        categoryIds: dto.categoryIds ?? activity.conditions?.categoryIds,
        diningTypes: dto.diningTypes ?? activity.conditions?.diningTypes,
      });
    }
    if (dto.bannerTitle !== undefined) {
      activity.bannerTitle = dto.bannerTitle.trim() || null;
    }
    if (dto.bannerDesc !== undefined) {
      activity.bannerDesc = dto.bannerDesc.trim() || null;
    }

    // 范围与条件都要落到具体商户上：先校验条件可用，再校验时间窗不重叠
    await this.assertConditionsInScope(activity.conditions, activity.scopeType, activity.merchantIds);
    if (activity.status === CommonStatus.ENABLED) {
      await this.assertNoOverlap(activity);
    }
    const [dto2] = await this.decorate([await this.activityRepository.save(activity)]);
    return dto2;
  }

  /**
   * 启停。独立接口（与门店 `PATCH /stores/:id/status` 同一口径）：
   * 否则「改个文案顺手把停掉的活动打开」会变成一个没人留意的动作。
   */
  async changeStatus(id: number, status: CommonStatus): Promise<PointActivityResponseDto> {
    const activity = await this.findByIdOrFail(id);
    if (activity.status === status) {
      // 幂等：状态未变不改归属，也不报错
      const [dto] = await this.decorate([activity]);
      return dto;
    }

    if (status === CommonStatus.ENABLED) {
      if (activity.endTime <= new Date()) {
        throw BusinessException.badRequest(
          ErrorCode.POINT_ACTIVITY_RULE_INVALID,
          `活动已于 ${activity.endTime.toISOString()} 结束，已结束的活动不能启用；要延长请改结束时间`,
        );
      }
      activity.status = status;
      await this.assertNoOverlap(activity);
    } else {
      activity.status = status;
    }

    const [dto] = await this.decorate([await this.activityRepository.save(activity)]);
    return dto;
  }

  /**
   * 删除（软删）。已经发过分的活动删不掉。
   *
   * 与「有历史订单的门店删不掉」同一条理由：历史流水要能指回活动名，
   * 删掉之后顾客问「这 30 分是哪个活动给的」就没有人能回答了。
   */
  async remove(id: number): Promise<void> {
    const activity = await this.findByIdOrFail(id);
    const granted = await this.pointLogRepository.exists({
      where: { activityId: activity.id },
    });
    if (granted) {
      throw BusinessException.conflict(
        ErrorCode.POINT_ACTIVITY_IN_USE,
        `「${activity.name}」已经发放过积分，不能删除。要停止发分请点停用`,
      );
    }
    await this.activityRepository.softDelete(activity.id);
  }

  // ==================== 读侧（发分 / 商户 / 小程序） ====================

  /**
   * 某商户此刻生效的活动。
   *
   * 返回 null 表示没有活动 —— 调用方（MemberService）此时按基础口径发分。
   * 理论上最多一条（启用时已卡重叠），真查出多条只取开始时间最早的那条并告警，
   * 因为「谁盖过谁」再发明一层仲裁规则不值得。
   */
  async effectiveFor(merchantId: number, now = new Date()): Promise<PointActivity | null> {
    const rows = await this.activityRepository.find({
      where: { status: CommonStatus.ENABLED },
      order: { startTime: 'ASC', id: 'ASC' },
    });
    const matched = rows.filter(
      (activity) => activity.startTime <= now && activity.endTime > now && this.covers(activity, merchantId),
    );
    if (matched.length > 1) {
      this.logger.warn(
        `商户 ${merchantId} 同时命中 ${matched.length} 个积分活动（${matched
          .map((item) => item.id)
          .join('/')}），按开始时间取 ${matched[0].id}`,
      );
    }
    return matched[0] ?? null;
  }

  /**
   * 这一单能额外拿多少分。
   *
   * 这是**唯一**把规则与条件翻译成数字的地方，MemberService 不再解释 JSON。
   * 活动由调用方用 `effectiveFor` 先解析好再传进来：发分在支付回调的热路径上，
   * 「先查有没有活动，没有就一次明细都不读」比让这里再查一遍更省，也好测。
   *
   * 两条会被顾客追问的口径都在这里定死：
   * - 配了参与菜品 / 分类时，倍率**只作用在命中行上**。否则「1 杯活动奶茶 + 3 道别的菜」
   *   等于让商家为没参加活动的菜付补贴。
   * - 命中行金额按**小计占比分摊实付**。用券抵掉的那部分钱没进商户账，
   *   按原价发分等于让大额券再翻一倍。
   */
  async bonusRuleForOrder(
    activity: PointActivity | null,
    input: OrderBonusInput,
  ): Promise<ActivityBonusRule | null> {
    if (!activity || !this.diningMatches(activity, input.diningType)) {
      return null;
    }
    const hitPaidCent = await this.hitPaidCent(activity, input);
    if (hitPaidCent === null) {
      return null;
    }

    const hitYuan = Math.floor(hitPaidCent / 100);
    let orderBonus = 0;
    let reviewBonus = 0;

    if (activity.ruleType === PointActivityRuleType.MULTIPLIER) {
      /**
       * 下单加成按命中行的分摊实付算，评价加成按固定的评价基础分（5 分）算。
       *
       * 评价是「对这单服务的评价」而不是对某个菜的评价，所以菜品 / 分类条件**不约束它**，
       * 只受就餐方式约束（外卖单的评价不该吃到「仅限堂食」的补贴）。
       */
      orderBonus = Math.floor((hitYuan * (activity.rules.orderBonusPercent ?? 0)) / 100);
      reviewBonus = Math.floor((REVIEW_POINT * (activity.rules.reviewBonusPercent ?? 0)) / 100);
    } else if (
      activity.ruleType === PointActivityRuleType.THRESHOLD_BONUS &&
      hitPaidCent >= (activity.rules.thresholdCent ?? Number.MAX_SAFE_INTEGER)
    ) {
      orderBonus = activity.rules.bonusPoint ?? 0;
    }

    if (orderBonus <= 0 && reviewBonus <= 0) {
      return null;
    }
    return this.toBonusRule(activity, orderBonus, reviewBonus);
  }

  /** 这条评价能额外拿多少分（不受菜品条件约束，只受就餐方式约束） */
  async bonusRuleForReview(
    activity: PointActivity | null,
    diningType: number,
  ): Promise<ActivityBonusRule | null> {
    if (!activity || !this.diningMatches(activity, diningType)) {
      return null;
    }
    const reviewBonus = Math.floor(
      (REVIEW_POINT * (activity.rules.reviewBonusPercent ?? 0)) / 100,
    );
    if (reviewBonus <= 0) {
      return null;
    }
    return this.toBonusRule(activity, 0, reviewBonus);
  }

  /** 该顾客在本活动已拿到的加成合计（分），用于每人上限截断 */
  async grantedForCustomer(activityId: number, customerId: number): Promise<number> {
    const rows = await this.pointLogRepository
      .createQueryBuilder('log')
      .select('COALESCE(SUM(log.pointChange), 0)', 'granted')
      .where('log.activityId = :activityId', { activityId })
      .andWhere('log.customerId = :customerId', { customerId })
      .getRawOne<{ granted: string }>();
    return Number(rows?.granted ?? 0);
  }

  /** 商户侧只读：本店参与中的活动（按 Token 的商户现算，读不到别家的配置） */
  async listEffectiveForMerchant(merchantId: number): Promise<PointActivityResponseDto[]> {
    const activity = await this.effectiveFor(merchantId);
    return activity ? this.decorate([activity]) : [];
  }

  /** 小程序活动条（匿名）。门店不可用时一律 404，与公开菜单同一口径 */
  async publicBanner(storeId: number): Promise<PublicPointActivityBanner | null> {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store || store.status !== CommonStatus.ENABLED) {
      throw BusinessException.notFound(ErrorCode.STORE_NOT_FOUND, '门店不存在或已停止营业');
    }
    await this.merchantService.assertUsableForRequest(store.merchantId);

    const activity = await this.effectiveFor(store.merchantId);
    if (!activity || !activity.bannerTitle) {
      return null;
    }
    return {
      id: activity.id,
      name: activity.name,
      ruleType: activity.ruleType,
      ruleTypeLabel:
        activity.ruleType === PointActivityRuleType.MULTIPLIER ? '积分倍率' : '满额返分',
      title: activity.bannerTitle,
      description: activity.bannerDesc,
      endTime: activity.endTime,
    };
  }

  // ==================== 内部辅助 ====================

  private toBonusRule(
    activity: PointActivity,
    orderBonus: number,
    reviewBonus: number,
  ): ActivityBonusRule {
    return {
      activityId: activity.id,
      activityName: activity.name,
      orderBonus,
      reviewBonus,
      perCustomerCap: activity.perCustomerCap,
    };
  }

  /** 就餐方式条件：独立维度，不匹配就整单不发 */
  private diningMatches(activity: PointActivity, diningType: number): boolean {
    const list = activity.conditions?.diningTypes ?? [];
    return list.length === 0 || list.map(Number).includes(Number(diningType));
  }

  /**
   * 命中行分摊后的实付（分）。返回 null 表示这一单没有任何命中行。
   *
   * 分摊而不是直接用命中行原价：`paidCent` 是扣掉券之后的钱，
   * 命中行小计之和可能远大于实付，按原价发分等于让大额券再翻一倍。
   */
  private async hitPaidCent(
    activity: PointActivity,
    input: OrderBonusInput,
  ): Promise<number | null> {
    const total = input.items.reduce((sum, item) => sum + item.subtotal, 0);
    if (total <= 0) {
      return 0;
    }

    const dishIds = new Set((activity.conditions?.dishIds ?? []).map(Number));
    const categoryIds = new Set((activity.conditions?.categoryIds ?? []).map(Number));
    if (dishIds.size === 0 && categoryIds.size === 0) {
      return input.paidCent;
    }

    /**
     * 只有真配了分类条件才去查菜品分类 —— 倍率判定的热路径在支付回调里，
     * 不能为了一个大概率没配的功能多打一次库。
     */
    const categoryByDish =
      categoryIds.size > 0 ? await this.categoryIdsOf(input.items.map((item) => item.dishId)) : null;

    const isHit = (item: { dishId: number }): boolean => {
      if (dishIds.has(Number(item.dishId))) {
        return true;
      }
      if (categoryIds.size === 0 || !categoryByDish) {
        return false;
      }
      return categoryIds.has(categoryByDish.get(Number(item.dishId)) ?? -1);
    };

    const hitSubtotal = input.items
      .filter(isHit)
      .reduce((sum, item) => sum + item.subtotal, 0);
    if (hitSubtotal <= 0) {
      return null;
    }
    return Math.floor((input.paidCent * hitSubtotal) / total);
  }

  /** 菜品 ID → 当前所属分类 ID。菜品已删除时查不到，视为不命中（少发不误发） */
  private async categoryIdsOf(dishIds: number[]): Promise<Map<number, number>> {
    const ids = [...new Set(dishIds.map(Number).filter((id) => id > 0))];
    if (ids.length === 0) {
      return new Map();
    }
    const dishes = await this.dishRepository.find({
      where: { id: In(ids) },
      select: { id: true, categoryId: true },
    });
    return new Map(dishes.map((dish) => [Number(dish.id), Number(dish.categoryId)]));
  }

  /** 归一化命中条件：去重、剔 0，三项都空时回 null（等价于不限，别再存一个空壳） */
  private normalizeConditions(input: {
    dishIds?: number[];
    categoryIds?: number[];
    diningTypes?: number[];
  }): PointActivityConditions | null {
    const clean = (list?: number[]) =>
      [...new Set((list ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    const dishIds = clean(input.dishIds);
    const categoryIds = clean(input.categoryIds);
    const diningTypes = clean(input.diningTypes);
    if (dishIds.length === 0 && categoryIds.length === 0 && diningTypes.length === 0) {
      return null;
    }
    return { dishIds, categoryIds, diningTypes };
  }

  /**
   * 条件里的菜品 / 分类必须落在活动覆盖的商户里。
   *
   * 没有这道校验，运营可以把「商户 2 的招牌菜」挂到一个只对商户 1 生效的活动上，
   * 保存成功、启用成功，然后一分发不出去 —— 这种「配了但碰不到」的错最难查，
   * 因为它在界面上看起来完全正常。
   */
  private async assertConditionsInScope(
    conditions: PointActivityConditions | null,
    scopeType: PointActivityScope,
    merchantIds: number[],
  ): Promise<void> {
    if (!conditions || scopeType === PointActivityScope.ALL) {
      return;
    }
    const allowed = new Set(merchantIds.map(Number));
    const dishIds = conditions.dishIds ?? [];
    const categoryIds = conditions.categoryIds ?? [];
    if (dishIds.length === 0 && categoryIds.length === 0) {
      return;
    }

    const problems: string[] = [];
    if (dishIds.length > 0) {
      const dishes = await this.dishRepository.find({
        where: { id: In(dishIds) },
        select: { id: true, name: true, merchantId: true },
      });
      const found = new Set(dishes.map((dish) => Number(dish.id)));
      for (const dish of dishes) {
        if (!this.inScope(scopeType, allowed, Number(dish.merchantId))) {
          problems.push(`菜品「${dish.name}」不属于本活动覆盖的商户`);
        }
      }
      for (const id of dishIds) {
        if (!found.has(Number(id))) {
          problems.push(`菜品 #${id} 不存在或已被删除`);
        }
      }
    }
    if (categoryIds.length > 0) {
      const categories = await this.categoryRepository.find({
        where: { id: In(categoryIds) },
        select: { id: true, name: true, merchantId: true },
      });
      const found = new Set(categories.map((item) => Number(item.id)));
      for (const item of categories) {
        if (!this.inScope(scopeType, allowed, Number(item.merchantId))) {
          problems.push(`分类「${item.name}」不属于本活动覆盖的商户`);
        }
      }
      for (const id of categoryIds) {
        if (!found.has(Number(id))) {
          problems.push(`分类 #${id} 不存在或已被删除`);
        }
      }
    }
    if (problems.length > 0) {
      throw BusinessException.badRequest(
        ErrorCode.POINT_ACTIVITY_RULE_INVALID,
        [...new Set(problems)].join('；'),
      );
    }
  }

  /** include 要命中、exclude 要不在排除名单里 */
  private inScope(
    scopeType: PointActivityScope,
    allowed: Set<number>,
    merchantId: number,
  ): boolean {
    return scopeType === PointActivityScope.INCLUDE
      ? allowed.has(merchantId)
      : !allowed.has(merchantId);
  }

  /** 按类型组装并校验规则参数 */
  private buildRules(
    ruleType: PointActivityRuleType,
    input: Partial<CreatePointActivityDto>,
  ): PointActivityRules {
    if (ruleType === PointActivityRuleType.MULTIPLIER) {
      const orderBonusPercent = input.orderBonusPercent ?? 0;
      const reviewBonusPercent = input.reviewBonusPercent ?? 0;
      if (orderBonusPercent <= 0 && reviewBonusPercent <= 0) {
        throw BusinessException.badRequest(
          ErrorCode.POINT_ACTIVITY_RULE_INVALID,
          '倍率活动至少要填一项加成，两个百分比都是 0 等于没有活动',
        );
      }
      return { orderBonusPercent, reviewBonusPercent };
    }

    const thresholdCent = input.thresholdCent ?? 0;
    const bonusPoint = input.bonusPoint ?? 0;
    if (thresholdCent < 100 || bonusPoint < 1) {
      throw BusinessException.badRequest(
        ErrorCode.POINT_ACTIVITY_RULE_INVALID,
        '满额返要同时填「满多少元」（至少 1 元）与「送多少分」（至少 1 分）',
      );
    }
    /**
     * 送的分不能超过这一单按基础口径本会送的分数的 3 倍。
     * 没有这道闸，「满 1 元送 2000 分」能保存成功，
     * 而平台印出去的每一分将来都可能被拿去换真东西。
     */
    const ceiling = Math.floor(thresholdCent / 100) * THRESHOLD_BONUS_MAX_RATIO;
    if (bonusPoint > ceiling) {
      throw BusinessException.badRequest(
        ErrorCode.POINT_ACTIVITY_RULE_INVALID,
        `满 ${Math.floor(thresholdCent / 100)} 元最多送 ${ceiling} 分（基础分的 ${THRESHOLD_BONUS_MAX_RATIO} 倍），当前填了 ${bonusPoint} 分`,
      );
    }
    return { thresholdCent, bonusPoint };
  }

  private normalizeWindow(
    startTime: string,
    endTime: string,
  ): { startTime: Date; endTime: Date } {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, '起止时间不是合法的时间');
    }
    if (end <= start) {
      throw BusinessException.badRequest(
        ErrorCode.POINT_ACTIVITY_RULE_INVALID,
        '结束时间必须晚于开始时间，否则这个活动永远不会生效',
      );
    }
    return { startTime: start, endTime: end };
  }

  private normalizeScope(
    scopeType: PointActivityScope,
    merchantIds: number[],
  ): { scopeType: PointActivityScope; merchantIds: number[] } {
    const ids = [...new Set(merchantIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (scopeType === PointActivityScope.ALL) {
      return { scopeType, merchantIds: [] };
    }
    if (ids.length === 0) {
      throw BusinessException.badRequest(
        ErrorCode.POINT_ACTIVITY_RULE_INVALID,
        scopeType === PointActivityScope.INCLUDE
          ? '选了「仅指定商户」必须至少勾一家，否则这个活动谁都碰不到'
          : '选了「排除指定商户」必须至少勾一家；要全平台生效请选「全部商户」',
      );
    }
    return { scopeType, merchantIds: ids };
  }

  /** 活动是否压在这家商户头上 */
  private covers(activity: PointActivity, merchantId: number): boolean {
    const listed = (activity.merchantIds ?? []).map(Number).includes(merchantId);
    switch (activity.scopeType) {
      case PointActivityScope.INCLUDE:
        return listed;
      case PointActivityScope.EXCLUDE:
        return !listed;
      default:
        return true;
    }
  }

  /**
   * 重叠校验：启用中的活动，时间窗相交且商户范围有交集就拒。
   *
   * 商户集合必须落到具体 ID 才能比：`all` 与 `exclude` 都表示一个隐式全集，
   * 只比 merchantIds 数组会把「全部商户」和「仅勾了 1 家」判成不相交。
   */
  private async assertNoOverlap(activity: PointActivity): Promise<void> {
    const [others, universe] = await Promise.all([
      this.activityRepository.find({ where: { status: CommonStatus.ENABLED } }),
      this.liveMerchantIds(),
    ]);
    const mine = this.merchantSet(activity, universe);
    if (mine.length === 0) {
      return;
    }
    const mineSet = new Set(mine);

    const hit = others.find(
      (other) =>
        Number(other.id) !== Number(activity.id) &&
        other.startTime < activity.endTime &&
        activity.startTime < other.endTime &&
        this.merchantSet(other, universe).some((id) => mineSet.has(id)),
    );
    if (hit) {
      throw BusinessException.conflict(
        ErrorCode.POINT_ACTIVITY_OVERLAP,
        `与已启用的活动「${hit.name}」（${hit.startTime.toISOString()} ~ ${hit.endTime.toISOString()}）在商户范围上重叠。` +
          `同一时间一家商户只能有一个积分活动，请先停用其中一个，或把范围分开`,
      );
    }
  }

  /** 当前存在的商户 ID（未软删），作为 all / exclude 的全集 */
  private async liveMerchantIds(): Promise<number[]> {
    const rows = await this.merchantRepository.find({ select: { id: true } });
    return rows.map((row) => Number(row.id));
  }

  private merchantSet(activity: PointActivity, universe: number[]): number[] {
    const listed = new Set((activity.merchantIds ?? []).map(Number));
    if (activity.scopeType === PointActivityScope.INCLUDE) {
      return [...listed];
    }
    if (activity.scopeType === PointActivityScope.EXCLUDE) {
      return universe.filter((id) => !listed.has(id));
    }
    return universe;
  }

  private async decorate(rows: PointActivity[]): Promise<PointActivityResponseDto[]> {
    if (rows.length === 0) {
      return [];
    }
    const stats = await this.statsByActivityIds(rows.map((row) => row.id));
    const nameById = await this.merchantNameMap(rows);
    const dishNames = await this.labelMap(this.dishRepository, rows, 'dishIds');
    const categoryNames = await this.labelMap(this.categoryRepository, rows, 'categoryIds');

    return rows.map((row) => {
      const dto = PointActivityResponseDto.from(row);
      dto.merchantNames = (row.merchantIds ?? []).map(
        (id) => nameById.get(Number(id)) ?? `#${id}`,
      );
      // 名称回显是给表单与列表用的：编辑时不把整库菜品再拉一遍当候选项
      dto.dishNames = (row.conditions?.dishIds ?? []).map(
        (id) => dishNames.get(Number(id)) ?? `#${id}`,
      );
      dto.categoryNames = (row.conditions?.categoryIds ?? []).map(
        (id) => categoryNames.get(Number(id)) ?? `#${id}`,
      );
      const item = stats.get(row.id);
      dto.grantedPoint = item?.grantedPoint ?? 0;
      dto.grantedCustomers = item?.grantedCustomers ?? 0;
      return dto;
    });
  }

  /** 把所有行引用的 ID 合成一次 IN 查询，取回「ID → 名称」 */
  private async labelMap(
    repository: Repository<{ id: number; name: string }>,
    rows: PointActivity[],
    key: 'dishIds' | 'categoryIds',
  ): Promise<Map<number, string>> {
    const ids = [
      ...new Set(rows.flatMap((row) => (row.conditions?.[key] ?? []).map(Number))),
    ];
    if (ids.length === 0) {
      return new Map();
    }
    const found = await repository.find({ where: { id: In(ids) }, select: { id: true, name: true } });
    return new Map(found.map((item) => [Number(item.id), item.name]));
  }

  /** 商户名一次查回，供列表显示 include / exclude 到底勾了谁 */
  private async merchantNameMap(rows: PointActivity[]): Promise<Map<number, string>> {
    const ids = [...new Set(rows.flatMap((row) => (row.merchantIds ?? []).map(Number)))];
    if (ids.length === 0) {
      return new Map();
    }
    const merchants = await this.merchantRepository.find({
      where: { id: In(ids) },
      select: { id: true, name: true },
    });
    return new Map(merchants.map((item) => [Number(item.id), item.name]));
  }

  /** 一条 GROUP BY 拿回每个活动的净发分与参与人数 */
  private async statsByActivityIds(
    ids: number[],
  ): Promise<Map<number, { grantedPoint: number; grantedCustomers: number }>> {
    const rows = await this.pointLogRepository
      .createQueryBuilder('log')
      .select('log.activityId', 'activityId')
      .addSelect('COALESCE(SUM(log.pointChange), 0)', 'grantedPoint')
      .addSelect('COUNT(DISTINCT log.customerId)', 'grantedCustomers')
      .where('log.activityId IN (:...ids)', { ids })
      .groupBy('log.activityId')
      .getRawMany<{ activityId: string; grantedPoint: string; grantedCustomers: string }>();

    return new Map(
      rows.map((row) => [
        Number(row.activityId),
        {
          // 退款回冲是负数，SUM 之后就是净发放额 —— 界面上写「已发（含扣回）」
          grantedPoint: Number(row.grantedPoint ?? 0),
          grantedCustomers: Number(row.grantedCustomers ?? 0),
        },
      ]),
    );
  }

  private async findByIdOrFail(id: number): Promise<PointActivity> {
    const activity = await this.activityRepository.findOne({ where: { id } });
    if (!activity) {
      throw BusinessException.notFound(ErrorCode.POINT_ACTIVITY_NOT_FOUND, '积分活动不存在');
    }
    return activity;
  }
}
