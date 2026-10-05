import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import {
  requireMerchantScope,
  resolveMerchantScope,
  resolveStoreScope,
} from '../../common/utils/tenant.util';
import { isStoreBoundRole } from '../../shared/constants/role-scope';
import { DishStatus } from '../../shared/enums/dish-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { DishCategoryService } from '../dish-category/dish-category.service';
import { SpecGroupResponseDto } from '../spec-group/dto/spec-group-response.dto';
import { SpecGroupService } from '../spec-group/spec-group.service';
import { StoreService } from '../store/store.service';
import { StoreDishService } from '../store-dish/store-dish.service';
import { CreateDishDto } from './dto/create-dish.dto';
import { DishResponseDto } from './dto/dish-response.dto';
import { QueryDishDto } from './dto/query-dish.dto';
import { UpdateDishDto } from './dto/update-dish.dto';
import { DishSpecGroup } from './entities/dish-spec-group.entity';
import { Dish } from './entities/dish.entity';

/**
 * 菜品服务。
 *
 * 所有读写都必须经过租户范围解析（resolveMerchantScope）；
 * 分类归属与规格组归属都会做二次校验，杜绝跨租户引用。
 *
 * 门店维度有两层，不要混：
 * - `dish.storeId`（店专属）：这道菜只属于某家店，别的店查不到也下不了单；
 * - `store_dishes`（本店例外）：通用菜在某一家的停售 / 沽清 / 门店价。
 * 门店绑定角色（店长 / 收银员）的写操作一律只落到例外上，**不允许改商户标准菜单**。
 */
@Injectable()
export class DishService {
  constructor(
    @InjectRepository(Dish)
    private readonly dishRepository: Repository<Dish>,
    @InjectRepository(DishSpecGroup)
    private readonly dishSpecGroupRepository: Repository<DishSpecGroup>,
    private readonly dataSource: DataSource,
    private readonly dishCategoryService: DishCategoryService,
    private readonly specGroupService: SpecGroupService,
    private readonly storeService: StoreService,
    private readonly storeDishService: StoreDishService,
  ) {}

