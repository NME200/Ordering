import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';

/**
 * 各支付渠道的配置字段定义 —— **唯一来源**。
 *
 * 同一份定义同时驱动三件事，避免它们互相漂移：
 * 1. 服务端保存时的必填 / 格式校验；
 * 2. 哪些字段属于密钥（入库前加密、任何读取接口只回传掩码）；
 * 3. 平台管理端表单的渲染（字段名、控件类型、帮助文案、条件必填）。
 *
 * 新增渠道 = 在这里加一段字段定义 + 实现对应 PaymentProvider，界面不用改。
 */

/** 字段控件类型 */
export type ChannelFieldType = 'text' | 'textarea' | 'select';

export interface ChannelFieldOption {
  value: string;
  label: string;
}

export interface ChannelField {
  /** 存进 settings JSON 的键名 */
  key: string;
  /** 界面标签 */
  label: string;
  type: ChannelFieldType;
  required: boolean;
  /**
   * 是否为敏感字段。
   * true 的字段：整个 settings 加密入库，且读取接口只返回掩码，
   * 前端提交时留空表示「保持原值不变」。
   */
  secret: boolean;
  /** 条件必填：仅当同一渠道内另一字段等于指定值时才必填 */
  requiredWhen?: { field: string; equals: string };
  /** type=select 时的候选值 */
  options?: ChannelFieldOption[];
  defaultValue?: string;
  placeholder?: string;
  /** 界面帮助文案，写清去哪儿拿、丢了怎么办 */
  help?: string;
  /** 格式校验正则（字符串形式，便于直接下发给前端复用） */
  pattern?: string;
  patternMessage?: string;
  maxLength?: number;
}

/** 支付宝加签方式：一个 APPID 只能选一种 */
export const ALIPAY_SIGN_MODE = {
  KEY: 'key',
  CERT: 'cert',
} as const;

/** 微信支付验签方式：平台证书与微信支付公钥二选一 */
export const WECHAT_VERIFY_MODE = {
  PLATFORM_CERT: 'platformCert',
  WECHAT_PAY_PUBLIC_KEY: 'wechatPayPublicKey',
} as const;

/** 证书类字段都是 PEM / 文本内容，直接粘贴，不做文件上传 */
const CERT_MAX_LENGTH = 20000;

