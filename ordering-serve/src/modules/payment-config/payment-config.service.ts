import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PaymentProviderRegistry } from '../payment/providers/payment-provider.registry';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import {
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_CHANNEL_VALUES,
  PaymentChannel,
} from '../../shared/enums/payment-channel.enum';
import {
  buildDefaultSettings,
  CHANNEL_FIELDS,
  isFieldRequired,
  type ChannelField,
} from './constants/channel-fields';
import {
  ChannelSchemaDto,
  PaymentConfigResponseDto,
} from './dto/payment-config-response.dto';
import { SavePaymentConfigDto } from './dto/save-payment-config.dto';
import { PaymentConfig } from './entities/payment-config.entity';
import { decodeSettings, encodeSettings } from './utils/settings.codec';

/** 校验结果：errors 是必须修正的问题，missingLabels 是尚未填写的必填项 */
interface ValidationOutcome {
  errors: string[];
  missingLabels: string[];
}

/**
 * 支付配置服务。
 *
 * 职责边界：
 * - 字段校验、加解密入库、掩码出参、启用前置检查 —— 都在这里；
 * - **绝不**把密钥原文放进任何返回值；
 * - 配置改动后调用 PaymentProviderRegistry.reload()，让渠道**不重启即刻生效**。
 *
 * 两种校验刻意区别对待：
 * - **格式不合法**（未知字段、类型不对、正则不符、下拉值越界、超长）→ 保存直接失败。
 *   「先完整校验、再落库」是项目既定规矩（菜品模块曾因先落库后校验留下脏数据）；
 * - **必填未填** → 允许保存为草稿，只记录 complete=false。
 *   运营常常是分几天从不同地方凑齐凭据（商户号、证书、私钥各在一处），
 *   拦着不让存只会逼人把半成品塞进 .env 绕过这套机制。
 *   风险由 setEnabled 的完整性检查兜住：**没填全就启用不了**。
 */
@Injectable()
export class PaymentConfigService implements OnModuleInit {
  private readonly logger = new Logger(PaymentConfigService.name);

  constructor(
    @InjectRepository(PaymentConfig)
    private readonly configRepository: Repository<PaymentConfig>,
    private readonly configService: ConfigService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  /** 启动时补齐 4 个渠道的配置行，并完成一次渠道注册表加载 */
  async onModuleInit(): Promise<void> {
    await this.ensureRows();
    await this.registry.reload();
  }

  // ==================== 查询 ====================

  /** 全渠道配置（敏感字段只回状态，不回原文） */
  async listAll(): Promise<PaymentConfigResponseDto[]> {
    const rows = await this.configRepository.find({ order: { id: 'ASC' } });

    return rows.map((row) => {
      const settings = this.readSettings(row);
      const fields = CHANNEL_FIELDS[row.channel];
      const { missingLabels } = this.validate(fields, settings);
      return PaymentConfigResponseDto.from(row, { fields, settings, missingLabels });
    });
  }

  /** 表单字段定义，供平台管理端动态渲染 */
  getSchema(): ChannelSchemaDto[] {
    return PAYMENT_CHANNEL_VALUES.map((channel) => {
      const dto = new ChannelSchemaDto();
      dto.channel = channel;
      dto.channelLabel = PAYMENT_CHANNEL_LABELS[channel];
      dto.fields = CHANNEL_FIELDS[channel];
      return dto;
    });
  }

  // ==================== 写入 ====================

  /** 保存某个渠道的配置 */
  async save(
    channel: PaymentChannel,
    dto: SavePaymentConfigDto,
    currentUser: AuthUser,
  ): Promise<PaymentConfigResponseDto> {
    const fields = CHANNEL_FIELDS[channel];
    const entity = await this.findOrCreate(channel);
    const merged = this.readSettings(entity);

    const errors: string[] = [];

    for (const [key, raw] of Object.entries(dto.settings)) {
      const field = fields.find((item) => item.key === key);
      // 未知键必须报错：静默丢弃会让运营以为保存成功了
      if (!field) {
        errors.push(`未知配置项「${key}」`);
        continue;
      }
      if (typeof raw !== 'string') {
        errors.push(`字段「${field.label}」的取值必须为字符串`);
        continue;
      }

      const value = raw.trim();
      // 敏感字段留空 = 保持原值不变（界面上本来就看不到原文，不该强迫重粘一次私钥）
      if (field.secret && value === '') {
        continue;
      }
      merged[key] = value;
    }

    if (errors.length > 0) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_CONFIG_FIELD_INVALID,
        errors.join('；'),
      );
    }

