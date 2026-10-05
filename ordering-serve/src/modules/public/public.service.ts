import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { OrderStatus } from '../../shared/enums/order-status.enum';
import { DishSpecGroup } from '../dish/entities/dish-spec-group.entity';
import { Dish } from '../dish/entities/dish.entity';
import { DishCategory } from '../dish-category/entities/dish-category.entity';
import { SpecOption } from '../spec-group/entities/spec-option.entity';
import { SpecGroup } from '../spec-group/entities/spec-group.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Order } from '../order/entities/order.entity';
import { Store } from '../store/entities/store.entity';
import { MerchantService } from '../merchant/merchant.service';
import { StoreDishService } from '../store-dish/store-dish.service';
import { CancelPublicOrderDto } from './dto/cancel-public-order.dto';
import {
  PublicMenuDishDto,
  PublicMenuResponseDto,
  PublicSpecGroupDto,
  PublicSpecOptionDto,
} from './dto/public-menu-response.dto';
import { PublicOrderResponseDto } from './dto/public-order-response.dto';
import { PublicStoreResponseDto } from './dto/public-store-response.dto';

/**
 * C 端公开读服务。
 *
 * 与后台读接口的根本区别：**没有 AuthUser**，租户与门店完全由路径上的 storeId 决定，
 * 所以每个入口都必须先过 `loadServedStore` 这道闸（门店存在且启用、商户可用）。
 * 菜单的有效价与在售状态复用 `StoreDishService.resolveEffective`，
 * 与商户后台、收银台、下单四处同一套口径。
 */
