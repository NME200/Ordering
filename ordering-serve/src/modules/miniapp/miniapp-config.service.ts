import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { decryptSecret, encryptSecret } from '../../shared/utils/crypto.util';
import { MINIAPP_CONFIG_KEY, type MiniappEnvVersion } from './constants/miniapp.constants';
import { MiniappConfig } from './entities/miniapp-config.entity';
import { MiniappConfigResponseDto, SaveMiniappConfigDto } from './dto/miniapp-config.dto';
import { WechatApiError, WechatMiniappClient } from './wechat-miniapp.client';

/**
 * 小程序凭据读写（平台级，全平台一份）。
 *
 * 这里只管 AppID / AppSecret：桌码的 scene 与落地页是服务端固定口径，
 * 出码动作在商家自己的后台（见 store 模块的 StoreTableQrcodeService）。
 *
 * 密钥的去向：AppSecret 只以 AES-256-GCM 密文入库，对外只回「是否已配置」。
 * 明文只在服务进程内存里存在，`readCredentials()` 是 internal 的，
 * 任何 controller 都不许把它回出去。
 */
@Injectable()
export class MiniappConfigService {
  private readonly logger = new Logger(MiniappConfigService.name);

  constructor(
    @InjectRepository(MiniappConfig)
    private readonly configRepository: Repository<MiniappConfig>,
    private readonly configService: ConfigService,
    private readonly wechat: WechatMiniappClient,
  ) {}

  /** 首次使用时补出那一行 */
  async ensureRow(): Promise<MiniappConfig> {
    const existed = await this.configRepository.findOne({ where: { configKey: MINIAPP_CONFIG_KEY } });
    if (existed) {
      return existed;
    }
    return this.configRepository.save(
      this.configRepository.create({
        configKey: MINIAPP_CONFIG_KEY,
        appId: null,
        settings: null,
        updatedBy: null,
        updatedByName: null,
        remark: null,
      }),
    );
  }

  async current(): Promise<MiniappConfigResponseDto> {
    return this.toDto(await this.ensureRow());
  }

  async save(dto: SaveMiniappConfigDto, currentUser: AuthUser): Promise<MiniappConfigResponseDto> {
    const row = await this.ensureRow();

    if (dto.appId !== undefined) {
      const appId = dto.appId.trim();
      if (appId && !appId.startsWith('wx')) {
        throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, 'AppID 应以 wx 开头');
      }
      row.appId = appId || null;
    }
    if (dto.envVersion !== undefined) {
      row.envVersion = dto.envVersion as MiniappEnvVersion;
    }
    if (dto.remark !== undefined) {
      row.remark = dto.remark.trim() || null;
    }

    const secrets = this.readSecrets(row);
    const nextSecret = dto.appSecret?.trim();
    if (nextSecret) {
      // 只有真的动过密钥才取主密钥重新加密 —— 主密钥缺失不该拦住「只改备注」这种操作
      secrets.appSecret = nextSecret;
      row.settings = encryptSecret(JSON.stringify(secrets), this.masterKey);
    }

    row.updatedBy = currentUser.userId;
    row.updatedByName = currentUser.nickname;

    const saved = await this.configRepository.save(row);
    // 凭据或 AppID 变了，缓存的 access_token 必须作废，否则会拿旧票去调新号
    this.wechat.resetToken();
    this.logger.log(`小程序凭据已更新（操作人 ${currentUser.username}）`);

    return this.toDto(saved);
  }

  /**
   * 取凭据与出码版本，供出码、微信登录与「测试连接」使用。
   *
   * 配不齐直接抛 MINIAPP_CONFIG_INCOMPLETE —— 让调用方拿到一句能行动的话
   * （「平台还没配置小程序凭据」），而不是「生成失败」。
   */
  async readCredentials(): Promise<{ appId: string; appSecret: string; envVersion: MiniappEnvVersion }> {
    const row = await this.ensureRow();
    const appId = (row.appId ?? '').trim();
    const appSecret = (this.readSecrets(row).appSecret ?? '').trim();
    if (!appId || !appSecret) {
      throw BusinessException.badRequest(
        ErrorCode.MINIAPP_CONFIG_INCOMPLETE,
        '平台还没有配置小程序 AppID / AppSecret，微信登录、手机号绑定与桌码都用不了，请联系平台管理员',
      );
    }
    return { appId, appSecret, envVersion: row.envVersion };
  }

  /** 「测试连接」：用已存凭据换一次 access_token，把微信的原文错误带回界面 */
  async test(): Promise<{ ok: boolean; message: string }> {
    try {
      const { appId, appSecret } = await this.readCredentials();
      await this.wechat.accessToken(appId, appSecret);
      return {
        ok: true,
        message: '凭据可用，已换到 access_token。若顾客扫码打不开，请确认小程序已发布',
      };
    } catch (error) {
      if (error instanceof BusinessException || error instanceof WechatApiError) {
        return { ok: false, message: error.message };
      }
      return { ok: false, message: error instanceof Error ? error.message : '测试失败' };
    }
  }

  private toDto(row: MiniappConfig): MiniappConfigResponseDto {
    const appSecret = (this.readSecrets(row).appSecret ?? '').trim();
    return MiniappConfigResponseDto.from({
      appId: row.appId,
      appSecretConfigured: Boolean(appSecret),
      masterKeyReady: Boolean(this.configService.get<string>('app.configSecret')),
      envVersion: row.envVersion,
      remark: row.remark,
      updatedByName: row.updatedByName,
      updatedAt: row.updatedAt,
    });
  }

  /** 解出敏感项；密文解不开时给明确原因，别让运营以为配置凭空丢了 */
  private readSecrets(row: MiniappConfig): Record<string, string> {
    if (!row.settings) {
      return {};
    }
    let json: string;
    try {
      json = decryptSecret(row.settings, this.masterKey);
    } catch {
      throw BusinessException.badRequest(
        ErrorCode.MINIAPP_CONFIG_INCOMPLETE,
        '小程序凭据无法解密，通常是 CONFIG_SECRET_KEY 被更换所致，请重填 AppSecret',
      );
    }
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      result[key] = typeof value === 'string' ? value : String(value ?? '');
    }
    return result;
  }

  /** 主密钥缺失即拒绝写密钥，绝不退化成明文入库 */
  private get masterKey(): string {
    const secret = this.configService.get<string>('app.configSecret');
    if (!secret) {
      throw BusinessException.badRequest(
        ErrorCode.MINIAPP_CONFIG_INCOMPLETE,
        '未配置 CONFIG_SECRET_KEY，无法安全保存小程序 AppSecret',
      );
    }
    return secret;
  }
}
