/**
 * 支付渠道。
 *
 * 渠道能力由 `PaymentProvider` 实现（见 modules/payment/providers），
 * 每个渠道的**凭据与开关**由平台管理端在「支付配置」里维护，存 payment_configs 表。
 */
export enum PaymentChannel {
  /** 线下收款（现金 / 收款码），由商户手动标记 */
  OFFLINE = 'offline',
  /** 模拟在线支付：用于开发联调，验签逻辑与真实渠道一致 */
  MOCK = 'mock',
  /** 微信支付（V3：JSAPI / Native 下单 + 平台证书或微信支付公钥验签） */
  WECHAT = 'wechat',
  /** 支付宝（OpenAPI：RSA2 加签，密钥或证书两种模式） */
  ALIPAY = 'alipay',
}

/** 支付渠道中文名 */
export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
  [PaymentChannel.OFFLINE]: '线下收款',
  [PaymentChannel.MOCK]: '模拟支付',
  [PaymentChannel.WECHAT]: '微信支付',
  [PaymentChannel.ALIPAY]: '支付宝',
};

/** 渠道静态属性 */
export interface PaymentChannelMeta {
  /** 是否在线渠道（可被 C 端用于发起支付） */
  online: boolean;
  /**
   * 服务端是否已接入该渠道的真实实现。
   * false 时「支付配置」可以照常保存与启用，但注册表不会挂载它，
   * 界面必须明确标出「配置已保存，渠道实现待接入」，不能让运营误以为开了就能收钱。
   */
  implemented: boolean;
  /** 界面上的说明文案 */
  description: string;
}

export const PAYMENT_CHANNEL_META: Record<PaymentChannel, PaymentChannelMeta> = {
  [PaymentChannel.OFFLINE]: {
    online: false,
    implemented: true,
    description: '现金 / 收款码等场外收款，由收银员或商户在订单上手动标记收款，无需任何凭据。',
  },
  [PaymentChannel.MOCK]: {
    online: true,
    implemented: true,
    description:
      '联调渠道：签名算法与真实渠道一致（HMAC-SHA256），用于本地跑通下单→支付→回调→退款全链路。生产环境不会挂载。',
  },
  [PaymentChannel.WECHAT]: {
    online: true,
    implemented: false,
    description:
      '微信支付 V3。需要商户号、AppID、APIv3 密钥、商户 API 证书序列号与商户私钥，验签方式在平台证书与微信支付公钥中二选一。',
  },
  [PaymentChannel.ALIPAY]: {
    online: true,
    implemented: false,
    description:
      '支付宝 OpenAPI。一个 APPID 只能配置一种加签方式：密钥模式需应用私钥与支付宝公钥，证书模式还需三份证书文件。',
  },
};

/** 渠道枚举全部取值 */
export const PAYMENT_CHANNEL_VALUES: PaymentChannel[] = [
  PaymentChannel.OFFLINE,
  PaymentChannel.MOCK,
  PaymentChannel.WECHAT,
  PaymentChannel.ALIPAY,
];
