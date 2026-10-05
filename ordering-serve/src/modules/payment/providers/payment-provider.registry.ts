import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../shared/enums/error-code.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import {
  PAYMENT_CHANNEL_LABELS,
  PaymentChannel,
} from '../../../shared/enums/payment-channel.enum';
import { PaymentConfig } from '../../payment-config/entities/payment-config.entity';
import { decodeSettings } from '../../payment-config/utils/settings.codec';
import { buildProvider } from './payment-provider.factory';
import { PaymentProvider } from './payment-provider.interface';

/**
 * 支付渠道注册表（**按数据库配置动态挂载**）。
 *
 * 与之前「模块构造时静态注册」的区别：现在渠道的启用状态与凭据都存在
 * payment_configs 表里，由平台管理端维护，保存后调用 reload() 即刻生效，
 * 不需要重启进程。
 *
 * 依赖方向：本类直接注入 PaymentConfig 仓储自行读取，而不是依赖
 * PaymentConfigService —— 配置服务要反过来调用 reload()，互相 import 会形成
 * 模块循环依赖。这与「PaymentModule 直接注入 Order 仓储」是同一个手法。
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private providers = new Map<PaymentChannel, PaymentProvider>();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PaymentConfig)
    private readonly configRepository: Repository<PaymentConfig>,
  ) {}

  /**
   * 依据数据库里的启用状态重建渠道集合。
   *
   * 任何单个渠道解析失败都只跳过它自己并记错误日志 —— 不能因为支付宝证书填坏了，
   * 就把已经在正常收款的线下收款和模拟渠道一起摘掉。
   */
  async reload(): Promise<void> {
    const isProduction = this.configService.getOrThrow<boolean>('app.isProduction');
    const masterKey = this.configService.get<string>('app.configSecret') ?? '';
    const rows = await this.configRepository.find();
    const next = new Map<PaymentChannel, PaymentProvider>();

    for (const row of rows) {
      const label = PAYMENT_CHANNEL_LABELS[row.channel];

      if (row.enabled !== CommonStatus.ENABLED) {
        continue;
      }
      // 模拟渠道不产生真实资金流，生产环境即使被误启用也不挂载
      if (isProduction && row.channel === PaymentChannel.MOCK) {
        this.logger.warn('生产环境：跳过模拟支付渠道');
        continue;
      }

      let provider: PaymentProvider | null = null;
      try {
        const settings = decodeSettings(row.settings, masterKey, label);
        const outcome = buildProvider(row.channel, settings);
        if (outcome.ok) {
          provider = outcome.provider;
        } else {
          this.logger.warn(`渠道未挂载：${outcome.reason}`);
          continue;
        }
      } catch (error) {
        this.logger.error(
          `渠道「${label}」配置解析失败，已跳过：${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      next.set(row.channel, provider);
    }

    this.providers = next;
    this.logger.log(`已挂载支付渠道：${next.size > 0 ? [...next.keys()].join(', ') : '（无）'}`);
  }

  /** 取渠道实现，未挂载则报错 */
  get(channel: PaymentChannel): PaymentProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_CHANNEL_UNSUPPORTED,
        `暂不支持支付渠道：${channel}`,
      );
    }
    return provider;
  }

  /** 全部已挂载渠道 */
  all(): PaymentProvider[] {
    return [...this.providers.values()];
  }

  /** 可供 C 端发起支付的在线渠道 */
  onlineChannels(): PaymentChannel[] {
    return this.all()
      .filter((provider) => provider.online)
      .map((provider) => provider.channel);
  }
}
