/**
 * 把 `7d` / `2h` / `30m` / `60s` 这类时长字符串转换为秒数。
 * 用于计算 Token 黑名单等 Redis key 的过期时间。
 *
 * 无法解析时回退为 7 天，保证不会因配置写错导致 key 永不过期。
 */
export function parseDurationToSeconds(value: string, fallbackSeconds = 7 * 24 * 60 * 60): number {
  const matched = /^(\d+)\s*([smhd])$/i.exec(value.trim());
  if (!matched) {
    return fallbackSeconds;
  }

  const amount = Number(matched[1]);
  const unit = matched[2].toLowerCase();
  const factorMap: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

  return amount * (factorMap[unit] ?? fallbackSeconds);
}
