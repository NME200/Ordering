/** 两点间球面距离（米）。门店没录入坐标或用户没授权定位时返回 null，界面按「不显示」处理 */
export function distanceMeters(
  fromLat: number,
  fromLng: number,
  toLat: number | null,
  toLng: number | null,
): number | null {
  if (toLat === null || toLng === null) return null;
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = rad(toLat - fromLat);
  const dLng = rad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(fromLat)) * Math.cos(rad(toLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * earthRadius * Math.asin(Math.sqrt(a)));
}

/** 距离的人话版：<1km 用米，其余用公里且保留一位小数 */
export function distanceLabel(meters: number | null): string {
  if (meters === null || Number.isNaN(meters)) return '';
  if (meters < 1000) return `距您 ${meters}m`;
  return `距您 ${(meters / 1000).toFixed(1)}km`;
}

/**
 * 取一次定位。
 *
 * 用户拒绝授权是常态而不是异常，所以失败一律返回 null 让界面降级，
 * 不弹「请开启定位」这种打断式提示。
 */
export function locate(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    uni.getLocation({
      type: 'gcj02',
      success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }),
      fail: () => resolve(null),
    });
  });
}
