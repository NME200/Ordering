import { Logger } from '@nestjs/common';
import { X509Certificate } from 'node:crypto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../shared/enums/error-code.enum';
import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';
import { WECHAT_VERIFY_MODE } from '../../payment-config/constants/channel-fields';
import {
  aesGcmDecrypt,
  buildAuthorizationHeader,
  buildCallbackMessage,
  buildRequestMessage,
  randomNonce,
  rsaSign,
  rsaVerify,
  timestampSeconds,
  WechatCryptoError,
} from '../utils/wechat-crypto.util';
import type {
  CallbackInput,
  CallbackResult,
  PaymentProvider,
  PrepayInput,
  PrepayResult,
  RefundInput,
  RefundResult,
} from './payment-provider.interface';

/**
 * 微信支付 V3（JSAPI / 小程序下单）。
 *
 * 三条实现前提，改这里之前先看清楚：
 * 1. **签名只在服务端**。商户私钥永不出服务端，下发给小程序的 payParams 里
 *    只有 appId / timeStamp / nonceStr / package / signType / paySign 六个字段，
 *    拿到它们也只能付自己这一单，改不了金额（金额在 prepay_id 上已经定死）。
 * 2. **回调必须验签 + 解密后仍然核对商户号**。验签只证明「报文来自微信」，
 *    `mchid` 不符说明这把 APIv3 密钥被复用在别的商户号上了，一律不认。
 * 3. **平台证书模式不做自动轮换**。官方推荐用「微信支付公钥」（无有效期），
 *    配置界面的默认值就是它。填了平台证书的话，证书到期（5 年、不可续期）
 *    要在「支付配置」里手工换一张，本实现不会去 `/v3/certificates` 自取。
 */

/** 一次渠道请求的超时：微信接口偶发挂住，不能让顾客对着转圈的收银台 */
const REQUEST_TIMEOUT_MS = 10_000;
/** 回调通知的可接受时间偏差（秒）。官方建议 5 分钟 */
const CALLBACK_MAX_AGE_SECONDS = 300;

/** 微信支付回传的错误结构，只取用得上的三项 */
interface WechatErrorBody {
  code?: string;
  message?: string;
  detail?: { type?: string };
}

/** 解密后的支付结果通知明文（字段名保持微信原样） */
interface WechatTransactionResource {
  mchid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  success_time?: string;
  amount?: { total?: number; payer_total?: number };
}

/** 解密后的退款结果通知明文 */
interface WechatRefundResource {
  mchid?: string;
  out_refund_no?: string;
  refund_id?: string;
  refund_status?: string;
}

/** 数据库里那份微信配置（settings JSON 解密后的扁平结构） */
export interface WechatPaySettings {
  mchId: string;
  appId: string;
  apiV3Key: string;
  certSerialNo: string;
  privateKey: string;
  verifyMode: string;
  platformCert: string;
  wechatPayPublicKey: string;
  wechatPayPublicKeyId: string;
  apiBase: string;
  notifyUrl: string;
}

/** 必填字段：少一个就签不出合法请求，宁可不挂载也别半路炸 */
const REQUIRED_FIELDS: Array<{ key: keyof WechatPaySettings; label: string }> = [
  { key: 'mchId', label: '商户号 MCHID' },
  { key: 'appId', label: 'AppID' },
  { key: 'apiV3Key', label: 'APIv3 密钥' },
  { key: 'certSerialNo', label: '商户 API 证书序列号' },
  { key: 'privateKey', label: '商户私钥' },
  { key: 'apiBase', label: '接口域名' },
  { key: 'notifyUrl', label: '异步通知地址' },
];

/**
 * 把原始配置收成可用形状，同时报出缺了哪几项。
 *
 * 校验放在这里而不是依赖保存时的校验：字段是后来加的，
 * 库里可能存着没有新字段的旧配置，那种情况下必须「不挂载 + 日志点名」，
 * 而不是挂载一个每次签名都失败的渠道。
 */
