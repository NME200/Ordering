import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { resolveStoreScope } from '../../common/utils/tenant.util';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { StoreTableResponseDto, UpsertStoreTableDto } from './dto/store-table.dto';
import { StoreTable } from './entities/store-table.entity';
import { StoreService } from './store.service';

/**
 * 门店台位（桌号）维护。
 *
 * 单独一个 service 而不是塞进 StoreService：台位是「一张桌一行」的业务数据，
 * 门店是租户主体，两者的权限与生命周期都不一样。
 *
 * 归属校验走两道：
 * 1. `resolveStoreScope` —— 店长 / 收银员这类绑店账号，门店强制取自 Token，
 *    前端传别人的 storeId 直接拒；
 * 2. `StoreService.findOne` —— 商户管理员只能碰自己商户下的门店（沿用既有租户范围逻辑）。
 */
@Injectable()
export class StoreTableService {
  constructor(
    @InjectRepository(StoreTable)
    private readonly tableRepository: Repository<StoreTable>,
    private readonly storeService: StoreService,
  ) {}

  /** 某门店的台位列表：按 sort 升序，同序号按建立先后 */
  async list(storeId: number, currentUser: AuthUser): Promise<StoreTableResponseDto[]> {
    await this.assertStoreInScope(storeId, currentUser);
    const rows = await this.tableRepository.find({
      where: { storeId },
      order: { sort: 'ASC', id: 'ASC' },
    });
    return rows.map((row) => StoreTableResponseDto.from(row));
  }

  async create(
    storeId: number,
    dto: UpsertStoreTableDto,
    currentUser: AuthUser,
  ): Promise<StoreTableResponseDto> {
    await this.assertStoreInScope(storeId, currentUser);
    const tableNo = this.normalizeNo(dto.tableNo);
    await this.assertNoDuplicate(storeId, tableNo);

    const saved = await this.tableRepository.save(
      this.tableRepository.create({
        storeId,
        tableNo,
        area: dto.area?.trim() || null,
        status: dto.status ?? CommonStatus.ENABLED,
        sort: dto.sort ?? 0,
      }),
    );
    return StoreTableResponseDto.from(saved);
  }

  async update(
    id: number,
    dto: UpsertStoreTableDto,
    currentUser: AuthUser,
  ): Promise<StoreTableResponseDto> {
    const table = await this.findByIdOrFail(id);
    await this.assertStoreInScope(table.storeId, currentUser);
    const tableNo = this.normalizeNo(dto.tableNo);
    await this.assertNoDuplicate(table.storeId, tableNo, id);

    table.tableNo = tableNo;
    if (dto.area !== undefined) {
      table.area = dto.area.trim() || null;
    }
    if (dto.status !== undefined) {
      table.status = dto.status;
    }
    if (dto.sort !== undefined) {
      table.sort = dto.sort;
    }
    return StoreTableResponseDto.from(await this.tableRepository.save(table));
  }

  /**
   * 删除台位（软删）。
   *
   * 不跟着删 miniapp_qrcodes 那一行：桌号被复用后重新生成会覆盖它，
   * 而下单校验只看台位表 —— 桌位一停，旧码扫进来就会被拒，图片留着不影响正确性。
   */
  async remove(id: number, currentUser: AuthUser): Promise<{ id: number }> {
    const table = await this.findByIdOrFail(id);
    await this.assertStoreInScope(table.storeId, currentUser);
    await this.tableRepository.softDelete(id);
    return { id };
  }

  /**
   * 扫码带出来的桌号能不能用：只认「本店 + 启用中」。
   *
   * 给下单链路用。桌号一旦不再手填，这里就是唯一的真值来源 ——
   * 码贴错桌、旧码没撕，都要在这里挡住，而不是把餐端到别桌。
   */
  async isUsable(storeId: number, tableNo: string): Promise<boolean> {
    const count = await this.tableRepository.countBy({
      storeId,
      tableNo: tableNo.trim(),
      status: CommonStatus.ENABLED,
    });
    return count > 0;
  }

  private normalizeNo(value: string): string {
    const tableNo = (value ?? '').trim();
    if (!tableNo) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, '桌号不能为空');
    }
    return tableNo;
  }

  private async findByIdOrFail(id: number): Promise<StoreTable> {
    const table = await this.tableRepository.findOne({ where: { id } });
    if (!table) {
      throw BusinessException.notFound(ErrorCode.STORE_TABLE_UNUSABLE, '台位不存在或已删除');
    }
    return table;
  }

  /** 同门店内桌号判重（软删的不参与，桌号可以复用） */
  private async assertNoDuplicate(storeId: number, tableNo: string, exceptId?: number): Promise<void> {
    const where = exceptId
      ? { storeId, tableNo, id: Not(exceptId) }
      : { storeId, tableNo };
    if (await this.tableRepository.exists({ where })) {
      throw BusinessException.conflict(ErrorCode.STORE_TABLE_EXISTS, `本店已有桌号「${tableNo}」`);
    }
  }

  /**
   * 门店范围校验：绑店账号强制自家门店，其余按租户范围查得到才算数。
   *
   * 桌码服务也要同一道闸，所以是 public —— 两处各写一遍迟早漏一边。
   */
  async assertStoreInScope(storeId: number, currentUser: AuthUser): Promise<void> {
    const scoped = resolveStoreScope(currentUser, storeId);
    if (scoped === null || scoped !== storeId) {
      throw BusinessException.forbidden('该账号只能维护自己门店的台位');
    }
    await this.storeService.findOne(storeId, currentUser);
  }
}