const ALIPAY_FIELDS: ChannelField[] = [
  {
    key: 'appId',
    label: '应用 APPID',
    type: 'text',
    required: true,
    secret: false,
    placeholder: '2021000000000000',
    maxLength: 32,
    help: '开放平台创建应用后获得，形如 2088 开头或 16 位数字串。',
  },
  {
    key: 'signType',
    label: '签名算法',
    type: 'select',
    required: true,
    secret: false,
    defaultValue: 'RSA2',
    options: [
      { value: 'RSA2', label: 'RSA2（推荐）' },
      { value: 'RSA', label: 'RSA' },
    ],
  },
  {
    key: 'signMode',
    label: '接口加签方式',
    type: 'select',
    required: true,
    secret: false,
    defaultValue: ALIPAY_SIGN_MODE.KEY,
    options: [
      { value: ALIPAY_SIGN_MODE.KEY, label: '密钥模式' },
      { value: ALIPAY_SIGN_MODE.CERT, label: '证书模式' },
    ],
    help: '一个 APPID 只能配置一种。红包、转账到支付宝账户等资金支出类场景必须用证书模式。',
  },
  {
    key: 'appPrivateKey',
    label: '应用私钥',
    type: 'textarea',
    required: true,
    secret: true,
    maxLength: CERT_MAX_LENGTH,
    placeholder: '-----BEGIN RSA PRIVATE KEY-----',
    help: '用于对请求加签。务必妥善保管，遗失或泄露只能在开放平台重新申请并替换。',
  },
  {
    key: 'alipayPublicKey',
    label: '支付宝公钥',
    type: 'textarea',
    required: false,
    secret: true,
    requiredWhen: { field: 'signMode', equals: ALIPAY_SIGN_MODE.KEY },
    maxLength: CERT_MAX_LENGTH,
    help: '密钥模式必填，用于验证支付宝返回的同步 / 异步消息。',
  },
  {
    key: 'appPublicCert',
    label: '应用公钥证书',
    type: 'textarea',
    required: false,
    secret: true,
    requiredWhen: { field: 'signMode', equals: ALIPAY_SIGN_MODE.CERT },
    maxLength: CERT_MAX_LENGTH,
    help: '证书模式必填：上传 CSR 后由 CA 颁发的 .crt 文件内容，须与上面的应用私钥匹配。',
  },
  {
    key: 'alipayPublicCert',
    label: '支付宝公钥证书',
    type: 'textarea',
    required: false,
    secret: true,
    requiredWhen: { field: 'signMode', equals: ALIPAY_SIGN_MODE.CERT },
    maxLength: CERT_MAX_LENGTH,
  },
  {
    key: 'alipayRootCert',
    label: '支付宝根证书',
    type: 'textarea',
    required: false,
    secret: true,
    requiredWhen: { field: 'signMode', equals: ALIPAY_SIGN_MODE.CERT },
    maxLength: CERT_MAX_LENGTH,
    help: '证书模式必填，用于校验支付宝证书链。三类证书有效期一般 5 年，到期前需更换。',
  },
  {
    key: 'gateway',
    label: '网关地址',
    type: 'text',
    required: true,
    secret: false,
    defaultValue: 'https://openapi.alipay.com/gateway.do',
    maxLength: 255,
  },
  {
    key: 'notifyUrl',
    label: '异步通知地址',
    type: 'text',
    required: true,
    secret: false,
    placeholder: 'https://your-domain.com/api/v1/payments/callback/alipay',
    maxLength: 255,
    help: '必须是公网可访问的 https 地址，且路径与本系统的回调路由一致。',
  },
  {
    key: 'contentEncryptKey',
    label: '接口内容加密密钥',
    type: 'text',
    required: false,
    secret: true,
    maxLength: 64,
    help: '可选。仅在开放平台开启了接口内容加密时才需要填写（AES 密钥）。',
  },
];

