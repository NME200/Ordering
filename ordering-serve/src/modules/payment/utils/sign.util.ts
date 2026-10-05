import { createHmac, timingSafeEqual } from 'node:crypto';

/** 计算 HMAC-SHA256 的十六进制摘要，用于回调验签 */
export function hmacSha256Hex(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/**
 * 定长安全比较，避免因字符串比较的短路特性泄露签名信息（时序攻击）。
 * 长度不同直接判否。
 */
export function safeCompare(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
