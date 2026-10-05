import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Not, Repository } from 'typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { requireMerchantScope, resolveMerchantScope } from '../../common/utils/tenant.util';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { DishSpecGroup } from '../dish/entities/dish-spec-group.entity';
import { CreateSpecGroupDto } from './dto/create-spec-group.dto';
import { QuerySpecGroupDto } from './dto/query-spec-group.dto';
import { SpecGroupResponseDto } from './dto/spec-group-response.dto';
import { SpecOptionItemDto } from './dto/spec-option-item.dto';
import { UpdateSpecGroupDto } from './dto/update-spec-group.dto';
import { SpecGroup } from './entities/spec-group.entity';
import { SpecOption } from './entities/spec-option.entity';

/**
 * 规格组服务。
 *
 * 规格组为**商户级共享资源**，一个组可被多个菜品复用；
 * 组内规格项随组一起维护（整体覆盖语义）。
 */
@Injectable()
export class SpecGroupService {
  constructor(
    @InjectRepository(SpecGroup)
    private readonly groupRepository: Repository<SpecGroup>,
    @InjectRepository(SpecOption)
    private readonly optionRepository: Repository<SpecOption>,
    // 用于「规格组是否被菜品引用」校验，避免模块间循环依赖
    @InjectRepository(DishSpecGroup)
    private readonly dishSpecGroupRepository: Repository<DishSpecGroup>,
  ) {}

