import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
  X509Certificate,
} from 'node:crypto';

/**
 * 微信支付 APIv3 的签名 / 验签 / 解密原语，只用 Node 内置 crypto 实现。
 *
 * 三条最容易踩、且踩了只会表现为「线上一直验不过」的地方，都在这里的注释里钉死：
 * 1. **请求签名与回调验签的串不一样**。请求是 `方法\nURL\n时间戳\n随机串\n请求体\n`，
 *    回调是 `时间戳\n随机串\n请求体\n`。URL 只取「域名之后」的部分且必须带 query，
 *    把整条 https://... 塞进去签名，微信侧永远报 SIGN_ERROR。
 * 2. **每一行后面都要有换行符**，包括最后一行（空请求体也是 `\n` 结尾）。
 * 3. **签名是 base64，不是 hex**。回调密文是 AES-256-GCM，
 *    认证标签在 base64 解码后的**末尾 16 字节**，得先切下来再解密。
 */

/** 商户私钥（apiclient_key.pem 全文） */
export interface RsaSignInput {
  message: string;
  privateKeyPem: string;
}

/** 验签用的微信侧密钥：平台证书（PEM 证书）或微信支付公钥（PEM 公钥）都可以 */
export interface RsaVerifyInput {
  message: string;
  /** 微信回传的 Wechatpay-Signature，base64 */
  signature: string;
  keyPem: string;
}

/** Authorization 头的五个组成部分 */
export interface AuthorizationInput {
  mchId: string;
  /** 证书序列号或微信支付公钥 ID，与签名私钥必须成对 */
  serialNo: string;
  nonce: string;
  timestamp: string;
  signature: string;
}

/** 回调 resource 里的加密载荷 */
export interface AesGcmInput {
  /** APIv3 密钥，32 字节 */
  key: string;
  /** resource.nonce，12 字节 */
  nonce: string;
  /** resource.associated_data，可为空串 */
  associatedData: string;
  /** resource.ciphertext，base64，末尾 16 字节是认证标签 */
  ciphertext: string;
}

/** V3 请求签名串 */
export function buildRequestMessage(
  method: string,
  /** 只含路径与 query，不含协议与域名，如 `/v3/pay/transactions/jsapi` */
  pathWithQuery: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return `${method}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${body}\n`;
}

/** V3 回调验签串：Timestamp\nNonce\n原始请求体\n */
export function buildCallbackMessage(timestamp: string, nonce: string, rawBody: string): string {
  return `${timestamp}\n${nonce}\n${rawBody}\n`;
}

/** 用商户私钥做 SHA256withRSA 签名，输出 base64 */
export function rsaSign({ message, privateKeyPem }: RsaSignInput): string {
  try {
    return createSign('sha256')
      .update(message, 'utf8')
      .sign(createPrivateKey(privateKeyPem))
      .toString('base64');
  } catch {
    throw new WechatCryptoError('商户私钥不是可用的 PEM，请粘贴 apiclient_key.pem 全文（含 BEGIN PRIVATE KEY 行）');
  }
}

/** 用平台证书 / 微信支付公钥验签，输出 base64 的 SHA256withRSA 签名 */
export function rsaVerify({ message, signature, keyPem }: RsaVerifyInput): boolean {
  try {
    return createVerify('sha256')
      .update(message, 'utf8')
      .verify(toVerifyKey(keyPem), signature, 'base64');
  } catch {
    // 密钥本身读不动时不能算「验签失败」，否则配置填错会表现成「有人在伪造回调」
    throw new WechatCryptoError('微信侧密钥不是可用的 PEM（平台证书与微信支付公钥不能填反）');
  }
}

/** 拼 Authorization 头的值，字段顺序微信不校验但保持与官方示例一致便于比对 */
export function buildAuthorizationHeader(input: AuthorizationInput): string {
  return (
    `WECHATPAY2-SHA256-RSA2048 ` +
    `mchid="${input.mchId}",` +
    `nonce_str="${input.nonce}",` +
    `signature="${input.signature}",` +
    `timestamp="${input.timestamp}",` +
    `serial_no="${input.serialNo}"`
  );
}

/** 解密回调 / 平台证书的 AES-256-GCM 密文，返回 UTF-8 明文 */
export function aesGcmDecrypt(input: AesGcmInput): string {
  const payload = Buffer.from(input.ciphertext, 'base64');
  if (payload.length <= AUTH_TAG_LENGTH) {
    throw new WechatCryptoError('回调密文长度异常，无法切出认证标签');
  }
  const body = payload.subarray(0, payload.length - AUTH_TAG_LENGTH);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);

  try {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(input.key, 'utf8'), Buffer.from(input.nonce, 'utf8'), {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAAD(Buffer.from(input.associatedData, 'utf8'));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    // APIv3 密钥填错、密文被截断、associated_data 不符都落在这一条里
    throw new WechatCryptoError('回调解密失败：APIv3 密钥与下单时不是同一把，或报文已被改动');
  }
}

/** 随机串：官方示例是 32 位大写十六进制，微信没规定大小写，照示例来省得比对时看着像不一致 */
export function randomNonce(): string {
  return randomBytes(16).toString('hex').toUpperCase();
}

/** 时间戳：秒级字符串，与服务器时区无关 */
export function timestampSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

/** 认证标签长度，微信固定 16 字节 */
const AUTH_TAG_LENGTH = 16;

function toVerifyKey(keyPem: string) {
  if (keyPem.includes('BEGIN CERTIFICATE')) {
    return new X509Certificate(keyPem).publicKey;
  }
  return createPublicKey(keyPem);
}

/**
 * 密码学环节的错误。
 *
 * 单独一个类型是为了让上层分得清「配置填错了」和「微信拒了这笔单」——
 * 前者要报给运营去改「支付配置」，后者要原样把微信的 code 摊给顾客或商户。
 */
export class WechatCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WechatCryptoError';
  }
}
