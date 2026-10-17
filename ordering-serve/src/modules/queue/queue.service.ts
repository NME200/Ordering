import { Injectable } from '@nestjs/common';
import { LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { requireMerchantScope, resolveStoreScope } from '../../common/utils/tenant.util';
import { BusinessStatus } from '../../shared/enums/business-status.enum';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import {
  QUEUE_STATUS_LABELS,
  QUEUE_TABLE_TYPES,
  QueueStatus,
  resolveTableType,
} from '../../shared/enums/queue.enum';
import { MerchantService } from '../merchant/merchant.service';
import { Store } from '../store/entities/store.entity';
import { Queue } from './entities/queue.entity';
import { QueryQueueDto, QueueDto, TakeQueueDto } from './dto/queue.dto';

/** 号面序号位数：A012 */
const NO_DIGITS = 3;

/**
 * 排队叫号服务。
 *
 * 号序生成靠 `(门店, 营业日, 桌型, 序号)` 的联合唯一索引兜底：
 * 「先查 MAX(no) 再 +1」在两人同时取号时必然撞号，
 * 撞了就读一次最新值重试，最多三次 —— 排队是瞬时高峰场景，
 * 三次都撞不上说明这家店已经不是在排队而是在抢号了。
 */
@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(Queue)
    private readonly queueRepository: Repository<Queue>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly merchantService: MerchantService,
  ) {}

  // ==================== 顾客侧 ====================

  /** 取号。`customerId` 为 null 表示门店代客取号（线下扫码台 / 电话订位） */
  async take(
    customerId: number | null,
    dto: TakeQueueDto,
    staffUserId?: number,
  ): Promise<QueueDto> {
    const store = await this.resolveOpenStore(dto.storeId);
    const tableType = resolveTableType(dto.tableType);
    if (!tableType) {
      throw BusinessException.badRequest(ErrorCode.QUEUE_NOT_FOUND, '桌型不存在');
    }
    if (dto.partySize < tableType.minParty || dto.partySize > tableType.maxParty) {
      throw BusinessException.badRequest(
        ErrorCode.QUEUE_NOT_FOUND,
        `${tableType.label}不支持 ${dto.partySize} 人，请选其它桌型`,
      );
    }

    if (customerId !== null) {
      const active = await this.findActiveByCustomer(customerId);
      if (active) {
        throw BusinessException.badRequest(
          ErrorCode.QUEUE_ALREADY_ACTIVE,
          `你已经在 ${active.storeName} 排了 ${active.queueNo} 号，请先取消`,
        );
      }
    }

    const bizDate = this.today();
    let saved: Queue | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const nextNo = await this.nextNo(store.id, bizDate, dto.tableType);
      try {
        saved = await this.queueRepository.save(
          this.queueRepository.create({
            merchantId: store.merchantId,
            storeId: store.id,
            storeName: store.name,
            bizDate,
            tableType: dto.tableType,
            no: nextNo,
            queueNo: `${tableType.prefix}${String(nextNo).padStart(NO_DIGITS, '0')}`,
            partySize: dto.partySize,
            customerId,
            phone: dto.phone ?? null,
            status: QueueStatus.WAITING,
            createdBy: staffUserId ?? null,
          }),
        );
        break;
      } catch (error) {
        if (!this.isDuplicate(error) || attempt === 2) {
          throw error;
        }
      }
    }
    if (!saved) {
      throw BusinessException.badRequest(ErrorCode.QUEUE_STATUS_INVALID, '取号失败，请重试');
    }

    return this.toDto(saved, await this.aheadOf(saved));
  }

  /** 我的当前号（没有返回 null） */
  async mine(customerId: number): Promise<QueueDto | null> {
    const row = await this.findActiveByCustomer(customerId);
    return row ? this.toDto(row, await this.aheadOf(row)) : null;
  }

  /** 顾客取消自己的号 */
  async cancelByCustomer(customerId: number, id: number): Promise<QueueDto> {
    const row = await this.queueRepository.findOne({ where: { id, customerId } });
    if (!row) {
      throw BusinessException.notFound(ErrorCode.QUEUE_NOT_FOUND, '排队记录不存在');
    }
    if (row.status === QueueStatus.SEATED) {
      throw BusinessException.badRequest(ErrorCode.QUEUE_STATUS_INVALID, '已入座的号不能取消');
    }
    row.status = QueueStatus.CANCELLED;
    const saved = await this.queueRepository.save(row);
    return this.toDto(saved, 0);
  }

  /** 某门店当前队列（顾客进店看「前面还有几桌」） */
  async board(storeId: number): Promise<{
    storeId: number;
    storeName: string;
    waiting: number;
    callingNo: string | null;
    byTableType: { tableType: string; label: string; waiting: number }[];
  }> {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    // 看板是匿名只读面，但**被平台停用的店不该继续出现在公开页面上**：
    // 取号走的是 resolveOpenStore（连打烊一起挡），这里只挡「不该被看到」的那几种情况，
    // 打烊仍允许看（队列本来就是空的，给个错误反而让门口的人以为系统坏了）。
    // 不存在与已停用一律回同一个 404，不给枚举 storeId 留信号 —— 与小程序活动条同一口径。
    if (!store || store.status !== CommonStatus.ENABLED) {
      throw BusinessException.notFound(ErrorCode.ORDER_STORE_CLOSED, '门店不存在或已停止营业');
    }
    await this.merchantService.assertUsableForRequest(store.merchantId);
    const rows = await this.activeRows(storeId, this.today());
    const calling = rows.find((row) => row.status === QueueStatus.CALLED) ?? null;

    return {
      storeId: store.id,
      storeName: store.name,
      waiting: rows.filter((row) => row.status === QueueStatus.WAITING).length,
      callingNo: calling?.queueNo ?? null,
      byTableType: QUEUE_TABLE_TYPES.map((type) => ({
        tableType: type.key,
        label: type.label,
        waiting: rows.filter(
          (row) => row.tableType === type.key && row.status === QueueStatus.WAITING,
        ).length,
      })),
    };
  }

  // ==================== 门店侧 ====================

  /** 门店代客取号 */
  async takeForStaff(dto: TakeQueueDto, currentUser: AuthUser): Promise<QueueDto> {
    requireMerchantScope(currentUser);
    return this.take(null, dto, currentUser.userId);
  }

  /** 当日队列（叫号台） */
  async paginate(query: QueryQueueDto, currentUser: AuthUser): Promise<QueueDto[]> {
    const storeId = resolveStoreScope(currentUser, query.storeId);
    if (storeId === null) {
      throw BusinessException.badRequest(ErrorCode.ORDER_STORE_REQUIRED, '请指定门店');
    }
    const bizDate = query.bizDate ?? this.today();

    const rows = await this.queueRepository.find({
      where: { storeId, bizDate, ...(query.status ? { status: query.status } : {}) },
      order: { no: 'ASC' },
      take: Math.min(query.pageSize, 200),
    });

    const callingByType = new Map<string, string>();
    for (const row of rows) {
      if (row.status === QueueStatus.CALLED && !callingByType.has(row.tableType)) {
        callingByType.set(row.tableType, row.queueNo);
      }
    }

    return rows.map((row) =>
      this.toDto(row, 0, callingByType.get(row.tableType) ?? null),
    );
  }

  /** 叫号 / 入座 / 过号 / 过号召回 */
  async advance(
    id: number,
    target: QueueStatus.CALLED | QueueStatus.SEATED | QueueStatus.PASSED | QueueStatus.WAITING,
    currentUser: AuthUser,
  ): Promise<QueueDto> {
    const storeId = resolveStoreScope(currentUser);
    const row = await this.queueRepository.findOne({ where: { id } });
    if (!row) {
      throw BusinessException.notFound(ErrorCode.QUEUE_NOT_FOUND, '排队记录不存在');
    }
    if (storeId !== null && row.storeId !== storeId) {
      throw BusinessException.notFound(ErrorCode.QUEUE_NOT_FOUND, '排队记录不存在');
    }

    // 过号只能回到排队或离席，不能直接入座 —— 中间缺一次「重新叫号」的审计
    const allowed: Record<string, QueueStatus[]> = {
      [QueueStatus.WAITING]: [QueueStatus.CALLED, QueueStatus.PASSED, QueueStatus.CANCELLED],
      [QueueStatus.CALLED]: [QueueStatus.SEATED, QueueStatus.PASSED],
      [QueueStatus.PASSED]: [QueueStatus.WAITING, QueueStatus.CANCELLED],
    };
    if (!allowed[row.status]?.includes(target)) {
      throw BusinessException.badRequest(
        ErrorCode.QUEUE_STATUS_INVALID,
        `「${QUEUE_STATUS_LABELS[row.status]}」不能直接变成「${QUEUE_STATUS_LABELS[target]}」`,
      );
    }

    row.status = target;
    if (target === QueueStatus.CALLED) {
      row.calledAt = new Date();
    }
    if (target === QueueStatus.SEATED) {
      row.seatedAt = new Date();
    }
    if (target === QueueStatus.WAITING) {
      // 过号召回：回到队尾而不是原位，否则前面的人会被反复插队
      row.no = await this.nextNo(row.storeId, row.bizDate, row.tableType);
      const type = resolveTableType(row.tableType);
      row.queueNo = `${type?.prefix ?? 'A'}${String(row.no).padStart(NO_DIGITS, '0')}`;
      row.calledAt = null;
    }

    const saved = await this.queueRepository.save(row);
    return this.toDto(saved, await this.aheadOf(saved));
  }

  // ==================== 内部辅助 ====================

  private async findActiveByCustomer(customerId: number): Promise<Queue | null> {
    return this.queueRepository.findOne({
      where: [
        { customerId, status: QueueStatus.WAITING },
        { customerId, status: QueueStatus.CALLED },
      ],
      order: { id: 'DESC' },
    });
  }

  /** 当日该桌型的下一个序号 */
  private async nextNo(storeId: number, bizDate: string, tableType: string): Promise<number> {
    const row = await this.queueRepository
      .createQueryBuilder('queue')
      .select('MAX(queue.no)', 'max')
      .where('queue.store_id = :storeId', { storeId })
      .andWhere('queue.biz_date = :bizDate', { bizDate })
      .andWhere('queue.table_type = :tableType', { tableType })
      .getRawOne<{ max: string | null }>();
    return Number(row?.max ?? 0) + 1;
  }

  /** 前面还有几桌：同店同日同桌型、序号更小且仍在排队的人 */
  private async aheadOf(row: Queue): Promise<number> {
    if (row.status !== QueueStatus.WAITING && row.status !== QueueStatus.CALLED) {
      return 0;
    }
    return this.queueRepository.count({
      where: {
        storeId: row.storeId,
        bizDate: row.bizDate,
        tableType: row.tableType,
        status: QueueStatus.WAITING,
        no: LessThan(row.no),
      },
    });
  }

  private async activeRows(storeId: number, bizDate: string): Promise<Queue[]> {
    return this.queueRepository.find({
      where: [
        { storeId, bizDate, status: QueueStatus.WAITING },
        { storeId, bizDate, status: QueueStatus.CALLED },
      ],
      order: { no: 'ASC' },
    });
  }

  private async resolveOpenStore(storeId: number): Promise<Store> {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) {
      throw BusinessException.notFound(ErrorCode.ORDER_STORE_CLOSED, '门店不存在');
    }
    await this.merchantService.assertUsableForRequest(store.merchantId);
    if (store.status !== CommonStatus.ENABLED || store.businessStatus !== BusinessStatus.OPEN) {
      throw BusinessException.badRequest(ErrorCode.ORDER_STORE_CLOSED, '门店已打烊，暂不支持取号');
    }
    return store;
  }

  private today(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  private toDto(row: Queue, ahead: number, callingNo: string | null = null): QueueDto {
    const dto = new QueueDto();
    dto.id = row.id;
    dto.storeId = row.storeId;
    dto.storeName = row.storeName;
    dto.bizDate = row.bizDate;
    dto.tableType = row.tableType;
    dto.tableTypeLabel = resolveTableType(row.tableType)?.label ?? row.tableType;
    dto.queueNo = row.queueNo;
    dto.partySize = row.partySize;
    dto.status = row.status;
    dto.statusLabel = QUEUE_STATUS_LABELS[row.status];
    dto.createdAt = row.createdAt;
    dto.calledAt = row.calledAt;
    dto.seatedAt = row.seatedAt;
    dto.ahead = ahead;
    dto.callingNo = callingNo;
    return dto;
  }

  private isDuplicate(error: unknown): boolean {
    return (
      (error as { driverError?: { code?: string } })?.driverError?.code === 'ER_DUP_ENTRY' ||
      (error as { code?: string })?.code === 'ER_DUP_ENTRY'
    );
  }
}
