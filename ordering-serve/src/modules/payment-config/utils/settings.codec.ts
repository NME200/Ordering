import { decryptSecret, encryptSecret } from '../../../shared/utils/crypto.util';

/**
 * 渠道配置的加解密封装。
 *
 * 单独抽出来是为了让「配置服务」和「渠道注册表」共用同一套编解码 ——
 * 两边各写一遍迟早会因为一个改了格式而悄悄解不开。
 * 放在 utils 而不是 service，是为了让 payment 模块能直接引用而不形成模块循环依赖。
 */

export function encodeSettings(settings: Record<string, string>, masterKey: string): string {
  return encryptSecret(JSON.stringify(settings), masterKey);
}

export function decodeSettings(
  payload: string | null,
  masterKey: string,
  channel: string,
): Record<string, string> {
  if (!payload) {
    return {};
  }

  let json: string;
  try {
    json = decryptSecret(payload, masterKey);
  } catch {
    // 解密失败通常是主密钥被换过：必须报清楚原因，而不是让运营以为「配置丢了」重填一遍
    throw new Error(
      `渠道「${channel}」的配置无法解密，通常是 CONFIG_SECRET_KEY 被更换所致。` +
        '请用回原来的主密钥，或重新填写该渠道配置。',
    );
  }

  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`渠道「${channel}」的配置内容不是合法的键值对象`);
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    result[key] = typeof value === 'string' ? value : String(value ?? '');
  }
  return result;
}

/** 空配置时写入数据库的最小密文 */
export function encodeEmptySettings(masterKey: string): string {
  return encodeSettings({}, masterKey);
}
