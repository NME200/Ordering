/** 原生 tabBar 上的页面：只能用 switchTab，且不能带 query */
export const TAB_PATHS = ['/pages/home/home', '/pages/orders/orders', '/pages/profile/profile'];

export interface LinkHandlers {
  /** 装修配置里的保留动作 `scan`（桌码 / 门店码） */
  scan?: () => void;
}

/**
 * 执行装修配置里配下来的跳转。
 *
 * 三条硬规则：
 * 1. `scan` 是保留动作，由页面自己决定扫完之后去哪（各页语义不同）；
 * 2. Tab 页必须走 switchTab，navigateTo 到 Tab 页会静默失败；
 * 3. 目标页还没做时**如实提示在开发中**，不白屏也不假装跳过去了。
 */
export function openLink(link: string | undefined, handlers: LinkHandlers = {}): void {
  if (!link) {
    uni.showToast({ title: '这里还没有配置内容', icon: 'none' });
    return;
  }

  if (link === 'scan') {
    if (handlers.scan) handlers.scan();
    else uni.showToast({ title: '这个入口需要扫码，请在页内使用扫一扫', icon: 'none' });
    return;
  }

  const path = link.split('?')[0];
  if (TAB_PATHS.includes(path)) {
    uni.switchTab({ url: path, fail: () => uni.reLaunch({ url: path }) });
    return;
  }

  uni.navigateTo({
    url: link,
    fail: () => uni.showToast({ title: '这个功能正在开发中', icon: 'none' }),
  });
}

/**
 * 「我的」页四桶 → 订单页页签的一次性交接。
 *
 * switchTab 带不了 query（小程序限制），只能借本地存一个值，
 * 由订单页读一次就清掉 —— 不清的话，下次从底部 Tab 进订单页还会被拽回那个页签。
 *
 * 两边用的是同一组 key（unpaid / processing / review / refund），
 * 所以这里不再做映射：换名字曾经映射错过一次，角标 3 点进去却是别的页签。
 */
const ORDERS_BUCKET_KEY = 'orders-focus-bucket';
const BUCKETS = ['unpaid', 'processing', 'review', 'refund'];

export function rememberOrdersBucket(bucket: string): void {
  if (BUCKETS.includes(bucket)) uni.setStorageSync(ORDERS_BUCKET_KEY, bucket);
}

export function takeOrdersBucket(): string {
  const bucket = String(uni.getStorageSync(ORDERS_BUCKET_KEY) || '');
  if (bucket) uni.removeStorageSync(ORDERS_BUCKET_KEY);
  return bucket;
}