  /** 分页查询菜品（含关联规格组与本店有效值） */
  async paginate(
    query: QueryDishDto,
    currentUser: AuthUser,
  ): Promise<PaginatedDto<DishResponseDto>> {
    const merchantId = resolveMerchantScope(currentUser, query.merchantId);
    const storeId = resolveStoreScope(currentUser, query.storeId);

    const qb = this.dishRepository.createQueryBuilder('dish');
    if (merchantId !== null) {
      qb.andWhere('dish.merchantId = :merchantId', { merchantId });
    }
    // 选定门店（或门店绑定角色）时只看「通用 + 本店专属」；
    // 不选门店是商户层视角，店专属菜也要能在这里被管理，故只按归属标记不过滤
    if (storeId !== null) {
      qb.andWhere('(dish.storeId IS NULL OR dish.storeId = :storeId)', { storeId });
    }
    if (query.categoryId !== undefined) {
      qb.andWhere('dish.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.keyword) {
      qb.andWhere('dish.name LIKE :keyword', { keyword: `%${query.keyword}%` });
    }
    if (query.status !== undefined) {
      qb.andWhere('dish.status = :status', { status: query.status });
    }
    if (query.isRecommend !== undefined) {
      qb.andWhere('dish.isRecommend = :isRecommend', { isRecommend: query.isRecommend });
    }

    qb.orderBy('dish.sort', 'ASC')
      .addOrderBy('dish.id', 'DESC')
      .skip(query.skip)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();

    return PaginatedDto.from({
      list: await this.toResponseList(rows, storeId),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 查询详情（含关联规格组与本店有效值） */
  async findOne(
    id: number,
    currentUser: AuthUser,
    requestedStoreId?: number,
  ): Promise<DishResponseDto> {
    const dish = await this.findByIdOrFail(id, currentUser);
    const [dto] = await this.toResponseList(
      [dish],
      resolveStoreScope(currentUser, requestedStoreId),
    );
    return dto;
  }

  /** 按 ID 查询菜品，带租户与门店可见性校验（越权访问返回 404） */
  async findByIdOrFail(id: number, currentUser: AuthUser): Promise<Dish> {
    const merchantId = resolveMerchantScope(currentUser);
    const scopedStoreId = resolveStoreScope(currentUser);

    const where: FindOptionsWhere<Dish> = { id };
    if (merchantId !== null) {
      where.merchantId = merchantId;
    }

    const dish = await this.dishRepository.findOne({ where });
    if (!dish) {
      throw BusinessException.notFound(ErrorCode.DISH_NOT_FOUND, '菜品不存在');
    }
    // 店专属菜被别家店的账号访问时同样按「不存在」处理，不泄露它的存在
    if (scopedStoreId !== null && dish.storeId !== null && dish.storeId !== scopedStoreId) {
      throw BusinessException.notFound(ErrorCode.DISH_NOT_FOUND, '菜品不存在');
    }
    return dish;
  }

  /** 新增菜品 */
  async create(dto: CreateDishDto, currentUser: AuthUser): Promise<DishResponseDto> {
    const merchantId = requireMerchantScope(currentUser, dto.merchantId);
    const storeId = await this.resolveOwnedStoreId(dto.storeId, merchantId, currentUser);
    await this.assertCategoryUsable(dto.categoryId, merchantId, storeId, currentUser);
    await this.assertNameAvailable(merchantId, dto.name, storeId);

    // 先完成全部校验再落库：否则「菜品已写入、规格组关联校验失败」会留下脏数据
    const specGroupIds = [...new Set(dto.specGroupIds ?? [])];
    await this.specGroupService.resolveGroupsForMerchant(specGroupIds, merchantId);

    const dishId = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Dish);
      const dish = await repository.save(
        repository.create({
          merchantId,
          storeId,
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description ?? null,
          imageUrl: dto.imageUrl ?? null,
          price: dto.price,
          memberPrice: dto.memberPrice ?? null,
          unit: dto.unit ?? '份',
          sort: dto.sort ?? 0,
          status: dto.status ?? DishStatus.ON_SHELF,
          isRecommend: dto.isRecommend ?? false,
          soldCount: 0,
        }),
      );

      await this.syncSpecGroups(manager, dish.id, specGroupIds);
      return dish.id;
    });

    return this.findOne(dishId, currentUser);
  }

  /**
   * 编辑商户标准菜单。
   *
   * 门店绑定角色**不能**走这里：改名字、改价、换分类都会一次性影响全商户所有门店，
   * 他们能做的只有本店停售 / 沽清 / 门店价，即 `updateStatus` 写例外。
   */
  async update(id: number, dto: UpdateDishDto, currentUser: AuthUser): Promise<DishResponseDto> {
    if (isStoreBoundRole(currentUser.role)) {
      throw BusinessException.forbidden('门店账号不能修改商户标准菜单，请改用本店的上架 / 沽清');
    }

    const dish = await this.findByIdOrFail(id, currentUser);

    if (dto.categoryId !== undefined && dto.categoryId !== dish.categoryId) {
      await this.assertCategoryUsable(dto.categoryId, dish.merchantId, dish.storeId, currentUser);
    }
    if (dto.name !== undefined && dto.name !== dish.name) {
      await this.assertNameAvailable(dish.merchantId, dto.name, dish.storeId, id);
    }

    // 同样先校验规格组归属，再进入写入
    const specGroupIds =
      dto.specGroupIds !== undefined ? [...new Set(dto.specGroupIds)] : undefined;
    if (specGroupIds !== undefined) {
      await this.specGroupService.resolveGroupsForMerchant(specGroupIds, dish.merchantId);
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.categoryId !== undefined) {
        dish.categoryId = dto.categoryId;
      }
      if (dto.name !== undefined) {
        dish.name = dto.name;
      }
      if (dto.description !== undefined) {
        dish.description = dto.description;
      }
      if (dto.imageUrl !== undefined) {
        dish.imageUrl = dto.imageUrl;
      }
      if (dto.price !== undefined) {
        dish.price = dto.price;
      }
      if (dto.memberPrice !== undefined) {
        dish.memberPrice = dto.memberPrice;
      }
      if (dto.unit !== undefined) {
        dish.unit = dto.unit;
      }
      if (dto.sort !== undefined) {
        dish.sort = dto.sort;
      }
      if (dto.status !== undefined) {
        dish.status = dto.status;
      }
      if (dto.isRecommend !== undefined) {
        dish.isRecommend = dto.isRecommend;
      }
      await manager.getRepository(Dish).save(dish);

      if (specGroupIds !== undefined) {
        await this.syncSpecGroups(manager, dish.id, specGroupIds);
      }
    });