const WECHAT_FIELDS: ChannelField[] = [
  {
    key: 'mchId',
    label: '商户号 MCHID',
    type: 'text',
    required: true,
    secret: false,
    placeholder: '1600000000',
    maxLength: 32,
  },
  {
    key: 'appId',
    label: 'AppID',
    type: 'text',
    required: true,
    secret: false,
    placeholder: 'wx0000000000000000',
    maxLength: 32,
    help: 'JSAPI 支付要求是与商户号已绑定的、已认证的服务号或政府 / 媒体类公众号。',
  },
  {
    key: 'apiV3Key',
    label: 'APIv3 密钥',
    type: 'text',
    required: true,
    secret: true,
    maxLength: 32,
    pattern: '^[A-Za-z0-9]{32}$',
    patternMessage: 'APIv3 密钥必须是 32 位字母数字组合',
    help: '用于解密回调通知数据。商户平台「账户中心 → API 安全 → APIv3 密钥」设置，一旦丢失只能重设。',
  },
  {
    key: 'certSerialNo',
    label: '商户 API 证书序列号',
    type: 'text',
    required: true,
    secret: false,
    placeholder: '5B5DXXXXXXXX8F2A1C0D3E4F5A6B7C8D9E0F1A2B3C4D',
    maxLength: 128,
    help: '与下面的商户私钥必须成对，否则签名验不过。最多 3 份证书可同时生效。',
  },
  {
    key: 'privateKey',
    label: '商户私钥',
    type: 'textarea',
    required: true,
    secret: true,
    maxLength: CERT_MAX_LENGTH,
    placeholder: '-----BEGIN PRIVATE KEY-----',
    help: 'apiclient_key.pem 的内容，用于生成 V3 请求签名。一旦丢失无法找回，只能重新申请证书。',
  },
  {
    key: 'verifyMode',
    label: '验签方式',
    type: 'select',
    required: true,
    secret: false,
    defaultValue: WECHAT_VERIFY_MODE.WECHAT_PAY_PUBLIC_KEY,
    options: [
      { value: WECHAT_VERIFY_MODE.PLATFORM_CERT, label: '平台证书' },
      { value: WECHAT_VERIFY_MODE.WECHAT_PAY_PUBLIC_KEY, label: '微信支付公钥（推荐）' },
    ],
    help: '同一商户号二者选其一。微信支付公钥无过期时间、维护更简单，官方推荐使用。',
  },
  {
    key: 'platformCert',
    label: '平台证书',
    type: 'textarea',
    required: false,
    secret: true,
    requiredWhen: { field: 'verifyMode', equals: WECHAT_VERIFY_MODE.PLATFORM_CERT },
    maxLength: CERT_MAX_LENGTH,
    placeholder: '-----BEGIN CERTIFICATE-----',
    help: 'wechatpay_cert.pem 内容。有效期 5 年且不可续期，需实现平滑更换；也可由 /v3/certificates 下载。',
  },
  {
    key: 'wechatPayPublicKey',
    label: '微信支付公钥',
    type: 'textarea',
    required: false,
    secret: true,
    requiredWhen: { field: 'verifyMode', equals: WECHAT_VERIFY_MODE.WECHAT_PAY_PUBLIC_KEY },
    maxLength: CERT_MAX_LENGTH,
    placeholder: '-----BEGIN PUBLIC KEY-----',
    help: 'pub_key.pem 内容，无过期时间。',
  },
  {
    key: 'wechatPayPublicKeyId',
    label: '微信支付公钥 ID',
    type: 'text',
    required: false,
    secret: false,
    requiredWhen: { field: 'verifyMode', equals: WECHAT_VERIFY_MODE.WECHAT_PAY_PUBLIC_KEY },
    maxLength: 64,
    placeholder: 'PUB_KEY_ID_00000000000000000000000000000000',
    help: '形如 PUB_KEY_ID_xxx，验签时需随请求头一起带上。',
  },
  {
    key: 'apiBase',
    label: '接口域名',
    type: 'text',
    required: true,
    secret: false,
    defaultValue: 'https://api.mch.weixin.qq.com',
    maxLength: 255,
  },
  {
    key: 'notifyUrl',
    label: '异步通知地址',
    type: 'text',
    required: true,
    secret: false,
    placeholder: 'https://your-domain.com/api/v1/payments/callback/wechat',
    maxLength: 255,
    help: '必须是公网可访问的 https 地址，且路径与本系统的回调路由一致。',
  },
];

const MOCK_FIELDS: ChannelField[] = [
  {
    key: 'secret',
    label: '回调验签密钥',
    type: 'text',
    required: true,
    secret: true,
    maxLength: 128,
    help: '模拟渠道用 HMAC-SHA256 验签回调，密钥串为 `${paymentNo}&${amount}&${transactionId}`。仅非生产环境挂载。',
  },
];

/** 线下收款不需要任何凭据 */
const OFFLINE_FIELDS: ChannelField[] = [];

/** 渠道 → 字段定义 */
export const CHANNEL_FIELDS: Record<PaymentChannel, ChannelField[]> = {
  [PaymentChannel.ALIPAY]: ALIPAY_FIELDS,
  [PaymentChannel.WECHAT]: WECHAT_FIELDS,
  [PaymentChannel.MOCK]: MOCK_FIELDS,
  [PaymentChannel.OFFLINE]: OFFLINE_FIELDS,
};

/** 按默认值生成一份空配置（非敏感字段带默认值，敏感字段留空） */
export function buildDefaultSettings(channel: PaymentChannel): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const field of CHANNEL_FIELDS[channel]) {
    settings[field.key] = field.secret ? '' : (field.defaultValue ?? '');
  }
  return settings;
}

/**
 * 判断某字段此刻是否必填。
 * 没有 requiredWhen 就是恒必填；有条件则取决于同一份配置里另一个字段的当前值。
 */
export function isFieldRequired(
  field: ChannelField,
  settings: Record<string, string>,
): boolean {
  if (!field.requiredWhen) {
    return field.required;
  }
  return settings[field.requiredWhen.field] === field.requiredWhen.equals;
}
