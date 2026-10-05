import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource, Not, Repository } from 'typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { REDIS_CLIENT, TenantKeys } from '../redis/redis.constants';
import { UserService } from '../user/user.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { MerchantResponseDto } from './dto/merchant-response.dto';
import { QueryMerchantDto } from './dto/query-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { Merchant } from './entities/merchant.entity';

/**
 * 商户可用状态缓存时长（秒）。
 * 取值要小：禁用是「立刻止血」的操作，缓存只用来削掉每请求一次的查询。
 */
const MERCHANT_STATE_TTL_SECONDS = 30;

/** 缓存下来的商户可用性快照 */
interface MerchantState {
  status: CommonStatus;
  /** 到期时间戳（毫秒），null 表示不限 */
  expireAt: number | null;
}

/**
 * 商户（租户）服务。
 *
 * 商户是租户体系的根，因此本服务只对平台侧角色开放，
 * 不做 merchant_id 过滤——平台侧账号本就跨租户。
 */
@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
  ) {}

  /** 分页查询商户 */
  async paginate(query: QueryMerchantDto): Promise<PaginatedDto<MerchantResponseDto>> {
    const qb = this.merchantRepository.createQueryBuilder('merchant');

    if (query.keyword) {
      qb.andWhere('merchant.name LIKE :keyword', { keyword: `%${query.keyword}%` });
    }
    if (query.status !== undefined) {
      qb.andWhere('merchant.status = :status', { status: query.status });
    }

    qb.orderBy('merchant.id', 'DESC').skip(query.skip).take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return PaginatedDto.from({
      list: rows.map((row) => MerchantResponseDto.from(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 按 ID 查询，不存在则抛业务异常 */
  async findByIdOrFail(id: number): Promise<Merchant> {
    const merchant = await this.merchantRepository.findOne({ where: { id } });
    if (!merchant) {
      throw BusinessException.notFound(ErrorCode.MERCHANT_NOT_FOUND, '商户不存在');
    }
    return merchant;
  }

  /** 查询详情（出参 DTO） */
  async findOne(id: number): Promise<MerchantResponseDto> {
    return MerchantResponseDto.from(await this.findByIdOrFail(id));
  }

  /**
   * 校验商户可用：存在 + 已启用 + 未过期。**强读库**，不走缓存。
   *
   * 登录时调用：登录是「重新准入」动作，必须读到平台刚刚恢复的商户，
   * 不能被禁用期间写入的缓存挡住。
   */
  async assertEnabled(id: number): Promise<Merchant> {
    const merchant = await this.findByIdOrFail(id);
    this.assertStateUsable(this.toState(merchant));
    await this.cacheState(merchant);
    return merchant;
  }

  /**
   * 请求链路上的商户可用性校验（带短缓存）。
   *
   * 只有登录时校验是不够的：JWT 有效期 7 天，商户被平台禁用 / 欠费到期后，
   * 其在职账号手里的旧 Token 在整整 7 天内仍可读写数据、仍可被 C 端下单。
   * 因此「这个租户还准不准营业」必须在每次请求时判断，
   * 由 JwtStrategy（B 端）与 OrderService.resolveOpenStore（C 端公开下单）调用。
   *
   * 到期时间是**每次拿当前时间比对**缓存里的值，所以到期能立刻生效；
   * 平台侧的禁用/恢复由 update / remove 主动失效缓存，几乎无延迟。
   */
  async assertUsableForRequest(id: number): Promise<void> {
    const state = await this.getState(id);
    this.assertStateUsable(state);
  }

  /** 读取商户可用状态：命中缓存则免查库 */
  private async getState(id: number): Promise<MerchantState> {
    const key = TenantKeys.merchantState(id);

    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as MerchantState;
    }

    const merchant = await this.merchantRepository.findOne({ where: { id } });
    if (!merchant) {
      // 请求链路上「租户不存在」等同于租户不可用，用 403 而不是 404：
      // 对持 Token 的调用方来说，要表达的是「你所属的商户已不能继续使用」
      throw new BusinessException(
        ErrorCode.MERCHANT_NOT_FOUND,
        '所属商户不存在，请联系平台管理员',
        HttpStatus.FORBIDDEN,
      );
    }

    const state = this.toState(merchant);
    await this.redis.set(key, JSON.stringify(state), 'EX', MERCHANT_STATE_TTL_SECONDS);
    return state;
  }

  private toState(merchant: Merchant): MerchantState {
    return {
      status: merchant.status,
      expireAt: merchant.expireAt ? merchant.expireAt.getTime() : null,
    };
  }

  private async cacheState(merchant: Merchant): Promise<void> {
    await this.redis.set(
      TenantKeys.merchantState(merchant.id),
      JSON.stringify(this.toState(merchant)),
      'EX',
      MERCHANT_STATE_TTL_SECONDS,
    );
  }

  /** 失效缓存，让平台的禁用 / 恢复立刻可见 */
  private async invalidateState(merchantId: number): Promise<void> {
    await this.redis.del(TenantKeys.merchantState(merchantId));
  }

  private assertStateUsable(state: MerchantState): void {
    if (state.status !== CommonStatus.ENABLED) {
      throw new BusinessException(
        ErrorCode.MERCHANT_DISABLED,
        '商户已被禁用，请联系平台管理员',
        HttpStatus.FORBIDDEN,
      );
    }
    if (state.expireAt !== null && state.expireAt < Date.now()) {
      throw new BusinessException(
        ErrorCode.MERCHANT_DISABLED,
        '商户服务已到期，请联系平台管理员续费',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * 新增商户，并同事务开通其首个商家管理员。
   *
   * 两步必须原子：只留下商户没有管理员（或反之）会产出一个谁也登不进去的
   * 半成品租户，而平台端此后已不再提供「代商家补建账号」的入口。
   * 商家此后的员工账号一律由该管理员在商户后台自行创建。
   */
  async create(dto: CreateMerchantDto): Promise<MerchantResponseDto> {
    await this.assertNameAvailable(dto.name);

    const merchant = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Merchant);
      const saved = await repository.save(
        repository.create({
          name: dto.name,
          contactName: dto.contactName ?? null,
          contactPhone: dto.contactPhone ?? null,
          expireAt: dto.expireAt ? new Date(dto.expireAt) : null,
          remark: dto.remark ?? null,
          status: CommonStatus.ENABLED,
        }),
      );

      await this.userService.createMerchantAdmin(manager, saved.id, {
        username: dto.adminUsername,
        nickname: dto.adminNickname,
        phone: dto.adminPhone ?? dto.contactPhone ?? null,
        password: dto.adminPassword,
      });

      return saved;
    });

    return MerchantResponseDto.from(merchant);
  }

  /** 编辑商户 */
  async update(id: number, dto: UpdateMerchantDto): Promise<MerchantResponseDto> {
    const merchant = await this.findByIdOrFail(id);

    if (dto.name !== undefined && dto.name !== merchant.name) {
      await this.assertNameAvailable(dto.name, id);
      merchant.name = dto.name;
    }
    if (dto.contactName !== undefined) {
      merchant.contactName = dto.contactName;
    }
    if (dto.contactPhone !== undefined) {
      merchant.contactPhone = dto.contactPhone;
    }
    if (dto.expireAt !== undefined) {
      merchant.expireAt = dto.expireAt ? new Date(dto.expireAt) : null;
    }
    if (dto.remark !== undefined) {
      merchant.remark = dto.remark;
    }
    if (dto.status !== undefined) {
      merchant.status = dto.status;
    }

    const saved = await this.merchantRepository.save(merchant);
    // 状态或到期时间变了就必须让缓存失效，否则请求链路最长还要放行 30 秒
    await this.invalidateState(saved.id);

    return MerchantResponseDto.from(saved);
  }

  /**
   * 删除商户（软删除）。
   *
   * TODO: 商户下若仍有门店 / 员工，需要级联处理策略（禁止删除或一并停用），
   *       待门店与员工模块稳定后补充。
   */
  async remove(id: number): Promise<void> {
    await this.findByIdOrFail(id);
    await this.merchantRepository.softDelete(id);
    // 软删后 findOne 不再返回该商户，请求链路会按「所属商户不存在」拒绝；
    // 这里失效缓存是为了让拒绝立刻生效，而不是等缓存过期。
    await this.invalidateState(id);
  }

  /** 商户名称唯一性校验（软删除的记录不占用名称） */
  private async assertNameAvailable(name: string, excludeId?: number): Promise<void> {
    const existed = await this.merchantRepository.findOne({
      where: excludeId ? { name, id: Not(excludeId) } : { name },
    });
    if (existed) {
      throw BusinessException.conflict(ErrorCode.MERCHANT_NAME_EXISTS, '商户名称已存在');
    }
  }
}