    return this.findOne(id, currentUser);
  }

  /**
   * 上下架。
   *
   * 同一个动作在两层上是两回事：
   * - 商户层（商户管理员 / 平台）改 `dishes.status`，全商户所有门店一起生效；
   * - 门店绑定角色只写本店例外 `store_dishes.sale_status`，**不动标准菜单**。
   * 没有这条分支，店长下架一道菜就会把别的店的同一道菜一起摘掉。
   */
  async updateStatus(
    id: number,
    status: DishStatus,
    currentUser: AuthUser,
  ): Promise<DishResponseDto> {
    const dish = await this.findByIdOrFail(id, currentUser);
    const storeId = resolveStoreScope(currentUser);

    if (storeId !== null) {
      await this.storeDishService.upsert(storeId, dish.id, { saleStatus: status });
      return this.findOne(id, currentUser);
    }

    dish.status = status;
    await this.dishRepository.save(dish);
    return this.findOne(id, currentUser);
  }

  /**
   * 删除菜品（软删除），同时解除与规格组的关联。
   *
   * TODO: 接入订单模块后，需校验该菜品是否被历史订单引用（引用中应改为下架而非删除）。
   */
  async remove(id: number, currentUser: AuthUser): Promise<void> {
    await this.findByIdOrFail(id, currentUser);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(DishSpecGroup).delete({ dishId: id });
      await manager.getRepository(Dish).softDelete(id);
    });
  }

  // ==================== 内部辅助 ====================

  /** 组装出参：补齐规格组，并在选定门店时合并本店例外得到门店有效值 */
  private async toResponseList(
    dishes: Dish[],
    storeId: number | null,
  ): Promise<DishResponseDto[]> {
    if (dishes.length === 0) {
      return [];
    }

    const groupsByDish = await this.loadSpecGroupsByDish(dishes);
    const overrides =
      storeId === null
        ? null
        : await this.storeDishService.loadOverrides(
            storeId,
            dishes.map((dish) => dish.id),
          );

    return dishes.map((dish) =>
      DishResponseDto.from(
        dish,
        groupsByDish.get(dish.id) ?? [],
        overrides
          ? this.storeDishService.resolveEffective(dish, overrides.get(dish.id))
          : undefined,
        overrides?.get(dish.id) ?? null,
      ),
    );
  }

  /** 批量补齐菜品的关联规格组，按菜品 ID 分组 */
  private async loadSpecGroupsByDish(dishes: Dish[]): Promise<Map<number, SpecGroupResponseDto[]>> {
    const links = await this.dishSpecGroupRepository.find({
      where: { dishId: In(dishes.map((dish) => dish.id)) },
    });
    const groupDtoById = new Map<number, SpecGroupResponseDto>();
    for (const dto of await this.specGroupService.findGroupsWithOptions(
      links.map((link) => link.specGroupId),
    )) {
      groupDtoById.set(dto.id, dto);
    }

    const groupsByDish = new Map<number, SpecGroupResponseDto[]>();
    for (const link of links) {
      const dto = groupDtoById.get(link.specGroupId);
      if (!dto) {
        continue;
      }
      const list = groupsByDish.get(link.dishId) ?? [];
      list.push(dto);
      groupsByDish.set(link.dishId, list);
    }
    return groupsByDish;
  }

  /** 在给定事务内整体覆盖菜品的规格组关联（调用方需先校验规格组归属） */
  private async syncSpecGroups(
    manager: EntityManager,
    dishId: number,
    specGroupIds: number[],
  ): Promise<void> {
    const repository = manager.getRepository(DishSpecGroup);
    const existing = await repository.find({ where: { dishId } });
    const existingIds = new Set(existing.map((link) => link.specGroupId));
    const targetIds = new Set(specGroupIds);

    const removedRowIds = existing
      .filter((link) => !targetIds.has(link.specGroupId))
      .map((link) => link.id);
    if (removedRowIds.length > 0) {
      await repository.delete(removedRowIds);
    }

    const addedGroupIds = specGroupIds.filter((specGroupId) => !existingIds.has(specGroupId));
    if (addedGroupIds.length > 0) {
      await repository.save(
        addedGroupIds.map((specGroupId) => repository.create({ dishId, specGroupId })),
      );
    }
  }

  /**
   * 校验分类存在、属于该商户，且对菜品的归属门店可见。
   *
   * 最后一条不能省：把通用菜挂进 A 店专属分类，B 店就会看到一道
   * 点不开也归不了类的菜。
   */
  private async assertCategoryUsable(
    categoryId: number,
    merchantId: number,
    storeId: number | null,
    currentUser: AuthUser,
  ): Promise<void> {
    const category = await this.dishCategoryService.findByIdOrFail(categoryId, currentUser);
    if (category.merchantId !== merchantId) {
      throw BusinessException.badRequest(
        ErrorCode.DISH_CATEGORY_MISMATCH,
        '所选分类不属于当前商户',
      );
    }
    if (storeId !== null && category.storeId !== null && category.storeId !== storeId) {
      throw BusinessException.badRequest(
        ErrorCode.DISH_CATEGORY_MISMATCH,
        '所选分类是其他门店的专属分类',
      );
    }
  }

  /**
   * 校验店专属归属可用并归一化：不传 = 通用（NULL）。
   * 走 StoreService 复用它的租户 + 门店范围解析，商户管理员伪造 storeId 会被判 404。
   */
  private async resolveOwnedStoreId(
    requestedStoreId: number | undefined,
    merchantId: number,
    currentUser: AuthUser,
  ): Promise<number | null> {
    if (requestedStoreId === undefined) {
      return null;
    }
    const store = await this.storeService.findByIdOrFail(requestedStoreId, currentUser);
    if (store.merchantId !== merchantId) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, '所选门店不属于当前商户');
    }
    return store.id;
  }

  /**
   * 菜品名称在同一「归属范围」内唯一：通用菜之间判重，
   * 各店的专属菜互不占用（A 店和 B 店都可以有「本店特供」）。
   */
  private async assertNameAvailable(
    merchantId: number,
    name: string,
    storeId: number | null,
    excludeId?: number,
  ): Promise<void> {
    const where: FindOptionsWhere<Dish> = { merchantId, name, storeId: storeId ?? IsNull() };
    if (excludeId) {
      where.id = Not(excludeId);
    }
    const existed = await this.dishRepository.findOne({ where });
    if (existed) {
      throw BusinessException.conflict(ErrorCode.DISH_NAME_EXISTS, '该商户下已存在同名菜品');
    }
  }
}
