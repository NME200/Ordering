import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { collectValidationErrors } from '../../common/utils/validation-errors';
import { isAppLinkTarget } from '../../shared/constants/app-entry';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { SavePopupDto } from './dto/save-popup.dto';
import { PopupResponseDto, PopupStatsDto } from './dto/popup-response.dto';
import { QueryPublicPopupDto, ReportPopupEventDto } from './dto/public-popup.dto';
import { POPUP_CONTENT_SCHEMAS, PopupQueueMode, PopupType } from './constants/popup-schema';
import { PopupConfig } from './entities/popup-config.entity';
import { PopupShowLog } from './entities/popup-show-log.entity';

/** C 端弹窗队列 */
export interface PublicPopupQueue {
  queueMode: PopupQueueMode;
  maxShow: number;
  popups: {
    popupId: number;
    type: PopupType;
    priority: number;
    frequency: string;
    content: Record<string, unknown>;
  }[];
}

/**
 * 活动弹窗服务。
 *
 * 过滤分工照 `Small-web/doc/popup-design.md` 第三节：**后端按时间、状态、门店过滤**
 * （下发不该看的活动是事故），**频次由小程序本地拦截 + show_log 留痕**
 * （匿名接口认不得「这个人」，把频次判定放服务端只会多一个可被刷的入口）。
 */
@Injectable()
export class PopupService {
  constructor(
    @InjectRepository(PopupConfig) private readonly popupRepository: Repository<PopupConfig>,
    @InjectRepository(PopupShowLog) private readonly logRepository: Repository<PopupShowLog>,
  ) {}

  /** 后台列表：带投放数据，运营靠点击率判断哪个弹窗该下线 */
  async list(): Promise<PopupResponseDto[]> {
    const rows = await this.popupRepository.find({
      order: { priority: 'ASC', createdAt: 'DESC' },
    });
    const stats = await this.statsByPopupIds(rows.map((row) => row.id));
    return rows.map((row) => PopupResponseDto.from(row, stats.get(row.id)));
  }

  async create(dto: SavePopupDto, currentUser: AuthUser): Promise<PopupResponseDto> {
    const patch = this.toEntityPatch(dto);
    this.assertTimeWindow(patch);
    const saved = await this.popupRepository.save(
      this.popupRepository.create({ ...patch, createdBy: currentUser.userId }),
    );
    return PopupResponseDto.from(saved);
  }

  async update(id: number, dto: SavePopupDto): Promise<PopupResponseDto> {
    const popup = await this.findByIdOrFail(id);
    Object.assign(popup, this.toEntityPatch(dto));
    this.assertTimeWindow(popup);
    return PopupResponseDto.from(await this.popupRepository.save(popup));
  }

  /** 删除（软删）。日志留着 —— 已经发生的曝光不该因为活动下线而蒸发 */
  async remove(id: number): Promise<void> {
    await this.findByIdOrFail(id);
    await this.popupRepository.softDelete(id);
  }

  /**
   * C 端队列。
   *
   * 队列行为由**优先级最高那条**决定，这是最容易讲清楚的一种口径：
   * 它写 `top_only` 就只弹它；它写 `maxShow=2` 就最多弹两个。
   * 否则「A 说弹 1 个、B 说弹 3 个」得再发明一层仲裁规则。
   */
  async resolveForClient(query: QueryPublicPopupDto): Promise<PublicPopupQueue> {
    const now = new Date();
    const builder = this.popupRepository
      .createQueryBuilder('popup')
      .where('popup.status = :enabled', { enabled: CommonStatus.ENABLED })
      .andWhere('popup.scene = :scene', { scene: query.scene })
      .andWhere('(popup.start_time IS NULL OR popup.start_time <= :now)', { now })
      .andWhere('(popup.end_time IS NULL OR popup.end_time >= :now)', { now })
      .orderBy('popup.priority', 'ASC')
      .addOrderBy('popup.id', 'ASC');

    // 门店专属 + 平台通用一起给；带 storeId 时门店自己的那条优先级照常参与排序
    if (query.storeId) {
      builder.andWhere('(popup.store_id IS NULL OR popup.store_id = :storeId)', {
        storeId: query.storeId,
      });
    } else {
      builder.andWhere('popup.store_id IS NULL');
    }

    const rows = await builder.getMany();
    if (rows.length === 0) {
      return { queueMode: PopupQueueMode.QUEUE, maxShow: 0, popups: [] };
    }

    const head = rows[0];
    const maxShow = head.queueMode === PopupQueueMode.TOP_ONLY ? 1 : head.maxShow;
    return {
      queueMode: head.queueMode,
      maxShow,
      popups: rows
        .slice(0, Math.max(1, maxShow))
        .map((row) => ({
          popupId: row.id,
          type: row.type,
          priority: row.priority,
          frequency: row.frequency,
          content: row.content,
        })),
    };
  }

