import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * 敏感配置的静态加解密（AES-256-GCM）。
 *
 * 支付渠道的应用私钥、商户私钥、APIv3 密钥都是**资金级凭据**：一旦泄露，
 * 外人就能冒充商户号发起退款/转账。因此它们不能明文躺在 MySQL 里 ——
 * 一次慢查询导出、一个只读从库、一次拖库都不该等于交出私钥。
 *
 * 主密钥放 `.env` 的 CONFIG_SECRET_KEY，它**不是支付配置**，只是保护支付配置的那把钥匙：
 * 换掉它会让已入库的密文全部无法解密，必须连同配置一起重填。
 *
 * 密文格式 `v1:<iv b64>:<authTag b64>:<cipher b64>`，带版本前缀便于将来换算法或轮换密钥。
 * GCM 的认证标签保证密文被篡改时解密直接失败，不会解出一段脏配置。
 */

const ALGORITHM = 'aes-256-gcm';
/** AES-GCM 推荐 12 字节 IV */
const IV_LENGTH = 12;
/** 密文格式版本前缀 */
const VERSION = 'v1';

/**
 * 把任意长度的主密钥派生成 AES-256 需要的 32 字节密钥。
 * 用 SHA-256 而不是直接截断，保证短口令也能铺满密钥空间。
 */
function deriveKey(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey, 'utf8').digest();
}

/** 加密一段敏感配置，返回自描述文本 */
export function encryptSecret(plaintext: string, masterKey: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(masterKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * 解密敏感配置。
 * 密文被改过、版本不认识、或主密钥换过，都会在这里抛错，由调用方转成可读错误。
 */
export function decryptSecret(payload: string, masterKey: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('密文格式不合法或版本不受支持');
  }

  const [, ivB64, authTagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, deriveKey(masterKey), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

/** 判断一段文本是否是本工具产出的密文（用于兼容历史明文数据） */
export function isEncryptedPayload(value: string): boolean {
  return value.split(':').length === 4 && value.startsWith(`${VERSION}:`);
}
