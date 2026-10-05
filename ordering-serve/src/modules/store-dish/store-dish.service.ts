import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { isStoreBoundRole } from '../../shared/constants/role-scope';
import { DishStatus } from '../../shared/enums/dish-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { BusinessException } from '../../common/exceptions/business.exception';
import { Dish } from '../dish/entities/dish.entity';
import { StoreService } from '../store/store.service';
import { UpsertStoreDishDto } from './dto/upsert-store-dish.dto';
import { StoreDishResponseDto } from './dto/store-dish-response.dto';
import { StoreDish } from './entities/store-dish.entity';

/** 合并门店例外所需的标准菜品字段 */
export type StandardDishFields = Pick<Dish, 'status' | 'price' | 'memberPrice'>;

/** 门店有效菜单：标准值与本店例外合并后的结果，菜单展示与下单都以此为准 */
export interface EffectiveDish {
  onSale: boolean;
  /** 门店售价（分） */
  price: number;
  memberPrice: number | null;
  /** 沽清：临时状态，与「停售」区分 */
  soldOut: boolean;
  /** 本店是否存在例外记录（前端据此标「本店例外」） */
  overridden: boolean;
}

/** 写例外的入参：只给要改的字段，未给的保持原例外值 */
export interface StoreDishPatch {
  saleStatus?: DishStatus;
  price?: number | null;
  memberPrice?: number | null;
  soldOut?: boolean;
}

/**
 * 门店菜单的「继承 + 例外」解析。
 *
 * 读侧（`loadOverrides` / `resolveEffective`）刻意不依赖 `AuthUser`：
 * C 端下单没有 Token，租户与门店来自 `storeId`，与 OrderModule 直接注入
 * 菜单仓储是同一个理由。写侧（`upsertForUser` / `resetForUser`）才做范围校验。
 */
@Injectable()
export class StoreDishService {
  constructor(
    @InjectRepository(StoreDish)
    private readonly storeDishRepository: Repository<StoreDish>,
    // 只注入 Dish 实体仓储做归属校验，不引 DishModule（它会反向依赖本模块）
    @InjectRepository(Dish)
    private readonly dishRepository: Repository<Dish>,
    private readonly storeService: StoreService,
  ) {}

  /** 一次取回本店对这些菜品的例外（无记录即继承），避免逐条查询 */
  async loadOverrides(storeId: number, dishIds: number[]): Promise<Map<number, StoreDish>> {
    if (dishIds.length === 0) {
      return new Map();
    }
    const rows = await this.storeDishRepository.find({
      where: { storeId, dishId: In(dishIds) },
    });
    return new Map(rows.map((row) => [row.dishId, row]));
  }

  /**
   * 把例外合并到标准菜品上。**全项目只有这一处做这个计算**，
   * 列表、收银台与下单三处必须共用，否则会出现「列表说在售、下单说停售」。
   *
   * 优先级是单向收紧的：商户把菜全局下架时，门店例外不能把它救活；
   * 门店只能在自己这一层停售、沽清与改价。
   */
  resolveEffective(dish: StandardDishFields, override?: StoreDish): EffectiveDish {
    const storeAllowsSale = (override?.saleStatus ?? DishStatus.ON_SHELF) === DishStatus.ON_SHELF;
    const soldOut = override?.soldOut ?? false;

    return {
      onSale: dish.status === DishStatus.ON_SHELF && storeAllowsSale && !soldOut,
      price: override?.price ?? dish.price,
      memberPrice: override?.memberPrice ?? dish.memberPrice,
      soldOut,
      overridden: Boolean(override),
    };
  }