export function readWechatSettings(
  raw: Record<string, string>,
): { ok: true; settings: WechatPaySettings } | { ok: false; missing: string[] } {
  const settings: WechatPaySettings = {
    mchId: (raw.mchId ?? '').trim(),
    appId: (raw.appId ?? '').trim(),
    apiV3Key: raw.apiV3Key ?? '',
    certSerialNo: (raw.certSerialNo ?? '').trim(),
    privateKey: raw.privateKey ?? '',
    verifyMode: (raw.verifyMode ?? WECHAT_VERIFY_MODE.WECHAT_PAY_PUBLIC_KEY).trim(),
    platformCert: raw.platformCert ?? '',
    wechatPayPublicKey: raw.wechatPayPublicKey ?? '',
    wechatPayPublicKeyId: (raw.wechatPayPublicKeyId ?? '').trim(),
    apiBase: (raw.apiBase ?? '').trim().replace(/\/+$/, ''),
    notifyUrl: (raw.notifyUrl ?? '').trim(),
  };

  const missing = REQUIRED_FIELDS.filter((field) => !settings[field.key]).map((field) => field.label);

  // 验签方式决定「拿什么验回调」，这一项没填等于回调一律验不过，必须早点说
  if (settings.verifyMode === WECHAT_VERIFY_MODE.PLATFORM_CERT) {
    if (!settings.platformCert.trim()) {
      missing.push('平台证书');
    }
  } else if (!settings.wechatPayPublicKey.trim() || !settings.wechatPayPublicKeyId) {
    missing.push('微信支付公钥', '微信支付公钥 ID');
  }

  return missing.length > 0 ? { ok: false, missing } : { ok: true, settings };
}

export class WechatPaymentProvider implements PaymentProvider {
  readonly channel = PaymentChannel.WECHAT;
  readonly online = true;

  private readonly logger = new Logger(WechatPaymentProvider.name);
  /** 验签用密钥（PEM 证书或公钥） */
  private readonly verifyKeyPem: string;
  /** 回调头里 Wechatpay-Serial 必须等于它，否则说明对不上号 */
  private readonly expectedSerial: string;

  constructor(private readonly settings: WechatPaySettings) {
    if (settings.verifyMode === WECHAT_VERIFY_MODE.PLATFORM_CERT) {
      this.verifyKeyPem = settings.platformCert;
      // 平台证书模式下序列号取自证书本身，不额外要运营填一遍（填了也可能和证书不一致）
      try {
        this.expectedSerial = new X509Certificate(settings.platformCert).serialNumber.toUpperCase();
      } catch {
        throw new WechatCryptoError('平台证书不是可用的 PEM，请粘贴 wechatpay_cert.pem 全文');
      }
    } else {
      this.verifyKeyPem = settings.wechatPayPublicKey;
      this.expectedSerial = settings.wechatPayPublicKeyId;
    }
  }

