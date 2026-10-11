import type { PaginationQuery } from '@shared/types/api';

/**
 * 优惠券 —— 与后端 `modules/coupon` 的出入参对齐。
 *
 * 只有商户后台用得到（平台侧那份在 Admin-web），所以放在本工程而不是 Web-shared
 * （与 Admin-web 的 `types/app-config.ts` 同样的归属判断）。
 *
 * ⚠️ 两条口径必须守住：
 * 1. 金额单位是**分**，输入用「元」，提交前经 `yuanToFen` 转换；
 * 2. 券面文案（`faceValue` / `thresholdText`）由服务端算好，前端不得重算，
 *    否则三端各写一份四舍五入，顾客看到的和核销的对不上。
 */

/** 券类型：满减传减免金额，折扣传折扣率百分数（80 = 打 8 折） */
export type CouponType = 'amount' | 'discount';

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  amount: '满减券',
  discount: '折扣券',
};

/**
 * 发放场景。
 *
 * 三种语义差别很大，界面上必须说清楚：只有 normal 会出现在小程序领券中心，
 * newcomer / birthday 由服务端在满足条件时自动发，配错了不会「少发」而是「发错人」。
 */
export type CouponScene = 'normal' | 'newcomer' | 'birthday';

export const COUPON_SCENES: { value: CouponScene; label: string; hint: string }[] = [
  { value: 'normal', label: '领券中心', hint: '顾客在小程序「优惠券」页自取' },
  { value: 'newcomer', label: '新客自动发放', hint: '首次下单的顾客由服务端自动发到账户，不进领券中心' },
  { value: 'birthday', label: '生日当月领取', hint: '仅生日当月出现在领券中心，其余时间顾客看不到' },
];

export const COUPON_SCENE_LABELS: Record<CouponScene, string> = {
  normal: '领券中心',
  newcomer: '新客自动发放',
  birthday: '生日当月领取',
};

/** 模板上下架：0 下架 / 1 上架 */
export type CouponTemplateStatus = 0 | 1;

export const COUPON_TEMPLATE_STATUS_LABELS: Record<CouponTemplateStatus, string> = {
  1: '已上架',
  0: '已下架',
};

export const COUPON_TEMPLATE_STATUS_OPTIONS: { label: string; value: CouponTemplateStatus }[] = [
  { label: '已上架', value: 1 },
  { label: '已下架', value: 0 },
];

/** 持有券状态，与后端 `CustomerCouponStatus` 一致 */
export type CustomerCouponStatus = 'unused' | 'locked' | 'used' | 'expired';

export const CUSTOMER_COUPON_STATUS_LABELS: Record<CustomerCouponStatus, string> = {
  unused: '未使用',
  locked: '待支付占用',
  used: '已使用',
  expired: '已过期',
};

/** 券模板（后端 CouponTemplateDto） */
export interface CouponTemplate {
  id: number;
  /** 所属商户；null = 平台券，商户侧永远是自己 */
  merchantId: number | null;
  name: string;
  type: CouponType;
  /** 满减为减免金额（分）；折扣为折扣率百分数 */
  value: number;
  /** 使用门槛（分），0 = 无门槛 */
  threshold: number;
  /** 最多抵扣（分），仅折扣券有意义，null = 不限 */
  maxDiscount: number | null;
  scene: CouponScene;
  /** 领取后有效天数；与固定区间二选一 */
  validDays: number | null;
  startAt: string | null;
  endAt: string | null;
  /** 发行总量，0 = 不限量 */
  totalCount: number;
  receivedCount: number;
  perLimit: number;
  description: string | null;
  status: CouponTemplateStatus;
  faceValue: string;
  thresholdText: string;
  /** 剩余可领；null = 不限量 */
  remain: number | null;
}

/** 发放 / 核销记录（后端 CustomerCouponDto） */
export interface CustomerCouponRecord {
  id: number;
  templateId: number;
  name: string;
  type: CouponType;
  value: number;
  threshold: number;
  maxDiscount: number | null;
  scene: CouponScene;
  expireAt: string;
  status: CustomerCouponStatus;
  faceValue: string;
  thresholdText: string;
  receivedAt: string;
  usedAt: string | null;
}

/** 券模板列表查询：merchantId 由 Token 决定，商户侧一律不传 */
export interface CouponQuery extends PaginationQuery {
  scene?: CouponScene;
  status?: CouponTemplateStatus;
}

/** 新建 / 修改券模板入参（金额已转成分） */
export interface CouponPayload {
  name: string;
  type: CouponType;
  value: number;
  threshold?: number;
  maxDiscount?: number;
  scene?: CouponScene;
  validDays?: number;
  /** YYYY-MM-DD，与 validDays 二选一 */
  startAt?: string;
  endAt?: string;
  totalCount?: number;
  perLimit?: number;
  description?: string;
}
