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
import {
  APP_CONFIG_PAGE_KEYS,
  AppConfigPageKey,
  DEFAULT_APP_CONFIG_CONTENT,
} from './constants/app-config-schema';
import { AppConfig, AppConfigContent, AppConfigPages, AppConfigSection } from './entities/app-config.entity';
import { validateAppConfigContent } from './app-config.validator';

/**
 * 小程序布局配置服务。
 *
 * 生命周期是「草稿 → 发布 → 历史」，全平台同时只有一行 published：
 * 编辑只能改草稿，发布时把旧的生效行顶成历史 —— 所以**回滚就是对历史行再发布**，
 * 不需要额外的回滚接口与版本树。一行就是一份完整皮肤（主题 + 四个页面），
 * 这样才不会出现「首页已换肤、我的页还是旧的」。
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

  /**
   * 删掉一份方案（软删）。
   *
   * 草稿能删，**历史版本也能删**：运营手里攒一排「未命名方案 / 副本 副本」时，
   * 这些行根本不是可用的回滚落点，只是噪音。代价要在界面上讲清楚 —— 删掉的那一版回滚不到了。
   * 生效中的那一行永远不许删：删了 C 端直接没有配置可读。
   */
  async remove(id: number): Promise<void> {
    const config = await this.findByIdOrFail(id);
    if (config.status === AppConfigStatus.PUBLISHED) {
      throw BusinessException.badRequest(
        ErrorCode.PARAM_INVALID,
        '生效中的方案不能删除，请先发布另一份，再回来删它',
      );
    }
    await this.configRepository.softDelete(id);
  }

  /** 只改名字。三种状态都允许：名字是给人看的标签，不影响顾客读到什么 */
  async rename(id: number, name: string): Promise<AppConfigResponseDto> {
    const config = await this.findByIdOrFail(id);
    config.name = name.trim();
    return AppConfigResponseDto.from(await this.configRepository.save(config));
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
   * C 端读取：一次给全四页 + 主题，不带 pageKey。
   *
   * 按页发四个请求会把同一个限流桶消耗四次，而顾客小程序本来就在启动时一次性
   * 缓存整份皮肤；四个页面共享版本号，也才能保证「换肤不会出现半新半旧」。
   *
   * 没有发布过任何配置时回落到内置默认，小程序首启不能白屏；
   * **只装修了首页时，其余三页也各自回落到默认** —— 运营不该被迫摆满四页。
   * `clientVersion` 命中当前版本时只回 `{ unchanged: true }` —— 这份配置每次启动都要拉，
   * 而它几天才变一次。
   */
  async resolveForClient(clientVersion?: number): Promise<Record<string, unknown>> {
    const published = await this.findPublished();
    if (!published) {
      return { version: 0, publishedAt: null, ...DEFAULT_CONTENT };
    }

    if (clientVersion !== undefined && clientVersion === published.version) {
      return { version: published.version, unchanged: true };
    }

    const pages = {} as Record<AppConfigPageKey, unknown>;
    for (const page of APP_CONFIG_PAGE_KEYS) {
      const key = page as AppConfigPageKey;
      const configured = published.content.pages?.[key] ?? [];
      pages[key] = configured.length > 0 ? configured : DEFAULT_PAGES[key];
    }

    return {
      version: published.version,
      publishedAt: published.publishedAt,
      theme: { ...DEFAULT_THEME, ...(published.content.theme ?? {}) },
      pages,
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

  /** DTO → 实体 JSON：四页各自成组，顺带给缺 ID 的组件补一个，前端拖拽要靠它定位 */
  private toContent(dto: SaveAppConfigDto): AppConfigContent {
    const pages = {} as AppConfigPages;
    for (const page of APP_CONFIG_PAGE_KEYS) {
      const key = page as AppConfigPageKey;
      pages[key] = (dto.pages?.[key] ?? []).map(
        (section) =>
          ({
            id: section.id?.trim() || randomUUID(),
            key: section.key,
            visible: section.visible,
            props: dropBlankLinks(section.props ?? {}),
          }) satisfies AppConfigSection,
      );
    }
    return { theme: { ...dto.theme }, pages };
  }

  /** 结构校验：草稿也走这一层，格式错（颜色不是 hex、越界组件）当场就报 */
  private assertStructurallyValid(content: AppConfigContent): void {
    const errors = validateAppConfigContent(content, false);
    if (errors.length > 0) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, errors.join('；'));
    }
  }

  /** 发布前的完整性检查；报错文案带页面名，运营才知道去哪一页补 */
  private assertValidForPublish(content: AppConfigContent): void {
    const errors = validateAppConfigContent(content, true);
    if (errors.length > 0) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, `无法发布：${errors.join('；')}`);
    }
  }
}

/** 兜底配置：与常量表同一份，避免两处默认值漂移 */
const DEFAULT_CONTENT = DEFAULT_APP_CONFIG_CONTENT;

/** 按页回落用的默认组件与默认主题，同样只从常量表取 */
const DEFAULT_PAGES = DEFAULT_APP_CONFIG_CONTENT.pages;
const DEFAULT_THEME = DEFAULT_APP_CONFIG_CONTENT.theme;

/**
 * 把「留空」的跳转与背景图从 props 里摘掉。
 *
 * 装修器里清空一个下拉框会得到 `''`，而 `@IsOptional()` 只放过 null/undefined，
 * 空串会撞上 `link 需为 /pages/xxx/xxx` 这种格式错 —— 运营只是选了「不跳转」。
 * 在写库前统一转成「这个字段不存在」，C 端也就不会拿到一条空链接。
 */
const BLANKABLE_FIELDS = ['link', 'bgImage'];

function dropBlankLinks(node: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(node)) {
    if (BLANKABLE_FIELDS.includes(field) && (value === '' || value === null)) {
      continue;
    }
    if (Array.isArray(value)) {
      next[field] = value.map((item) =>
        item && typeof item === 'object' ? dropBlankLinks(item as Record<string, unknown>) : item,
      );
    } else if (value && typeof value === 'object') {
      next[field] = dropBlankLinks(value as Record<string, unknown>);
    } else {
      next[field] = value;
    }
  }
  return next;
}
