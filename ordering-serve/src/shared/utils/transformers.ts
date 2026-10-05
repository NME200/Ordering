import { ValueTransformer } from 'typeorm';

/**
 * MySQL 的 BIGINT 通过 mysql2 驱动返回时可能是字符串，
 * 这里统一转换为 number，避免前端拿到 "1" 与 1 两种类型。
 *
 * 说明：当前主键为自增 bigint，实际取值远小于 Number.MAX_SAFE_INTEGER，
 * 因此转 number 是安全的。若未来改用雪花 ID 等超大数值，需改为 string 传输。
 */
export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value?: string | number | null): number | null | undefined =>
    value === null || value === undefined ? value : Number(value),
};
