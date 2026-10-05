import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Not, Repository } from 'typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import {
  requireMerchantScope,
  resolveMerchantScope,
  resolveStoreScope,
} from '../../common/utils/tenant.util';
import { isPlatformRole } from '../../shared/constants/role-scope';
import { AccountBanSource } from '../../shared/enums/account-ban-source.enum';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { CreateStoreDto } from './dto/create-store.dto';
import { QueryStoreDto } from './dto/query-store.dto';
import { StoreResponseDto } from './dto/store-response.dto';
import { UpdateStoreStatusDto } from './dto/update-store-status.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from './entities/store.entity';
import { Order } from '../order/entities/order.entity';

/**
 * 门店服务。
 *
 * 所有读写都必须经过范围解析：
 * - 租户范围（resolveMerchantScope）：非平台管理员永远只能操作自己商户下的门店；
 * - 门店范围（resolveStoreScope）：门店绑定角色（门店管理员 / 收银员）只能引用本店，
 *   否则店长就能把自己店的员工商调到同商户的其他门店。
 */
@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  /** 分页查询门店 */
  async paginate(query: QueryStoreDto, currentUser: AuthUser): Promise<PaginatedDto<StoreResponseDto>> {
    const merchantId = resolveMerchantScope(currentUser, query.merchantId);
    const scopedStoreId = resolveStoreScope(currentUser);

    const qb = this.storeRepository.createQueryBuilder('store');
    if (merchantId !== null) {
      qb.andWhere('store.merchantId = :merchantId', { merchantId });
    }
    if (scopedStoreId !== null) {
      qb.andWhere('store.id = :scopedStoreId', { scopedStoreId });
    }
    if (query.keyword) {
      qb.andWhere('store.name LIKE :keyword', { keyword: `%${query.keyword}%` });
    }
    if (query.status !== undefined) {
      qb.andWhere('store.status = :status', { status: query.status });
    }

    qb.orderBy('store.id', 'DESC').skip(query.skip).take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return PaginatedDto.from({
      list: rows.map((row) => StoreResponseDto.from(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 查询门店详情（越权访问其他租户 / 其他门店的门店会得到 404） */
  async findOne(id: number, currentUser: AuthUser): Promise<StoreResponseDto> {
    return StoreResponseDto.from(await this.findByIdOrFail(id, currentUser));
  }

  /** 按 ID 查询门店，带租户与门店范围校验 */
  async findByIdOrFail(id: number, currentUser: AuthUser): Promise<Store> {
    const merchantId = resolveMerchantScope(currentUser);
    const scopedStoreId = resolveStoreScope(currentUser);

    // 门店绑定角色只能引用本人门店；这里判 404 而不是 403，避免泄露「别家店存在」
    if (scopedStoreId !== null && scopedStoreId !== id) {
      throw BusinessException.notFound(ErrorCode.STORE_NOT_FOUND, '门店不存在');
    }

    const where: FindOptionsWhere<Store> = { id };
    if (merchantId !== null) {
      where.merchantId = merchantId;
    }

    const store = await this.storeRepository.findOne({ where });
    if (!store) {
      throw BusinessException.notFound(ErrorCode.STORE_NOT_FOUND, '门店不存在');
    }
    return store;
  }

  /** 新增门店 */
  async create(dto: CreateStoreDto, currentUser: AuthUser): Promise<StoreResponseDto> {
    const merchantId = requireMerchantScope(currentUser, dto.merchantId);
    await this.assertNameAvailable(merchantId, dto.name);

    const entity = this.storeRepository.create({
      merchantId,
      name: dto.name,
      code: dto.code ?? null,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      businessStatus: dto.businessStatus ?? undefined,
      status: CommonStatus.ENABLED,
    });

    return StoreResponseDto.from(await this.storeRepository.save(entity));
  }

  /** 编辑门店资料（不含启停，见 changeStatus） */
  async update(id: number, dto: UpdateStoreDto, currentUser: AuthUser): Promise<StoreResponseDto> {
    const store = await this.findByIdOrFail(id, currentUser);

    if (dto.name !== undefined && dto.name !== store.name) {
      await this.assertNameAvailable(store.merchantId, dto.name, id);
      store.name = dto.name;
    }
    if (dto.code !== undefined) {
      store.code = dto.code;
    }
    if (dto.address !== undefined) {
      store.address = dto.address;
    }
    if (dto.phone !== undefined) {
      store.phone = dto.phone;
    }
    if (dto.businessStatus !== undefined) {
      store.businessStatus = dto.businessStatus;
    }

    return StoreResponseDto.from(await this.storeRepository.save(store));
  }

  /**
   * 禁用 / 恢复门店，并落定**停用归属**。
   *
   * 规则与账号封禁一致（CODEBUDDY 8.2.2）：**封禁是单向的，不是「谁封的谁解」**。
   * - 平台停用的店，商户解不开 —— 平台停的是这家店的收款与履约资格，
   *   商户一拨开关就放回去等于治理失效；
   * - 商户自己停用的店，商户和平台都能恢复 —— 平台是上级，要能纠正商家的误停。
   *
   * 门店一旦被禁用，C 端下单与收银台代客开单都会被 `resolveOpenStore` /
   * `resolvePosStore` 拒掉，所以这里不需要再额外下架什么。
   */
  async changeStatus(
    id: number,
    dto: UpdateStoreStatusDto,
    currentUser: AuthUser,
  ): Promise<StoreResponseDto> {
    const store = await this.findByIdOrFail(id, currentUser);

    if (dto.status === store.status) {
      // 幂等：状态没变就不碰归属，否则重复提交会把平台停的店改记成商户停的
      return StoreResponseDto.from(store);
    }

    const side = isPlatformRole(currentUser.role)
      ? AccountBanSource.PLATFORM
      : AccountBanSource.MERCHANT;

    if (
      side === AccountBanSource.MERCHANT &&
      store.bannedBy === AccountBanSource.PLATFORM &&
      dto.status === CommonStatus.ENABLED
    ) {
      throw BusinessException.forbidden('该门店由平台禁用，只能由平台恢复');
    }

    store.status = dto.status;
    store.bannedBy = dto.status === CommonStatus.DISABLED ? side : null;

    return StoreResponseDto.from(await this.storeRepository.save(store));
  }

  /**
   * 删除门店（软删除）。
   *
   * 有历史订单就不让删：订单、支付流水与收银归属都挂在门店上，删掉门店会让
   * 这些历史记录在列表里指向一个选不中的店。建错的店要先停用（`changeStatus`）。
   */
  async remove(id: number, currentUser: AuthUser): Promise<void> {
    const store = await this.findByIdOrFail(id, currentUser);

    const orderCount = await this.orderRepository.count({ where: { storeId: store.id } });
    if (orderCount > 0) {
      throw BusinessException.conflict(
        ErrorCode.STORE_IN_USE,
        `该门店已有 ${orderCount} 条订单，不能删除；如需停止营业请改为禁用`,
      );
    }

    await this.storeRepository.softDelete(store.id);
  }

  /** 门店名称在同一商户内唯一（软删除的记录不占用名称） */
  private async assertNameAvailable(
    merchantId: number,
    name: string,
    excludeId?: number,
  ): Promise<void> {
    const where: FindOptionsWhere<Store> = { merchantId, name };
    if (excludeId) {
      where.id = Not(excludeId);
    }
    const existed = await this.storeRepository.findOne({ where });
    if (existed) {
      throw BusinessException.conflict(ErrorCode.STORE_NAME_EXISTS, '该商户下门店名称已存在');
    }
  }
}