  /**
   * 埋点落库：曝光 / 关闭 / 点击三个事件写同一行。
   *
   * 用 `INSERT ... ON DUPLICATE KEY UPDATE` 而不是「读出来加一再存」：
   * 曝光计数要累加，读改写在并发下会互相覆盖，而这里恰好有一条唯一索引可用。
   */
  async report(event: ReportPopupEventDto): Promise<void> {
    const exists = await this.popupRepository.exists({ where: { id: event.popupId } });
    if (!exists) {
      throw BusinessException.notFound(ErrorCode.NOT_FOUND, '弹窗不存在');
    }

    const column = event.action === 'close' ? 'closed' : event.action === 'click' ? 'clicked' : null;
    const params = [event.popupId, event.visitorKey, localDate()];

    if (column) {
      await this.logRepository.query(
        `INSERT INTO popup_show_logs (popup_id, visitor_key, show_date, show_count, closed, clicked)
         VALUES (?, ?, ?, 0, ${column === 'closed' ? '1' : '0'}, ${column === 'clicked' ? '1' : '0'})
         ON DUPLICATE KEY UPDATE ${column} = 1, updated_at = NOW()`,
        params,
      );
      return;
    }

    await this.logRepository.query(
      `INSERT INTO popup_show_logs (popup_id, visitor_key, show_date, show_count, closed, clicked)
       VALUES (?, ?, ?, 1, 0, 0)
       ON DUPLICATE KEY UPDATE show_count = show_count + 1, updated_at = NOW()`,
      params,
    );
  }

  // ==================== 内部辅助 ====================

  /** DTO → 实体片段：内容按类型分派校验，跳转必须命中小程序真有的页面 */
  private toEntityPatch(dto: SavePopupDto): Partial<PopupConfig> {
    const schema = POPUP_CONTENT_SCHEMAS[dto.type];
    if (!schema) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, `不支持的弹窗类型：${dto.type}`);
    }
    const errors = collectValidationErrors(plainToInstance(schema, dto.content ?? {}), '内容');

    const link = (dto.content as Record<string, unknown>)?.link;
    if (typeof link === 'string' && link && !isAppLinkTarget(link)) {
      errors.push(`跳转地址 ${link} 不是小程序已有的页面`);
    }
    if (errors.length > 0) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, errors.join('；'));
    }

    return {
      name: dto.name,
      type: dto.type,
      scene: dto.scene,
      storeId: dto.storeId ?? null,
      priority: dto.priority ?? 10,
      status: dto.status ?? CommonStatus.ENABLED,
      startTime: dto.startTime ? new Date(dto.startTime) : null,
      endTime: dto.endTime ? new Date(dto.endTime) : null,
      frequency: dto.frequency,
      maxShow: dto.maxShow ?? 1,
      queueMode: dto.queueMode ?? PopupQueueMode.QUEUE,
      content: dto.content,
    };
  }

  private assertTimeWindow(popup: Partial<PopupConfig>): void {
    if (popup.startTime && popup.endTime && popup.endTime <= popup.startTime) {
      throw BusinessException.badRequest(
        ErrorCode.PARAM_INVALID,
        '结束时间必须晚于开始时间，否则这条活动永远不会弹出',
      );
    }
  }

  private async findByIdOrFail(id: number): Promise<PopupConfig> {
    const popup = await this.popupRepository.findOne({ where: { id } });
    if (!popup) {
      throw BusinessException.notFound(ErrorCode.NOT_FOUND, '弹窗不存在');
    }
    return popup;
  }

  /** 一条 GROUP BY 把列表页要的四个指标全拿回来，不给每个弹窗各查一次 */
  private async statsByPopupIds(ids: number[]): Promise<Map<number, PopupStatsDto>> {
    const empty = new Map<number, PopupStatsDto>();
    if (ids.length === 0) {
      return empty;
    }
    const rows = await this.logRepository
      .createQueryBuilder('log')
      .select('log.popupId', 'popupId')
      .addSelect('SUM(log.showCount)', 'pv')
      .addSelect('COUNT(DISTINCT log.visitorKey)', 'uv')
      .addSelect("COUNT(DISTINCT CASE WHEN log.clicked = 1 THEN log.visitorKey END)", 'clickUv')
      .where('log.popupId IN (:...ids)', { ids })
      .groupBy('log.popupId')
      .getRawMany<{ popupId: string; pv: string; uv: string; clickUv: string }>();

    for (const row of rows) {
      const uv = Number(row.uv ?? 0);
      const clickUv = Number(row.clickUv ?? 0);
      const stats = new PopupStatsDto();
      stats.exposurePv = Number(row.pv ?? 0);
      stats.exposureUv = uv;
      stats.clickUv = clickUv;
      // 没有曝光就没有点击率可言，回 null 而不是 0% —— 0% 会被读成「有人看没人点」
      stats.clickRate = uv > 0 ? Number((clickUv / uv).toFixed(4)) : null;
      empty.set(Number(row.popupId), stats);
    }
    return empty;
  }
}

/** 访客本地的「今天」：show_date 是天粒度唯一索引的一部分 */
function localDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
