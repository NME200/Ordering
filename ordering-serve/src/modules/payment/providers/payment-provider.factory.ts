import { PAYMENT_CHANNEL_LABELS, PaymentChannel } from '../../../shared/enums/payment-channel.enum';
import { MockPaymentProvider } from './mock-payment.provider';
import { OfflinePaymentProvider } from './offline-payment.provider';
import { PaymentProvider } from './payment-provider.interface';
import { readWechatSettings, WechatPaymentProvider } from './wechat-payment.provider';

/** 构建结果：明确区分「造出来了」和「为什么不能挂载」，便于日志定位 */
export type BuildProviderOutcome =
  | { ok: true; provider: PaymentProvider }
  | { ok: false; reason: string };

/**
 * 按渠道 + 已解密配置构造渠道实现。
 *
 * 分支集中在这里，注册表本身保持与渠道无关 —— 接一个真实渠道时只改这一处：
 * 实现 PaymentProvider、把 META 的 implemented 置为 true、在这里 return 出实例。
 */
export function buildProvider(
  channel: PaymentChannel,
  settings: Record<string, string>,
): BuildProviderOutcome {
  const label = PAYMENT_CHANNEL_LABELS[channel];

  switch (channel) {
    case PaymentChannel.OFFLINE:
      // 线下收款不需要任何凭据，永远可用
      return { ok: true, provider: new OfflinePaymentProvider() };

    case PaymentChannel.MOCK: {
      const secret = (settings.secret ?? '').trim();
      if (!secret) {
        // 空密钥会让 HMAC 退化成「谁都能算出合法签名」，必须拒绝挂载
        return { ok: false, reason: `${label} 未填写回调验签密钥` };
      }
      return { ok: true, provider: new MockPaymentProvider(secret) };
    }

    case PaymentChannel.WECHAT: {
      const wechat = readWechatSettings(settings);
      if (!wechat.ok) {
        // 点名缺了哪几项：运营对着「配置不完整」四个字是查不出问题的
        return { ok: false, reason: `${label} 缺少 ${wechat.missing.join('、')}` };
      }
      try {
        return { ok: true, provider: new WechatPaymentProvider(wechat.settings) };
      } catch (error) {
        return {
          ok: false,
          reason: `${label} 配置不可用：${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    case PaymentChannel.ALIPAY:
      // 配置已可在界面上维护，但真实签名 / 下单 / 回调验签尚未接入
      return { ok: false, reason: `${label} 配置已保存，渠道实现尚未接入` };

    default:
      return { ok: false, reason: `未知支付渠道：${channel}` };
  }
}