    const outcome = this.validate(fields, merged);
    if (outcome.errors.length > 0) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_CONFIG_FIELD_INVALID,
        outcome.errors.join('；'),
      );
    }

    entity.settings = encodeSettings(merged, this.masterKey);
    entity.remark = dto.remark?.trim() || null;
    entity.updatedBy = currentUser.userId;
    entity.updatedByName = currentUser.nickname;

    const saved = await this.configRepository.save(entity);
    await this.registry.reload();

    this.logger.log(`支付渠道配置已更新：${PAYMENT_CHANNEL_LABELS[channel]}（操作人 ${currentUser.username}）`);

    const { missingLabels } = this.validate(fields, merged);
    return PaymentConfigResponseDto.from(saved, { fields, settings: merged, missingLabels });
  }

  /**
   * 启用 / 停用某个渠道。
   *
   * 启用必须**先配置完整**：否则 C 端会出现一个点得动、但一定付不成功的渠道，
   * 对顾客和商户都只有坏处。
   */
  async setEnabled(
    channel: PaymentChannel,
    enabled: CommonStatus,
    currentUser: AuthUser,
  ): Promise<PaymentConfigResponseDto> {
    const entity = await this.findOrCreate(channel);
    const fields = CHANNEL_FIELDS[channel];
    const settings = this.readSettings(entity);
    const { missingLabels } = this.validate(fields, settings);

    if (enabled === CommonStatus.ENABLED && missingLabels.length > 0) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_CONFIG_FIELD_INVALID,
        `以下必填项还未配置，无法启用：${missingLabels.join('、')}`,
      );
    }

    entity.enabled = enabled;
    entity.updatedBy = currentUser.userId;
    entity.updatedByName = currentUser.nickname;

    const saved = await this.configRepository.save(entity);
    await this.registry.reload();

    this.logger.log(
      `支付渠道已${enabled === CommonStatus.ENABLED ? '启用' : '停用'}：` +
        `${PAYMENT_CHANNEL_LABELS[channel]}（操作人 ${currentUser.username}）`,
    );

    return PaymentConfigResponseDto.from(saved, { fields, settings, missingLabels });
  }

  // ==================== 内部辅助 ====================

  /**
   * 取主密钥。
   *
   * 缺失即拒绝 —— 宁可报错也不能退化成「不加密直接存」，
   * 那样私钥就明文躺在 MySQL 里了。
   */
  private get masterKey(): string {
    const secret = this.configService.get<string>('app.configSecret');
    if (!secret) {
      throw new BusinessException(
        ErrorCode.PAYMENT_CONFIG_KEY_UNAVAILABLE,
        '未配置 CONFIG_SECRET_KEY，无法安全保存支付渠道凭据',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return secret;
  }

  /** 解密某行配置；解密失败说明主密钥换过，必须报得明确 */
  private readSettings(entity: PaymentConfig): Record<string, string> {
    try {
      return decodeSettings(entity.settings, this.masterKey, PAYMENT_CHANNEL_LABELS[entity.channel]);
    } catch (error) {
      throw new BusinessException(
        ErrorCode.PAYMENT_CONFIG_KEY_UNAVAILABLE,
        error instanceof Error ? error.message : '支付渠道配置解密失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async findOrCreate(channel: PaymentChannel): Promise<PaymentConfig> {
    if (!PAYMENT_CHANNEL_VALUES.includes(channel)) {
      throw BusinessException.notFound(
        ErrorCode.PAYMENT_CONFIG_NOT_FOUND,
        `不支持的支付渠道：${channel}`,
      );
    }

    const existed = await this.configRepository.findOne({ where: { channel } });
    if (existed) {
      return existed;
    }
    return this.createRow(channel);
  }

  /** 首次使用时补齐渠道行 */
  private async createRow(channel: PaymentChannel): Promise<PaymentConfig> {
    // 线下收款不需要凭据、模拟渠道只在非生产默认开着，其余一律人工启用后再上线。
    // 注意模拟渠道虽然默认启用，但密钥为空时注册表不会挂载它（见 PaymentProviderFactory）。
    const enabledByDefault =
      channel === PaymentChannel.OFFLINE ||
      (channel === PaymentChannel.MOCK && !this.isProduction);

    const entity = this.configRepository.create({
      channel,
      enabled: enabledByDefault ? CommonStatus.ENABLED : CommonStatus.DISABLED,
      settings: encodeSettings(buildDefaultSettings(channel), this.masterKey),
      updatedBy: null,
      updatedByName: null,
      remark: null,
    });
    return this.configRepository.save(entity);
  }

  private get isProduction(): boolean {
    return this.configService.getOrThrow<boolean>('app.isProduction');
  }

  /** 幂等地保证 4 个渠道都有配置行 */
  private async ensureRows(): Promise<void> {
    for (const channel of PAYMENT_CHANNEL_VALUES) {
      const existed = await this.configRepository.exists({ where: { channel } });
      if (!existed) {
        await this.createRow(channel);
        this.logger.log(`已初始化支付渠道配置行：${PAYMENT_CHANNEL_LABELS[channel]}`);
      }
    }
  }

  /**
   * 按字段定义校验一份完整配置。
   *
   * 返回两组问题：
   * - errors：格式不对 / 取值非法 / 长度超限 / 下拉值不在候选里，必须修正；
   * - missingLabels：必填（含**条件必填**）尚未填写。
   *
   * 条件必填是支付宝与微信文档的硬要求：一个 APPID 只能选一种加签方式、
   * 验签方式在平台证书与微信支付公钥中二选一，所以必填与否取决于同一份配置里的另一个字段。
   */
  private validate(fields: ChannelField[], settings: Record<string, string>): ValidationOutcome {
    const errors: string[] = [];
    const missingLabels: string[] = [];

    for (const field of fields) {
      const value = (settings[field.key] ?? '').trim();

      if (isFieldRequired(field, settings) && value === '') {
        missingLabels.push(field.label);
        continue;
      }
      if (value === '') {
        continue;
      }

      if (field.maxLength && value.length > field.maxLength) {
        errors.push(`字段「${field.label}」超出长度上限 ${field.maxLength} 个字符`);
      }
      if (field.pattern && !new RegExp(field.pattern).test(value)) {
        errors.push(`字段「${field.label}」${field.patternMessage ?? '格式不正确'}`);
      }
      if (field.type === 'select') {
        const allowed = (field.options ?? []).map((option) => option.value);
        if (!allowed.includes(value)) {
          errors.push(`字段「${field.label}」的取值不在允许范围内：${allowed.join(' / ')}`);
        }
      }
    }

    return { errors, missingLabels };
  }
}
