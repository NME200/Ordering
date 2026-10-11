/**
 * 营销与顾客域 —— 与 `ordering-serve/src/modules/coupon`、`modules/customer` 的出入参对齐。
 *
 * 只有平台端用得到（商户侧那套走 Merchant-web），所以放在 Admin-web 而不是 Web-shared，
 * 与 `types/app-config.ts` 同样的归属判断。
 * ⚠️ 字段名与取值必须跟后端 DTO 同步：后端是校验的唯一事实来源，
 * 这里写错只会让运营在保存时吃到 400。
 */

import type { PaginationQuery } from '@shared/types/api';
import type { CommonStatus } from '@shared/types/enums';

/* ============================================================
 * 优惠券模板
 * ============================================================ */

/** 券类型：amount 满减（value 是分）/ discount 折扣（value 是折扣率百分数，80 = 打 8 折） */
export type CouponType = 'amount' | 'discount';

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  amount: '满减券',
  discount: '折扣券',
};

/**
 * 发放场景。
 * newcomer / birthday 由服务端在满足条件时**自动发放**，不进领券中心 ——
 * 列表上必须把这件事说清楚，否则运营会以为券配错了来问「顾客为什么领不到」。
 */
export type CouponScene = 'normal' | 'newcomer' | 'birthday';

export const COUPON_SCENE_LABELS: Record<CouponScene, string> = {
  normal: '领券中心',
  newcomer: '新客自动发放',
  birthday: '生日当月领取',
};

/** 模板上下架：1 上架 / 0 下架 */
export type CouponTemplateStatus = 0 | 1;

export const COUPON_TEMPLATE_STATUS_LABELS: Record<CouponTemplateStatus, string> = {
  1: '已上架',
  0: '已下架',
};

export const COUPON_TEMPLATE_STATUS_OPTIONS: { label: string; value: CouponTemplateStatus }[] = [
  { label: COUPON_TEMPLATE_STATUS_LABELS[1], value: 1 },
  { label: COUPON_TEMPLATE_STATUS_LABELS[0], value: 0 },
];

export const COUPON_SCENE_OPTIONS: { label: string; value: CouponScene }[] = (
  Object.keys(COUPON_SCENE_LABELS) as CouponScene[]
).map((value) => ({ label: COUPON_SCENE_LABELS[value], value }));

export const COUPON_TYPE_OPTIONS: { label: string; value: CouponType }[] = (
  Object.keys(COUPON_TYPE_LABELS) as CouponType[]
).map((value) => ({ label: COUPON_TYPE_LABELS[value], value }));

/**
 * 表单里的金额上限（**元**）。
 * 与后端 `MAX_COUPON_VALUE_CENT = 99900` / `MAX_COUPON_DISCOUNT_CENT = 100000` 同值：
 * 满减面额超 999 元后端直接拒，折扣抵扣超 1000 元会被算价时静默截断 ——
 * 输入框先把住上限，比让运营保存完才发现「抵不到那么多」好。
 */
export const MAX_AMOUNT_YUAN = 999;
export const MAX_DISCOUNT_CAP_YUAN = 1000;

/** 券模板（后端 CouponTemplateDto） */
export interface CouponTemplate {
  id: number;
  /** null = 平台券（全场通用）；有值是商户自己的券，平台只读 */
  merchantId: number | null;
  name: string;
  type: CouponType;
  /** 满减为减免金额（分）；折扣为折扣率百分数 */
  value: number;
  /** 门槛（分），0 = 无门槛 */
  threshold: number;
  maxDiscount: number | null;
  scene: CouponScene;
  validDays: number | null;
  /** ISO 字符串 */
  startAt: string | null;
  endAt: string | null;
  /** 发行总量，0 = 不限量 */
  totalCount: number;
  receivedCount: number;
  perLimit: number;
  description: string | null;
  status: CouponTemplateStatus;
  /** 券面文案「¥5」「8折」，服务端算好的，前端不要再算一遍 */
  faceValue: string;
  /** 门槛文案「满30可用」「全场通用」 */
  thresholdText: string;
  /** 剩余可领；null = 不限量 */
  remain: number | null;
}

/** 券模板列表查询（后端 QueryCouponTemplateDto） */
export interface CouponQuery extends PaginationQuery {
  merchantId?: number;
  scene?: CouponScene;
  status?: CouponTemplateStatus;
  /** 1 = 只看平台券；后端按数字判定，不能传布尔 */
  platformOnly?: 0 | 1;
}

/**
 * 新建 / 修改入参（后端 UpsertCouponTemplateDto）。
 *
 * 有效期**二选一**：`validDays` 或 `startAt` + `endAt`，两边同时填或同时空都会被打回。
 * 不含 merchantId：平台侧的归属由服务端固定覆写成 null（平台券），前端传什么都不认。
 */
export interface UpsertCouponPayload {
  name: string;
  type: CouponType;
  /** 满减金额（分）或折扣率百分数 */
  value: number;
  threshold?: number;
  maxDiscount?: number;
  scene?: CouponScene;
  validDays?: number;
  /** YYYY-MM-DD */
  startAt?: string;
  /** YYYY-MM-DD */
  endAt?: string;
  totalCount?: number;
  perLimit?: number;
  description?: string;
  status?: CouponTemplateStatus;
}

/* ============================================================
 * 发放与核销记录
 * ============================================================ */

/**
 * 持有券状态（后端 CustomerCouponStatus）。
 * 服务端读侧会把「还没刷成 expired 但已过期」的券直接回 expired，所以这里四个值都会出现。
 */
export type IssuedCouponStatus = 'unused' | 'locked' | 'used' | 'expired';

export const ISSUED_COUPON_STATUS_LABELS: Record<IssuedCouponStatus, string> = {
  unused: '未使用',
  locked: '待支付占用',
  used: '已使用',
  expired: '已过期',
};

export const ISSUED_COUPON_STATUS_TAG_TYPES: Record<
  IssuedCouponStatus,
  'primary' | 'success' | 'info' | 'warning' | 'danger'
> = {
  unused: 'primary',
  locked: 'warning',
  used: 'success',
  expired: 'info',
};

/** 发放记录一行（后端 CustomerCouponDto） */
export interface IssuedCoupon {
  id: number;
  templateId: number;
  merchantId: number | null;
  /** 发放瞬间的券名快照：模板后来改了也不回头改顾客手里的券 */
  name: string;
  type: CouponType;
  value: number;
  threshold: number;
  maxDiscount: number | null;
  scene: CouponScene;
  expireAt: string;
  status: IssuedCouponStatus;
  faceValue: string;
  thresholdText: string;
  receivedAt: string;
  usedAt: string | null;
}

/* ============================================================
 * 顾客
 * ============================================================ */

/** 顾客列表行（后端 CustomerAdminRowDto） */
export interface CustomerRow {
  id: number;
  nickname: string | null;
  /** 已打码，原样显示即可 */
  phone: string | null;
  phoneBound: boolean;
  createdAt: string;
  point: number;
  /** 分 */
  balance: number;
  growth: number;
  levelName: string;
  orderCount: number;
  couponCount: number;
  status: CommonStatus;
}

/** 顾客列表查询（后端 QueryCustomerAdminDto） */
export interface CustomerQuery extends PaginationQuery {
  keyword?: string;
  status?: CommonStatus;
  merchantId?: number;
}
