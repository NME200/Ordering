import { compare, hash } from 'bcryptjs';

/** bcrypt 加盐轮数：10 轮在安全性与登录耗时之间较均衡 */
const SALT_ROUNDS = 10;

/** 生成密码哈希，入库前调用。禁止明文存储密码。 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, SALT_ROUNDS);
}

/** 校验明文密码与哈希是否匹配 */
export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}
