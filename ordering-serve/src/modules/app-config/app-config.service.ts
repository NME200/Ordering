import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { AppConfigStatus } from '../../shared/enums/app-config-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { AppConfigResponseDto } from './dto/app-config-response.dto';
import { SaveAppConfigDto } from './dto/save-app-config.dto';
import { DEFAULT_APP_CONFIG_CONTENT } from './constants/app-config-schema';
import { AppConfig, AppConfigContent } from './entities/app-config.entity';
import { validateAppConfigContent } from './app-config.validator';

/**
 * 小程序布局配置服务。
 *
 * 生命周期是「草稿 → 发布 → 历史」，全平台同时只有一行 published：
 * 编辑只能改草稿，发布时把旧的生效行顶成历史 —— 所以**回滚就是对历史行再发布**，
 * 不需要额外的回滚接口与版本树。
 */
@Injectable()
export class AppConfigService {
  constructor(
    @InjectRepository(AppConfig)
    private readonly configRepository: Repository<AppConfig>,
    private readonly dataSource: DataSource,
  ) {}

  /** 列表：生效中的排最前，其余按更新时间倒序 */
  async list(): Promise<AppConfigResponseDto[]> {
    const rows = await this.configRepository.find({
      order: { status: 'ASC', updatedAt: 'DESC' },
    });
    return rows.map((row) => AppConfigResponseDto.from(row));
  }

  /** 当前生效的配置（平台端预览与调试用） */
  async current(): Promise<AppConfigResponseDto | null> {
    const published = await this.findPublished();
    return published ? AppConfigResponseDto.from(published) : null;
  }

  /** 新建草稿 */
  async createDraft(dto: SaveAppConfigDto, currentUser: AuthUser): Promise<AppConfigResponseDto> {
    const content = this.toContent(dto);
    this.assertStructurallyValid(content);

    const saved = await this.configRepository.save(
      this.configRepository.create({
        name: dto.name,
        status: AppConfigStatus.DRAFT,
        content,
        version: 0,
        createdBy: currentUser.userId,
        publishedAt: null,
      }),
    );
    return AppConfigResponseDto.from(saved);
  }

  /** 覆盖草稿内容。已发布或已归档的方案不可改，要改就从它复制一份新草稿 */
  async updateDraft(id: number, dto: SaveAppConfigDto): Promise<AppConfigResponseDto> {
    const config = await this.findByIdOrFail(id);
    this.assertDraft(config);

    config.name = dto.name;
    config.content = this.toContent(dto);
    this.assertStructurallyValid(config.content);

    return AppConfigResponseDto.from(await this.configRepository.save(config));
  }

  /** 删草稿（软删）。生效中与历史版本不许删，那是回滚的落点 */
  async removeDraft(id: number): Promise<void> {
    const config = await this.findByIdOrFail(id);
    this.assertDraft(config);
    await this.configRepository.softDelete(id);
  }

  /**
   * 发布。
   *
   * 「旧的转历史 + 新的转生效」必须同事务，否则中途失败会出现两行 published，
   * C 端读到哪一份就看运气了。版本号取全表最大值 +1，保证单调递增
   * —— 小程序靠它做本地缓存协商，回滚也必须往前涨版本，不能复用旧版本号。
   */
  async publish(id: number): Promise<AppConfigResponseDto> {
    const config = await this.findByIdOrFail(id);
    if (config.status === AppConfigStatus.PUBLISHED) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, '该方案已是生效版本');
    }
    this.assertValidForPublish(config.content);

    const published = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AppConfig);
      await repository.update(
        { status: AppConfigStatus.PUBLISHED },
        { status: AppConfigStatus.ARCHIVED },
      );

      const maxVersion = await repository
        .createQueryBuilder('config')
        .select('MAX(config.version)', 'version')
        .getRawOne<{ version: string | null }>();

      config.status = AppConfigStatus.PUBLISHED;
      config.version = Number(maxVersion?.version ?? 0) + 1;
      config.publishedAt = new Date();
      return repository.save(config);
    });

    return AppConfigResponseDto.from(published);
  }

  /**
   * C 端读取：没有发布过任何配置时回落到内置默认，小程序首启不能白屏。
   *
   * `clientVersion` 命中当前版本时只回 `{ unchanged: true }` —— 这份配置每次启动都要拉，
   * 而它几天才变一次。
   */
  async resolveForClient(clientVersion?: number): Promise<Record<string, unknown>> {
    const published = await this.findPublished();
    if (!published) {
      return {
        version: 0,
        publishedAt: null,
        content: DEFAULT_CONTENT,
      };
    }

    if (clientVersion !== undefined && clientVersion === published.version) {
      return { version: published.version, unchanged: true };
    }

    return {
      version: published.version,
      publishedAt: published.publishedAt,
      content: published.content,
    };
  }

  // ==================== 内部辅助 ====================

  private findPublished(): Promise<AppConfig | null> {
    return this.configRepository.findOne({ where: { status: AppConfigStatus.PUBLISHED } });
  }

  private async findByIdOrFail(id: number): Promise<AppConfig> {
    const config = await this.configRepository.findOne({ where: { id } });
    if (!config) {
      throw BusinessException.notFound(ErrorCode.NOT_FOUND, '布局方案不存在');
    }
    return config;
  }

  private assertDraft(config: AppConfig): void {
    if (config.status !== AppConfigStatus.DRAFT) {
      throw BusinessException.badRequest(
        ErrorCode.PARAM_INVALID,
        '只有草稿可以编辑；生效中或历史版本请从它复制一份新草稿',
      );
    }
  }

  /** DTO → 实体 JSON：顺带给缺 ID 的组件补一个，前端拖拽要靠它定位 */
  private toContent(dto: SaveAppConfigDto): AppConfigContent {
    return {
      theme: { ...dto.theme },
      sections: dto.sections.map((section) => ({
        id: section.id?.trim() || randomUUID(),
        key: section.key,
        visible: section.visible,
        props: section.props ?? {},
      })),
    };
  }

  private assertStructurallyValid(content: AppConfigContent): void {
    const errors = validateAppConfigContent(content, false);
    if (errors.length > 0) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, errors.join('；'));
    }
  }

  private assertValidForPublish(content: AppConfigContent): void {
    const errors = validateAppConfigContent(content, true);
    if (errors.length > 0) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, `无法发布：${errors.join('；')}`);
    }
  }
}

/** 兜底配置：与常量表同一份，避免两处默认值漂移 */
const DEFAULT_CONTENT = DEFAULT_APP_CONFIG_CONTENT;
