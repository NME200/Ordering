/**
 * 优惠券枚举（11.x 券域）。
 *
 * 券分两层：`coupon_templates`（模板，商户或平台配置）与 `customer_coupons`（顾客持有的券）。
 * 持有券上**快照**了面额与门槛，因为「模板改了已发出的券跟着变」在财务上说不通 ——
 * 顾客领到的是「满 30 减 5」，商户事后把模板改成减 3 不能回头改顾客手里的券。
 */

/** 券类型 */
export enum CouponType {
  /** 满减：value 为减免金额（分） */
  AMOUNT = 'amount',
  /** 折扣：value 为折扣率百分数，80 表示打 8 折 */
  DISCOUNT = 'discount',
}

export const COUPON_TYPE_VALUES: CouponType[] = [CouponType.AMOUNT, CouponType.DISCOUNT];

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  [CouponType.AMOUNT]: '满减券',
  [CouponType.DISCOUNT]: '折扣券',
};

/**
 * 券的发放场景。
 *
 * normal 由顾客在领券中心自取；newcomer / birthday 由服务端在**满足条件时自动发放**，
 * 不出现在领券中心列表里 —— 让运营能配出「人人都能领的新客券」就不是新客券了。
 */
export enum CouponScene {
  NORMAL = 'normal',
  NEWCOMER = 'newcomer',
  BIRTHDAY = 'birthday',
}

export const COUPON_SCENE_VALUES: CouponScene[] = [
  CouponScene.NORMAL,
  CouponScene.NEWCOMER,
  CouponScene.BIRTHDAY,
];

export const COUPON_SCENE_LABELS: Record<CouponScene, string> = {
  [CouponScene.NORMAL]: '领券中心',
  [CouponScene.NEWCOMER]: '新客自动发放',
  [CouponScene.BIRTHDAY]: '生日当月领取',
};

/** 模板上下架 */
export enum CouponTemplateStatus {
  OFFLINE = 0,
  ONLINE = 1,
}

/**
 * 持有券状态。
 *
 * LOCKED 是下单时占用、支付成功后才转 USED —— 没有这一态，
 * 顾客可以拿同一张券同时下三笔单，或者下单不付款把券耗在待支付订单上却仍能再用。
 */
export enum CustomerCouponStatus {
  UNUSED = 'unused',
  LOCKED = 'locked',
  USED = 'used',
  EXPIRED = 'expired',
}

export const CUSTOMER_COUPON_STATUS_LABELS: Record<CustomerCouponStatus, string> = {
  [CustomerCouponStatus.UNUSED]: '未使用',
  [CustomerCouponStatus.LOCKED]: '待支付占用',
  [CustomerCouponStatus.USED]: '已使用',
  [CustomerCouponStatus.EXPIRED]: '已过期',
};

/** 「我的优惠券」页签：把 LOCKED 归到未使用里，顾客视角它还没花掉 */
export const COUPON_TABS = ['unused', 'used', 'expired'] as const;
export type CouponTab = (typeof COUPON_TABS)[number];

export const COUPON_TAB_LABELS: Record<CouponTab, string> = {
  unused: '未使用',
  used: '已使用',
  expired: '已过期',
};

/** 单张券最多能抵扣的金额上限（分）：折扣券没有上限会算出负应付，必须有闸 */
export const MAX_COUPON_DISCOUNT_CENT = 100000;