@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Store) private readonly storeRepository: Repository<Store>,
    @InjectRepository(DishCategory)
    private readonly categoryRepository: Repository<DishCategory>,
    @InjectRepository(Dish) private readonly dishRepository: Repository<Dish>,
    @InjectRepository(DishSpecGroup)
    private readonly dishSpecGroupRepository: Repository<DishSpecGroup>,
    @InjectRepository(SpecGroup) private readonly specGroupRepository: Repository<SpecGroup>,
    @InjectRepository(SpecOption) private readonly specOptionRepository: Repository<SpecOption>,
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepository: Repository<OrderItem>,
    private readonly storeDishService: StoreDishService,
    private readonly merchantService: MerchantService,
  ) {}

  /** 门店公开信息 */
  async findStore(storeId: number): Promise<PublicStoreResponseDto> {
    return PublicStoreResponseDto.from(await this.loadServedStore(storeId));
  }

  /** 本店完整菜单：分类 → 在售菜品 → 规格组 */
  async findMenu(storeId: number): Promise<PublicMenuResponseDto> {
    const store = await this.loadServedStore(storeId);

    const [categories, dishes] = await Promise.all([
      this.categoryRepository.find({
        where: { merchantId: store.merchantId, status: CommonStatus.ENABLED },
        order: { sort: 'ASC', id: 'ASC' },
      }),
      this.dishRepository.find({ where: { merchantId: store.merchantId } }),
    ]);

    // 店专属内容只对归属店可见；通用内容全店可见
    const visibleCategories = categories.filter(
      (category) => category.storeId === null || category.storeId === store.id,
    );
    const visibleDishes = dishes.filter(
      (dish) => dish.storeId === null || dish.storeId === store.id,
    );

    const overrides = await this.storeDishService.loadOverrides(
      store.id,
      visibleDishes.map((dish) => dish.id),
    );
    // 停售与下架的菜不进菜单；**沽清的菜保留并带 soldOut 标记** ——
    // 顾客要能区分「这家店没这道菜」和「今天卖完了」，与收银台同一口径
    const onSaleDishes = visibleDishes
      .map((dish) => ({
        dish,
        effective: this.storeDishService.resolveEffective(dish, overrides.get(dish.id)),
      }))
      .filter((entry) => entry.effective.onSale || entry.effective.soldOut);

    const specGroupsByDish = await this.loadSpecGroups(
      onSaleDishes.map((entry) => entry.dish.id),
      store.merchantId,
    );

    const dishesByCategory = new Map<number, PublicMenuDishDto[]>();
    for (const { dish, effective } of onSaleDishes) {
      const list = dishesByCategory.get(dish.categoryId) ?? [];
      list.push({
        id: dish.id,
        name: dish.name,
        description: dish.description,
        imageUrl: dish.imageUrl,
        price: effective.price,
        unit: dish.unit,
        sort: dish.sort,
        isRecommend: dish.isRecommend,
        soldOut: effective.soldOut,
        specGroups: specGroupsByDish.get(dish.id) ?? [],
      });
      dishesByCategory.set(dish.categoryId, list);
    }

    return {
      store: PublicStoreResponseDto.from(store),
      categories: visibleCategories
        .filter((category) => (dishesByCategory.get(category.id)?.length ?? 0) > 0)
        .map((category) => ({
          id: category.id,
          name: category.name,
          sort: category.sort,
          dishes: dishesByCategory.get(category.id) ?? [],
        })),
    };
  }

  /**
   * 凭「订单号 + 下单时返回的 payToken」查单。
   *
   * 单号不对与票据不对**返回同一个错误**：否则这里会变成订单号枚举入口。
   */
  async findByOrderNo(orderNo: string, payToken: string): Promise<PublicOrderResponseDto> {
    const order = await this.loadByToken(orderNo, payToken);
    return this.toPublicOrder(order);
  }

  /**
   * 顾客自行取消**待支付**订单。
   *
   * 只允许 PENDING_PAYMENT：已支付的单涉及资金，必须由商户侧走取消 + 退款
   * （那边的入口有权限与审计），不能让匿名接口把钱退出去。
   *
   * 状态用条件更新而不是「读出来改完再存」：项目没有乐观锁，
   * 而这里恰好有一个真竞态 —— 顾客点取消的同时支付回调正在把单置为已支付。
   * 条件更新让两者抢同一行，谁后写谁失败，不会出现「已收款却被取消」。
   */
  async cancelByOrderNo(
    orderNo: string,
    dto: CancelPublicOrderDto,
  ): Promise<PublicOrderResponseDto> {
    const order = await this.loadByToken(orderNo, dto.token);

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw BusinessException.badRequest(
        ErrorCode.ORDER_STATUS_INVALID,
        '只有待支付的订单可以取消，如需退款请联系门店',
      );
    }

    const reason = dto.reason?.trim() || '顾客自行取消';
    const updated = await this.orderRepository.update(
      { id: order.id, status: OrderStatus.PENDING_PAYMENT },
      { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
    );
    if (!updated.affected) {
      throw BusinessException.badRequest(
        ErrorCode.ORDER_STATUS_INVALID,
        '订单状态已变化，请刷新后重试',
      );
    }

    return this.toPublicOrder(await this.orderRepository.findOneByOrFail({ id: order.id }));
  }

  // ==================== 内部辅助 ====================

  /** 双因子取单：单号超长、单号不存在、票据不匹配都回同一个 404 */
  private async loadByToken(orderNo: string, payToken: string): Promise<Order> {
    // 单号是定长业务号，超长的输入直接判不存在：省得让唯一索引去消化随手贴来的字符串
    const order =
      orderNo.length > 32
        ? null
        : await this.orderRepository.findOne({ where: { orderNo } });
    if (!order || !order.payToken || order.payToken !== payToken) {
      throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, '订单不存在或查询凭据不正确');
    }
    return order;
  }

  /** 组装 C 端订单出参（带门店名） */
  private async toPublicOrder(order: Order): Promise<PublicOrderResponseDto> {
    const [items, store] = await Promise.all([
      this.orderItemRepository.find({ where: { orderId: order.id }, order: { id: 'ASC' } }),
      this.storeRepository.findOne({ where: { id: order.storeId } }),
    ]);

    return PublicOrderResponseDto.from(order, items, store?.name ?? '');
  }

  // ==================== 内部辅助 ====================

  /**
   * 门店是否接待顾客：门店存在且启用、所属商户可用。
   *
   * 三种情况一律按「不存在或已停止营业」回 404 —— 对匿名调用方没必要区分
   * 「这家店不存在」和「这家店被平台停了」，那是可枚举出来的治理信息。
   */
  private async loadServedStore(storeId: number): Promise<Store> {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store || store.status !== CommonStatus.ENABLED) {
      throw BusinessException.notFound(ErrorCode.STORE_NOT_FOUND, '门店不存在或已停止营业');
    }

    try {
      await this.merchantService.assertUsableForRequest(store.merchantId);
    } catch {
      throw BusinessException.notFound(ErrorCode.STORE_NOT_FOUND, '门店不存在或已停止营业');
    }

    return store;
  }

  /**
   * 批量取菜品的规格组与规格项。
   *
   * 口径与收银台、下单一致：**停用的规格组不生效，组内全停用也不生效**，
   * 否则会出现「小程序逼顾客选一个后端根本不接受的规格」。
   */
  private async loadSpecGroups(
    dishIds: number[],
    merchantId: number,
  ): Promise<Map<number, PublicSpecGroupDto[]>> {
    const empty = new Map<number, PublicSpecGroupDto[]>();
    if (dishIds.length === 0) {
      return empty;
    }

    const links = await this.dishSpecGroupRepository.find({ where: { dishId: In(dishIds) } });
    const groupIds = [...new Set(links.map((link) => link.specGroupId))];
    if (groupIds.length === 0) {
      return empty;
    }

    const [groups, options] = await Promise.all([
      this.specGroupRepository.find({
        where: { id: In(groupIds), merchantId, status: CommonStatus.ENABLED },
      }),
      this.specOptionRepository.find({
        where: { groupId: In(groupIds), merchantId, status: CommonStatus.ENABLED },
        order: { sort: 'ASC', id: 'ASC' },
      }),
    ]);

    const usableGroupIds = new Set(groups.map((group) => group.id));
    const optionsByGroup = new Map<number, PublicSpecOptionDto[]>();
    for (const option of options) {
      if (!usableGroupIds.has(option.groupId)) {
        continue;
      }
      const list = optionsByGroup.get(option.groupId) ?? [];
      list.push(this.toSpecOptionDto(option));
      optionsByGroup.set(option.groupId, list);
    }

    const groupById = new Map(groups.map((group) => [group.id, group]));
    const result = new Map<number, PublicSpecGroupDto[]>();
    for (const link of links) {
      const group = groupById.get(link.specGroupId);
      const groupOptions = optionsByGroup.get(link.specGroupId) ?? [];
      if (!group || groupOptions.length === 0) {
        continue;
      }
      const list = result.get(link.dishId) ?? [];
      list.push({
        id: group.id,
        name: group.name,
        type: group.type,
        isRequired: group.isRequired,
        options: groupOptions,
      });
      result.set(link.dishId, list);
    }

    for (const [, specGroups] of result) {
      specGroups.sort((a, b) => (groupById.get(a.id)?.sort ?? 0) - (groupById.get(b.id)?.sort ?? 0));
    }
    return result;
  }

  private toSpecOptionDto(option: SpecOption): PublicSpecOptionDto {
    return { id: option.id, name: option.name, priceDiff: option.priceDiff };
  }
}
