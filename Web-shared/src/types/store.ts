import type { PaginationQuery } from './api';
import type { AccountBanSource, BusinessStatus, CommonStatus } from './enums';

/** 门店 */
export interface Store {
  id: number;
  merchantId: number;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  /** 门店 logo / 头图；「查看门店」列表用，没录入时小程序用店名首字兜底 */
  logo: string | null;
  /** 营业时间展示文案，如「09:00-21:00」。只做展示，打烊仍由营业状态决定 */
  businessHours: string | null;
  /** 经纬度：商户后台手填；没填的门店顾客端不显示「距您 xx m」 */
  latitude: number | null;
  longitude: number | null;
  businessStatus: BusinessStatus;
  status: CommonStatus;
  /** 停用发起方；启用时为 null。平台停用的店商户解不开，开关要提前灰掉 */
  bannedBy: AccountBanSource | null;
  createdAt: string;
  updatedAt: string;
}

/** 门店列表查询入参 */
export interface StoreQuery extends PaginationQuery {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  keyword?: string;
  status?: CommonStatus;
}

/** 新增门店入参 */
export interface CreateStorePayload {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  name: string;
  /** 以下四个都是「传 null = 清空，不传 = 保持原值」，编辑时这两者不是一回事 */
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  logo?: string | null;
  businessHours?: string | null;
  /** 留空即不下发：顾客端不显示距离 */
  latitude?: number | null;
  longitude?: number | null;
  businessStatus?: BusinessStatus;
}

/**
 * 编辑门店入参 —— 只有资料字段。
 * 不含 merchantId（门店不允许跨租户迁移），也不含 status
 * （启停是治理动作，走 updateStoreStatus 单独校验 `store:disable`）。
 */
export type UpdateStorePayload = Partial<Omit<CreateStorePayload, 'merchantId'>>;

/**
 * 门店台位（桌号）。
 *
 * 桌号只能由桌上的小程序码带进顾客端，界面上没有手填口，
 * 所以这份清单就是桌号的唯一来源：不在这里、或已停用的桌，扫码下单会被服务端拒。
 */
export interface StoreTable {
  id: number;
  storeId: number;
  tableNo: string;
  area: string | null;
  status: CommonStatus;
  sort: number;
}

/** 新增 / 编辑台位入参（门店 ID 走路径，不在这里传） */
export interface UpsertStoreTablePayload {
  tableNo: string;
  area?: string | null;
  status?: CommonStatus;
  sort?: number;
}

/** 门店桌码（一桌一码，商家自己生成） */
export interface TableQrcode {
  id: number;
  storeId: number;
  tableNo: string;
  /** 写进码里的内容，形如 s=1&t=A12 */
  scene: string;
  page: string;
  /** 这张码指向的小程序版本：release / trial / develop。已印出去的码不会跟着配置变 */
  envVersion: string;
  generatedByName: string | null;
  updatedAt: string;
}

/** 带图片的桌码：base64 可直接放进 <img> 或 a[download] */
export interface TableQrcodeImage extends TableQrcode {
  imageBase64: string;
}

/** 批量生成的结果：单张失败不中断整批，失败原因逐条回给界面 */
export interface GenerateAllQrcodesResult {
  total: number;
  generated: number;
  failed: { tableNo: string; reason: string }[];
}
