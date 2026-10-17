/**
 * 运行平台判定（支付渠道用）。
 *
 * 收银台不该让顾客手选「用微信支付还是支付宝」—— 在微信小程序里就只能微信支付，
 * 在支付宝小程序里就只能支付宝，剩下的 H5 预览才需要联调渠道兜底。
 *
 * 刻意不用 `#ifdef MP-WEIXIN` 条件编译：那段在 vue-tsc 眼里是两份同名声明，
 * 类型检查会直接挂，而这个工程把 `npm run typecheck` 当交付门槛（同 utils/wx.ts）。
 */

/** 后端 PaymentChannel 的取值，这里只用到在线的那几个 */
export type PlatformPayChannel = 'wechat' | 'alipay';

function uniPlatform(): string {
  try {
    const info = uni.getSystemInfoSync() as unknown as { uniPlatform?: string };
    return String(info.uniPlatform ?? '');
  } catch {
    return '';
  }
}

/**
 * 当前平台对应的真实支付渠道；H5 / 开发者工具 web 视图等回 null。
 *
 * 回 null 时收银台会退到「后端给的第一个在线渠道」，本地跑的就是模拟渠道。
 */
export function platformPayChannel(): PlatformPayChannel | null {
  const platform = uniPlatform();
  if (platform === 'mp-weixin') {
    return 'wechat';
  }
  if (platform === 'mp-alipay') {
    return 'alipay';
  }
  return null;
}
