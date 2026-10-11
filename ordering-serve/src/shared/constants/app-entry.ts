/**
 * 小程序页面与跳转链接的共享口径。
 *
 * 装修组件的入口、轮播图、活动弹窗按钮都要回答同一个问题：
 * 「这个跳转在小程序里真的存在吗」。所以路径白名单与链接形状放一处，
 * 后端校验、平台装修器的下拉、小程序的分发逻辑都从这里取，避免三份清单各写各的。
 */

/** 顾客端小程序真存在的页面（新增页面要同步这里，否则装修端选不到） */
export const APP_PAGE_PATHS = [
  '/pages/home/home',
  '/pages/stores/stores',
  '/pages/menu/menu',
  '/pages/orders/orders',
  '/pages/profile/profile',
  '/pages/address/address',
  '/pages/coupon/coupon',
  '/pages/card/card',
  '/pages/invoice/invoice',
  '/pages/service/service',
  '/pages/review/review',
  '/pages/queue/queue',
  '/pages/settings/settings',
] as const;

/** 保留动作：唤起扫码（桌码 / 门店码），不带页面路径 */
export const APP_LINK_ACTIONS = ['scan'] as const;

/**
 * 链接形状：`/pages/xxx/xxx`（可带 query）或保留动作。
 *
 * 只卡形状，成员资格由 `isAppLinkTarget` 判 —— 形状过了但页面不存在，
 * 顾客点下去就是白屏，所以两层都要有。
 */
export const APP_LINK_PATTERN =
  /^(\/pages\/[a-z0-9-]+\/[a-z0-9-]+(\?[a-zA-Z0-9&_=/.\-%]{0,120})?|scan)$/;

/** 去掉 query 后，路径必须命中页面白名单或保留动作 */
export function isAppLinkTarget(link: string): boolean {
  const path = link.split('?')[0];
  if ((APP_LINK_ACTIONS as readonly string[]).includes(path)) return true;
  return (APP_PAGE_PATHS as readonly string[]).includes(path);
}
