import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import {
  requireMerchantScope,
  resolveMerchantScope,
  resolveStoreScope,
} from '../../common/utils/tenant.util';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { Dish } from '../dish/entities/dish.entity';
import { StoreService } from '../store/store.service';
import { CreateDishCategoryDto } from './dto/create-dish-category.dto';
import { DishCategoryResponseDto } from './dto/dish-category-response.dto';
import { QueryDishCategoryDto } from './dto/query-dish-category.dto';
import { UpdateDishCategoryDto } from './dto/update-dish-category.dto';
import { DishCategory } from './entities/dish-category.entity';

/**
 * 菜品分类服务。
 *
 * 所有读写都必须经过租户范围解析（resolveMerchantScope），
 * 非平台管理员永远只能操作自己商户下的分类。
 *
 * 门店归属（`store_id`）是租户之下的第二层：NULL = 全商户通用，
 * 非 NULL = 该店专属，别的店既查不到也不能引用它建菜。
 */
@Injectable()
export class DishCategoryService {
  constructor(
    @InjectRepository(DishCategory)
    private readonly categoryRepository: Repository<DishCategory>,
    // 直接注入 Dish 仓储用于「分类是否被占用」校验，
    // 避免 DishModule ↔ DishCategoryModule 的循环依赖
    @InjectRepository(Dish)
    private readonly dishRepository: Repository<Dish>,
    private readonly storeService: StoreService,
  ) {}

  /** 分页查询分类 */
  async paginate(
    query: QueryDishCategoryDto,
    currentUser: AuthUser,
  ): Promise<PaginatedDto<DishCategoryResponseDto>> {
    const merchantId = resolveMerchantScope(currentUser, query.merchantId);
    const storeId = resolveStoreScope(currentUser, query.storeId);

    const qb = this.categoryRepository.createQueryBuilder('category');
    if (merchantId !== null) {
      qb.andWhere('category.merchantId = :merchantId', { merchantId });
    }
    if (storeId !== null) {
      qb.andWhere('(category.storeId IS NULL OR category.storeId = :storeId)', { storeId });
    }
    if (query.keyword) {
      qb.andWhere('category.name LIKE :keyword', { keyword: `%${query.keyword}%` });
    }
    if (query.status !== undefined) {
      qb.andWhere('category.status = :status', { status: query.status });
    }

    qb.orderBy('category.sort', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .skip(query.skip)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return PaginatedDto.from({
      list: rows.map((row) => DishCategoryResponseDto.from(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 不分页列表，供前端下拉选择使用（菜单编辑场景） */
  async list(
    currentUser: AuthUser,
    requestedMerchantId?: number,
    requestedStoreId?: number,
  ): Promise<DishCategoryResponseDto[]> {
    const merchantId = resolveMerchantScope(currentUser, requestedMerchantId);
    const storeId = resolveStoreScope(currentUser, requestedStoreId);

    const qb = this.categoryRepository.createQueryBuilder('category');
    if (merchantId !== null) {
      qb.andWhere('category.merchantId = :merchantId', { merchantId });
    }
    if (storeId !== null) {
      qb.andWhere('(category.storeId IS NULL OR category.storeId = :storeId)', { storeId });
    }
    qb.orderBy('category.sort', 'ASC').addOrderBy('category.id', 'ASC');

    const rows = await qb.getMany();
    return rows.map((row) => DishCategoryResponseDto.from(row));
  }

  /** 查询详情 */
  async findOne(id: number, currentUser: AuthUser): Promise<DishCategoryResponseDto> {
    return DishCategoryResponseDto.from(await this.findByIdOrFail(id, currentUser));
  }

  /** 按 ID 查询分类，带租户校验（越权访问返回 404） */
  async findByIdOrFail(id: number, currentUser: AuthUser): Promise<DishCategory> {
    const merchantId = resolveMerchantScope(currentUser);

    const where: FindOptionsWhere<DishCategory> = { id };
    if (merchantId !== null) {
      where.merchantId = merchantId;
    }

    const category = await this.categoryRepository.findOne({ where });
    if (!category) {
      throw BusinessException.notFound(ErrorCode.CATEGORY_NOT_FOUND, '菜品分类不存在');
    }
    return category;
  }

  /** 新增分类 */
  async create(dto: CreateDishCategoryDto, currentUser: AuthUser): Promise<DishCategoryResponseDto> {
    const merchantId = requireMerchantScope(currentUser, dto.merchantId);
    const storeId = await this.resolveOwnedStoreId(dto.storeId, merchantId, currentUser);
    await this.assertNameAvailable(merchantId, dto.name, storeId);

    const entity = this.categoryRepository.create({
      merchantId,
      storeId,
      name: dto.name,
      sort: dto.sort ?? 0,
      status: dto.status ?? CommonStatus.ENABLED,
    });

    return DishCategoryResponseDto.from(await this.categoryRepository.save(entity));
  }

  /** 编辑分类 */
  async update(
    id: number,
    dto: UpdateDishCategoryDto,
    currentUser: AuthUser,
  ): Promise<DishCategoryResponseDto> {
    const category = await this.findByIdOrFail(id, currentUser);

    if (dto.name !== undefined && dto.name !== category.name) {
      await this.assertNameAvailable(category.merchantId, dto.name, category.storeId, id);
      category.name = dto.name;
    }
    if (dto.sort !== undefined) {
      category.sort = dto.sort;
    }
    if (dto.status !== undefined) {
      category.status = dto.status;
    }

    return DishCategoryResponseDto.from(await this.categoryRepository.save(category));
  }

  /** 删除分类（软删除）：分类下仍有菜品时禁止删除 */
  async remove(id: number, currentUser: AuthUser): Promise<void> {
    const category = await this.findByIdOrFail(id, currentUser);

    const dishCount = await this.dishRepository.count({ where: { categoryId: category.id } });
    if (dishCount > 0) {
      throw BusinessException.badRequest(
        ErrorCode.CATEGORY_IN_USE,
        `该分类下还有 ${dishCount} 个菜品，请先移除菜品或调整其分类`,
      );
    }

    await this.categoryRepository.softDelete(id);
  }

  /**
   * 分类名称在同一「归属范围」内唯一：通用分类之间判重，
   * 各店的专属分类之间互不占用（A 店和 B 店都可以有「本店特供」）。
   */
  private async assertNameAvailable(
    merchantId: number,
    name: string,
    storeId: number | null,
    excludeId?: number,
  ): Promise<void> {
    const where: FindOptionsWhere<DishCategory> = { merchantId, name, storeId: storeId ?? IsNull() };
    if (excludeId) {
      where.id = Not(excludeId);
    }
    const existed = await this.categoryRepository.findOne({ where });
    if (existed) {
      throw BusinessException.conflict(ErrorCode.CATEGORY_NAME_EXISTS, '该商户下分类名称已存在');
    }
  }

  /**
   * 校验店专属归属可用并归一化：不传 = 通用（NULL）。
   *
   * 走 `StoreService.findByIdOrFail` 而不是自己查门店，是为了复用它的
   * 租户 + 门店范围解析 —— 商户管理员不能把分类挂到别家商户的门店上。
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
}