  /**
   * 写本店例外（存在即更新）。
   *
   * 合并后若每条都回到默认值，就直接删掉这行：例外表里不留全默认记录，
   * 「这家店卖哪些菜」才可推理，也顺带给了「恢复继承」的落点。
   */
  async upsert(storeId: number, dishId: number, patch: StoreDishPatch): Promise<StoreDish | null> {
    const existing = await this.storeDishRepository.findOne({ where: { storeId, dishId } });
    const merged = this.storeDishRepository.merge(
      existing ?? this.storeDishRepository.create({ storeId, dishId }),
      patch,
    );

    if (this.equalsStandard(merged)) {
      if (existing) {
        await this.storeDishRepository.delete({ storeId, dishId });
      }
      return null;
    }

    return this.storeDishRepository.save(merged);
  }

  /**
   * 写本店例外（带范围与字段权限校验）。
   * 返回 null 表示例外已回到默认值、该行被删 —— 即恢复跟随标准菜单。
   */
  async upsertForUser(
    storeId: number,
    dishId: number,
    dto: UpsertStoreDishDto,
    currentUser: AuthUser,
  ): Promise<StoreDishResponseDto | null> {
    const { dish, store } = await this.assertScoped(storeId, dishId, currentUser);
    this.assertPriceWritable(dto, currentUser);

    // 逐字段挑掉 undefined：整体传给 merge 会把没提交的例外字段误清空
    const patch: StoreDishPatch = {};
    if (dto.saleStatus !== undefined) patch.saleStatus = dto.saleStatus;
    if (dto.price !== undefined) patch.price = dto.price;
    if (dto.memberPrice !== undefined) patch.memberPrice = dto.memberPrice;
    if (dto.soldOut !== undefined) patch.soldOut = dto.soldOut;

    const row = await this.upsert(store.id, dish.id, patch);
    return row ? StoreDishResponseDto.from(row) : null;
  }

  /** 删除本店例外 = 恢复跟随标准菜单 */
  async resetForUser(storeId: number, dishId: number, currentUser: AuthUser): Promise<void> {
    const { dish, store } = await this.assertScoped(storeId, dishId, currentUser);
    await this.storeDishRepository.delete({ storeId: store.id, dishId: dish.id });
  }

  /**
   * 校验当前账号能否对该 (门店, 菜品) 设例外。
   *
   * 门店走 `StoreService.findByIdOrFail` 复用租户 + 门店范围解析（店长只能命中本店）；
   * 菜品必须属于该门店的商户，且不能是别家店的专属菜 —— 后一条按 404 处理，
   * 不泄露「别家店有这道菜」。
   */
  private async assertScoped(
    storeId: number,
    dishId: number,
    currentUser: AuthUser,
  ): Promise<{ store: { id: number; merchantId: number }; dish: Dish }> {
    const store = await this.storeService.findByIdOrFail(storeId, currentUser);
    const dish = await this.dishRepository.findOne({
      where: { id: dishId, merchantId: store.merchantId },
    });
    if (!dish) {
      throw BusinessException.notFound(ErrorCode.DISH_NOT_FOUND, '菜品不存在');
    }
    if (dish.storeId !== null && dish.storeId !== store.id) {
      throw BusinessException.notFound(ErrorCode.DISH_NOT_FOUND, '菜品不存在');
    }
    return { store, dish };
  }

  /**
   * 门店价与会员价是资金口径，只归商户管理员与平台；
   * 门店绑定角色能做的只有停售与沽清 —— 放开改价会让各店价格各自为政。
   */
  private assertPriceWritable(dto: UpsertStoreDishDto, currentUser: AuthUser): void {
    if (!isStoreBoundRole(currentUser.role)) {
      return;
    }
    if (dto.price !== undefined || dto.memberPrice !== undefined) {
      throw BusinessException.forbidden('门店价由商户管理员设置，门店账号只能停售与沽清');
    }
  }

  /** 是否已等价于「完全继承标准菜单」 */
  private equalsStandard(row: StoreDish): boolean {
    return (
      row.saleStatus === DishStatus.ON_SHELF &&
      row.price === null &&
      row.memberPrice === null &&
      !row.soldOut
    );
  }
}