  /**
   * JSAPI 下单并换成小程序端 `wx.requestPayment` 的六个参数。
   *
   * 待签名的第四行是 **package 的值本身**（`prepay_id=xxx`），不是 `package=prepay_id=xxx`，
   * 也不做 URL 编码 —— 这两点是这里最容易写错且只在真机上才暴露的地方。
   */
  async prepay(input: PrepayInput): Promise<PrepayResult> {
    if (!input.openId) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_CHANNEL_ERROR,
        '微信支付需要顾客在本小程序内的 openid，请先在「我的」里完成微信登录',
      );
    }
    // 微信不支持 0 元单，全额抵扣的单子只能走线下收款，别把「付 0 元」的锅甩给微信
    if (input.amount <= 0) {
      throw BusinessException.badRequest(ErrorCode.ORDER_AMOUNT_INVALID, '这一单应付 0 元，请到前台付款');
    }

    const body = {
      appid: this.settings.appId,
      mchid: this.settings.mchId,
      description: clampBytes(input.description, 127),
      // out_trade_no 只允许 6–32 位数字字母与 _-|*，支付单号 P+日期+序号 正好落在里面
      out_trade_no: input.paymentNo,
      notify_url: this.settings.notifyUrl,
      payer: { openid: input.openId },
      amount: { total: input.amount, currency: 'CNY' },
      // scene_info 整块选填，但一旦带上 payer_client_ip / store_info.id 就变成必填，
      // 所以要么整块不给，要么给全 —— 这里先不给。
    };

    const created = await this.request<PrepayResponse>('POST', '/v3/pay/transactions/jsapi', body);
    const prepayId = String(created.prepay_id ?? '');
    if (!prepayId) {
      throw BusinessException.badRequest(ErrorCode.PAYMENT_CHANNEL_ERROR, '微信支付没有返回 prepay_id');
    }

    const timeStamp = timestampSeconds();
    const nonceStr = randomNonce();
    const packageValue = `prepay_id=${prepayId}`;
    const paySign = rsaSign({
      message: `${this.settings.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`,
      privateKeyPem: this.settings.privateKey,
    });

    return {
      prepayId,
      payParams: {
        channel: this.channel,
        paymentNo: input.paymentNo,
        appId: this.settings.appId,
        timeStamp,
        nonceStr,
        package: packageValue,
        signType: 'RSA',
        paySign,
      },
    };
  }

  /**
   * 回调：验签 → 解密 → 核对商户号 → 归一化成支付结果。
   *
   * 验签串是 `Timestamp\nNonce\n原始请求体\n`，与请求签名不同一条，
   * 且必须用 rawBody（重新序列化过的 JSON 与原文差一个空格就验不过）。
   */
  async verifyAndParseCallback(input: CallbackInput): Promise<CallbackResult> {
    const headers = normalizeHeaders(input.headers);
    const signature = headers['wechatpay-signature'];
    const nonce = headers['wechatpay-nonce'];
    const timestamp = headers['wechatpay-timestamp'];
    const serial = headers['wechatpay-serial'];

    if (!signature || !nonce || !timestamp || !serial) {
      return this.callbackFailure('回调缺少 Wechatpay-Signature / Nonce / Timestamp / Serial 请求头');
    }
    // 时间戳时效窗口：超过 5 分钟的通知一律不认。
    // 不做这一步的话，抓到任意一条历史回调就能无限重放（幂等分支只回读成功单、
    // 不改状态，所以危害限于信息回显，但"永远有效"这件事本身就不该存在）。
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > CALLBACK_MAX_AGE_SECONDS) {
      return this.callbackFailure('回调时间戳超出可接受窗口（本机与渠道时钟偏差超过 5 分钟）');
    }
    if (serial.toUpperCase() !== this.expectedSerial.toUpperCase()) {
      return this.callbackFailure('回调的 Wechatpay-Serial 与本系统配置的微信密钥不是同一把');
    }

    let verified = false;
    try {
      verified = rsaVerify({
        message: buildCallbackMessage(timestamp, nonce, input.rawBody),
        signature,
        keyPem: this.verifyKeyPem,
      });
    } catch (error) {
      return this.callbackFailure(error instanceof Error ? error.message : '验签密钥不可用');
    }
    if (!verified) {
      return this.callbackFailure('回调签名校验失败');
    }

    let eventType = '';
    let resource: WechatResourceShape | null = null;
    try {
      const envelope = JSON.parse(input.rawBody) as { event_type?: string; resource?: WechatResourceShape };
      eventType = String(envelope.event_type ?? '');
      resource = envelope.resource ?? null;
    } catch {
      return this.callbackFailure('回调请求体不是合法 JSON');
    }
    if (!resource?.ciphertext || !resource.nonce) {
      return this.callbackFailure('回调缺少 resource.ciphertext / nonce');
    }

    let plain: WechatTransactionResource & WechatRefundResource;
    try {
      plain = JSON.parse(
        aesGcmDecrypt({
          key: this.settings.apiV3Key,
          nonce: String(resource.nonce),
          associatedData: String(resource.associated_data ?? ''),
          ciphertext: String(resource.ciphertext),
        }),
      ) as WechatTransactionResource & WechatRefundResource;
    } catch (error) {
      return this.callbackFailure(error instanceof Error ? error.message : '回调解密失败');
    }

    if (String(plain.mchid ?? '') !== this.settings.mchId) {
      return this.callbackFailure('回调里的商户号与本系统配置不一致');
    }

    const isRefundEvent = eventType.startsWith('REFUND.') || plain.out_refund_no !== undefined;
    if (isRefundEvent) {
      // 退款结果交给上层回写支付单：只记一行日志的话，异步退款会永远停在「处理中」
      const refundStatus = String(plain.refund_status ?? '');
      this.logger.log(`微信支付退款结果通知：${String(plain.out_refund_no ?? '')} ${refundStatus}`);
      return {
        success: true,
        ignore: true,
        paymentNo: '',
        transactionId: '',
        amount: 0,
        refundNo: String(plain.out_refund_no ?? ''),
        refundSucceeded: refundStatus === 'SUCCESS',
      };
    }

    const tradeState = String(plain.trade_state ?? '');
    if (tradeState !== 'SUCCESS') {
      // NOTPAY / CLOSED / PAYERROR 这些状态没有「把这一单改成已支付」这件事可做，确认收到
      this.logger.warn(`微信支付通知 trade_state=${tradeState}，不推进支付单`);
      return { success: true, ignore: true, paymentNo: '', transactionId: '', amount: 0 };
    }

    const paymentNo = String(plain.out_trade_no ?? '');
    const amount = Number(plain.amount?.total);
    if (!paymentNo) {
      return this.callbackFailure('回调缺少 out_trade_no');
    }
    if (!Number.isInteger(amount)) {
      return this.callbackFailure('回调缺少 amount.total');
    }

    return { success: true, paymentNo, transactionId: String(plain.transaction_id ?? ''), amount };
  }

  /**
   * 申请退款。只支持整单全额退（与商户端界面上的口径一致）。
   *
   * PROCESSING 单独回一句「处理中」：它既不是成功也不是失败，
   * 而上层只有这两态 —— 落 FAILED 会放开再次退款的口子，
   * 所以提示里必须写清楚别重复发起，由人工去支付流水里核对。
   */
  async refund(input: RefundInput): Promise<RefundResult> {
    const body = {
      out_trade_no: input.paymentNo,
      transaction_id: input.transactionId ?? undefined,
      out_refund_no: input.refundNo,
      reason: clampBytes(input.reason, 80),
      notify_url: this.settings.notifyUrl,
      amount: { refund: input.amount, total: input.amount, currency: 'CNY' },
    };

    const result = await this.request<RefundResponse>('POST', '/v3/refund/domestic/refunds', body);
    const status = String(result.status ?? '');
    const refundId = String(result.refund_id ?? '');

    if (status === 'SUCCESS') {
      return { success: true, refundTransactionId: refundId };
    }
    if (status === 'PROCESSING') {
      // 渠道已受理，终态稍后用退款结果通知回写。标成 pending 让上层保持「处理中」，
      // 绝不能算失败 —— 那样会放开用新退款单号再退一次的口子。
      return {
        success: false,
        pending: true,
        refundTransactionId: refundId,
        message: '微信已受理退款，结果稍后到账（渠道会另行通知）',
      };
    }
    return { success: false, refundTransactionId: refundId, message: `微信退款未成功（${status || '渠道未返回状态'}）` };
  }

  // ==================== 内部 ====================

  private callbackFailure(message: string): CallbackResult {
    this.logger.warn(`微信支付回调被拒：${message}`);
    return { success: false, paymentNo: '', transactionId: '', amount: 0, message };
  }

  private async request<T extends object>(
    method: 'GET' | 'POST',
    pathWithQuery: string,
    payload?: unknown,
  ): Promise<T> {
    const body = payload === undefined ? '' : JSON.stringify(payload);
    const timestamp = timestampSeconds();
    const nonce = randomNonce();

    let signature: string;
    try {
      signature = rsaSign({
        message: buildRequestMessage(method, pathWithQuery, timestamp, nonce, body),
        privateKeyPem: this.settings.privateKey,
      });
    } catch (error) {
      throw error instanceof WechatCryptoError
        ? BusinessException.badRequest(ErrorCode.PAYMENT_CHANNEL_ERROR, error.message)
        : error;
    }

    let response: Response;
    try {
      response = await fetch(`${this.settings.apiBase}${pathWithQuery}`, {
        method,
        headers: {
          Authorization: buildAuthorizationHeader({
            mchId: this.settings.mchId,
            serialNo: this.settings.certSerialNo,
            nonce,
            timestamp,
            signature,
          }),
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'ordering-serve/1.0',
        },
        body: body || undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // 连不上微信和签名被拒是两件事，前者多半是本机网络或域名填错
      const reason = error instanceof Error ? error.message : String(error);
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_CHANNEL_ERROR,
        `连不上微信支付接口（${this.settings.apiBase}）：${reason}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      let detail: WechatErrorBody = {};
      try {
        detail = JSON.parse(text) as WechatErrorBody;
      } catch {
        // 非 JSON 的错误页（多半是被网关挡了），按原样回显状态码
      }
      const code = String(detail.code ?? `HTTP_${response.status}`);
      const message = String(detail.message ?? text.slice(0, 200));
      this.logger.error(`微信支付接口 ${pathWithQuery} 失败：${code} ${message}`);
      throw BusinessException.badRequest(ErrorCode.PAYMENT_CHANNEL_ERROR, `微信支付 ${code}：${message}`);
    }

    if (!text) {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw BusinessException.badRequest(ErrorCode.PAYMENT_CHANNEL_ERROR, '微信支付返回了读不懂的响应');
    }
  }
}

/** JSAPI 下单响应 */
interface PrepayResponse {
  prepay_id?: string;
}

/** 退款申请响应 */
interface RefundResponse {
  status?: string;
  refund_id?: string;
  out_refund_no?: string;
}

interface WechatResourceShape {
  algorithm?: string;
  ciphertext?: string;
  nonce?: string;
  associated_data?: string;
}

/** 请求头一律小写比对：Node 收到的 header key 就是小写，但渠道侧大小写不作准 */
function normalizeHeaders(headers: CallbackInput['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined) {
      out[key.toLowerCase()] = single;
    }
  }
  return out;
}

/**
 * 按 UTF-8 字节数截断。
 *
 * 微信的 127 / 80 都是**字节**上限，中文一个字 3 字节，
 * 按字符截会留半个字，而半个字的 UTF-8 会让签名串和报文对不上。
 */
function clampBytes(text: string, maxBytes: number): string {
  const source = text ?? '';
  if (Buffer.byteLength(source, 'utf8') <= maxBytes) {
    return source;
  }
  let bytes = 0;
  let cut = 0;
  for (const char of source) {
    bytes += Buffer.byteLength(char, 'utf8');
    if (bytes > maxBytes) {
      break;
    }
    cut += char.length;
  }
  return source.slice(0, cut);
}