  /** 分页查询规格组（含组内规格项） */
  async paginate(
    query: QuerySpecGroupDto,
    currentUser: AuthUser,
  ): Promise<PaginatedDto<SpecGroupResponseDto>> {
    const merchantId = resolveMerchantScope(currentUser, query.merchantId);

    const qb = this.groupRepository.createQueryBuilder('specGroup');
    if (merchantId !== null) {
      qb.andWhere('specGroup.merchantId = :merchantId', { merchantId });
    }
    if (query.keyword) {
      qb.andWhere('specGroup.name LIKE :keyword', { keyword: `%${query.keyword}%` });
    }
    if (query.status !== undefined) {
      qb.andWhere('specGroup.status = :status', { status: query.status });
    }

    qb.orderBy('specGroup.sort', 'ASC')
      .addOrderBy('specGroup.id', 'ASC')
      .skip(query.skip)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    const list = await this.attachOptions(rows);

    return PaginatedDto.from({
      list,
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 不分页列表（含组内规格项），供菜品编辑页选择规格组使用 */
  async list(
    currentUser: AuthUser,
    requestedMerchantId?: number,
  ): Promise<SpecGroupResponseDto[]> {
    const merchantId = resolveMerchantScope(currentUser, requestedMerchantId);

    const qb = this.groupRepository.createQueryBuilder('specGroup');
    if (merchantId !== null) {
      qb.andWhere('specGroup.merchantId = :merchantId', { merchantId });
    }
    qb.orderBy('specGroup.sort', 'ASC').addOrderBy('specGroup.id', 'ASC');

    return this.attachOptions(await qb.getMany());
  }

  /** 查询详情（含组内规格项） */
  async findOne(id: number, currentUser: AuthUser): Promise<SpecGroupResponseDto> {
    const group = await this.findByIdOrFail(id, currentUser);
    const [dto] = await this.attachOptions([group]);
    return dto;
  }

  /** 按 ID 查询规格组，带租户校验（越权访问返回 404） */
  async findByIdOrFail(id: number, currentUser: AuthUser): Promise<SpecGroup> {
    const merchantId = resolveMerchantScope(currentUser);

    const where: FindOptionsWhere<SpecGroup> = { id };
    if (merchantId !== null) {
      where.merchantId = merchantId;
    }

    const group = await this.groupRepository.findOne({ where });
    if (!group) {
      throw BusinessException.notFound(ErrorCode.SPEC_GROUP_NOT_FOUND, '规格组不存在');
    }
    return group;
  }

  /**
   * 校验一批规格组 ID 是否都属于指定商户。
   * 供菜品模块关联规格组时调用，防止跨租户引用。
   */
  async resolveGroupsForMerchant(groupIds: number[], merchantId: number): Promise<SpecGroup[]> {
    const uniqueIds = [...new Set(groupIds)];
    if (uniqueIds.length === 0) {
      return [];
    }

    const groups = await this.groupRepository.find({
      where: { id: In(uniqueIds), merchantId },
    });
    if (groups.length !== uniqueIds.length) {
      throw BusinessException.badRequest(
        ErrorCode.SPEC_GROUP_MISMATCH,
        '存在无效的规格组，或规格组不属于当前商户',
      );
    }
    return groups;
  }

  /**
   * 按 ID 批量加载规格组（含组内规格项），供菜品模块拼装出参使用。
   * 返回顺序与传入的 groupIds 一致，便于菜品保持自己的规格展示顺序。
   */
  async findGroupsWithOptions(groupIds: number[]): Promise<SpecGroupResponseDto[]> {
    const uniqueIds = [...new Set(groupIds)];
    if (uniqueIds.length === 0) {
      return [];
    }

    const groups = await this.groupRepository.find({ where: { id: In(uniqueIds) } });
    const withOptions = await this.attachOptions(groups);
    const dtoById = new Map(withOptions.map((dto) => [dto.id, dto]));

    return uniqueIds
      .map((id) => dtoById.get(id))
      .filter((dto): dto is SpecGroupResponseDto => dto !== undefined);
  }

  /** 新增规格组（连同规格项） */
  async create(dto: CreateSpecGroupDto, currentUser: AuthUser): Promise<SpecGroupResponseDto> {
    const merchantId = requireMerchantScope(currentUser, dto.merchantId);
    await this.assertNameAvailable(merchantId, dto.name);

    const group = await this.groupRepository.save(
      this.groupRepository.create({
        merchantId,
        name: dto.name,
        type: dto.type,
        isRequired: dto.isRequired ?? false,
        sort: dto.sort ?? 0,
        status: dto.status ?? CommonStatus.ENABLED,
      }),
    );

    await this.optionRepository.save(
      dto.options.map((item, index) =>
        this.optionRepository.create({
          merchantId,
          groupId: group.id,
          name: item.name,
          priceDiff: item.priceDiff ?? 0,
          sort: item.sort ?? index,
          status: item.status ?? CommonStatus.ENABLED,
        }),
      ),
    );

    return this.findOne(group.id, currentUser);
  }

  /** 编辑规格组；传入 options 时按整体覆盖语义处理组内规格项 */
  async update(
    id: number,
    dto: UpdateSpecGroupDto,
    currentUser: AuthUser,
  ): Promise<SpecGroupResponseDto> {
    const group = await this.findByIdOrFail(id, currentUser);

    if (dto.name !== undefined && dto.name !== group.name) {
      await this.assertNameAvailable(group.merchantId, dto.name, id);
      group.name = dto.name;
    }
    if (dto.type !== undefined) {
      group.type = dto.type;
    }
    if (dto.isRequired !== undefined) {
      group.isRequired = dto.isRequired;
    }
    if (dto.sort !== undefined) {
      group.sort = dto.sort;
    }
    if (dto.status !== undefined) {
      group.status = dto.status;
    }
    await this.groupRepository.save(group);

    if (dto.options !== undefined) {
      await this.replaceOptions(group, dto.options);
    }

    return this.findOne(id, currentUser);
  }

  /** 删除规格组（软删除）：仍被菜品引用时禁止删除 */
  async remove(id: number, currentUser: AuthUser): Promise<void> {
    const group = await this.findByIdOrFail(id, currentUser);

    const usedCount = await this.dishSpecGroupRepository.count({
      where: { specGroupId: group.id },
    });
    if (usedCount > 0) {
      throw BusinessException.badRequest(
        ErrorCode.SPEC_GROUP_IN_USE,
        `该规格组已被 ${usedCount} 个菜品引用，请先在菜品中解除关联`,
      );
    }

    // 组内规格项一并软删除，避免残留孤立数据
    await this.optionRepository.softDelete({ groupId: group.id });
    await this.groupRepository.softDelete(id);
  }

  // ==================== 内部辅助 ====================

  /** 批量补齐规格组的选项列表 */
  private async attachOptions(groups: SpecGroup[]): Promise<SpecGroupResponseDto[]> {
    if (groups.length === 0) {
      return [];
    }

    const options = await this.optionRepository.find({
      where: { groupId: In(groups.map((group) => group.id)) },
      order: { sort: 'ASC', id: 'ASC' },
    });

    const optionMap = new Map<number, SpecOption[]>();
    for (const option of options) {
      const list = optionMap.get(option.groupId) ?? [];
      list.push(option);
      optionMap.set(option.groupId, list);
    }

    return groups.map((group) => SpecGroupResponseDto.from(group, optionMap.get(group.id) ?? []));
  }

  /**
   * 整体覆盖组内规格项：
   * 带 id 的更新、不带 id 的新增、未提交的已有项软删除。
   */
  private async replaceOptions(group: SpecGroup, items: SpecOptionItemDto[]): Promise<void> {
    const existing = await this.optionRepository.find({ where: { groupId: group.id } });
    const existingById = new Map(existing.map((option) => [option.id, option]));

    const keepIds = new Set<number>();
    for (const item of items) {
      if (item.id === undefined) {
        continue;
      }
      if (!existingById.has(item.id)) {
        throw BusinessException.badRequest(
          ErrorCode.SPEC_OPTION_NOT_FOUND,
          `规格项 ${item.id} 不存在或不属于该规格组`,
        );
      }
      keepIds.add(item.id);
    }

    const removedIds = existing.filter((option) => !keepIds.has(option.id)).map((o) => o.id);
    if (removedIds.length > 0) {
      await this.optionRepository.softDelete(removedIds);
    }

    for (const [index, item] of items.entries()) {
      const sort = item.sort ?? index;

      if (item.id !== undefined) {
        const target = existingById.get(item.id);
        if (!target) {
          continue;
        }
        target.name = item.name;
        target.priceDiff = item.priceDiff ?? 0;
        target.sort = sort;
        target.status = item.status ?? CommonStatus.ENABLED;
        await this.optionRepository.save(target);
        continue;
      }

      await this.optionRepository.save(
        this.optionRepository.create({
          merchantId: group.merchantId,
          groupId: group.id,
          name: item.name,
          priceDiff: item.priceDiff ?? 0,
          sort,
          status: item.status ?? CommonStatus.ENABLED,
        }),
      );
    }
  }

  /** 规格组名称在同一商户内唯一（软删除的记录不占用名称） */
  private async assertNameAvailable(
    merchantId: number,
    name: string,
    excludeId?: number,
  ): Promise<void> {
    const where: FindOptionsWhere<SpecGroup> = { merchantId, name };
    if (excludeId) {
      where.id = Not(excludeId);
    }
    const existed = await this.groupRepository.findOne({ where });
    if (existed) {
      throw BusinessException.conflict(ErrorCode.SPEC_GROUP_NAME_EXISTS, '该商户下规格组名称已存在');
    }
  }
}
