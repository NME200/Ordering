import { Type, type ClassConstructor } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { APP_LINK_PATTERN } from '../../../shared/constants/app-entry';

/** 十六进制颜色，如 `#C8752B`。只收 6 位，避免 3 位简写在各端渲染不一致 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * 图片地址。
 *
 * `require_tld: false` 是为了让本地联调能用 `http://localhost:5173/x.png`；
 * 生产仍应是 https 的完整域名。刻意不收相对路径与 data URI ——
 * 小程序的 `<image>` 只认网络地址。
 */
const IMAGE_URL = { require_tld: false, protocols: ['http', 'https'] as string[] };

/**
 * 可装修的页面。
 *
 * 一份布局方案同时带这四页的内容，发布时整体生效 —— 主题要四页共享，
 * 拆成四行就得回答「改主题要发布几次」，版本协商也会碎成四个号。
 */
export enum AppConfigPageKey {
  HOME = 'home',
  MEMBER = 'member',
  CARD = 'card',
  COUPON = 'coupon',
}

export const APP_CONFIG_PAGE_KEYS = [
  AppConfigPageKey.HOME,
  AppConfigPageKey.MEMBER,
  AppConfigPageKey.CARD,
  AppConfigPageKey.COUPON,
] as const;

export const PAGE_LABELS: Record<AppConfigPageKey, string> = {
  [AppConfigPageKey.HOME]: '首页',
  [AppConfigPageKey.MEMBER]: '个人中心',
  [AppConfigPageKey.CARD]: '会员卡',
  [AppConfigPageKey.COUPON]: '优惠券中心',
};

/**
 * 内置线稿图标 key。
 *
 * 与 `tabbarSkin` 同一条硬约束：小程序不能下载代码与资源，图标是**包内静态资源**，
 * 后端只能下发「用哪个」，新增图标必须随小程序发版。
 * 清单与 `Small-web/components/LineIcon.vue` 一一对应，两边同时动。
 */
export const APP_ICON_KEYS = [
  'takeout',
  'delivery',
  'dinein',
  'queue',
  'store',
  'search',
  'notice',
  'hot',
  'coupon',
  'balance',
  'points',
  'memberCard',
  'invoice',
  'service',
  'setting',
  'gift',
  'birthday',
  'address',
  'unpaid',
  'pending',
  'review',
  'refund',
  'freeShipping',
  'doublePoints',
  'phone',
  'clock',
] as const;

export type AppIconKey = (typeof APP_ICON_KEYS)[number];

/** 首页组件白名单：**小程序端必须为每个 key 预置渲染器**，加一项就得同步发版 */
export enum AppConfigSectionKey {
  /** 顶部品牌图轮播 */
  BANNER = 'banner',
  /** 场景入口宫格（门店自取 / 外卖 / 堂食点餐 / 排队叫号 / 查看门店） */
  ENTRY_GRID = 'entryGrid',
  /** 搜索框 */
  SEARCH_BAR = 'searchBar',
  /** 公告条 */
  NOTICE = 'notice',
  /** 门店列表（按距离或销量） */
  SHOP_LIST = 'shopList',
  /** 领券利益点条 */
  COUPON_ENTRY = 'couponEntry',
  /** 个人中心头部（头像 / 昵称 / ID / 绑定手机号提示） */
  USER_HEADER = 'userHeader',
  /** 资产三列（余额 / 积分 / 优惠券） */
  ASSET_BAR = 'assetBar',
  /** 我的订单四入口 */
  ORDER_ENTRY = 'orderEntry',
  /** 服务功能宫格 */
  SERVICE_GRID = 'serviceGrid',
  /** 会员卡卡面 */
  MEMBER_CARD = 'memberCard',
  /** 会员权益宫格 */
  BENEFIT_GRID = 'benefitGrid',
  /** 成长任务列表 */
  TASK_LIST = 'taskList',
  /** 吸底大按钮 */
  FOOTER_BUTTON = 'footerButton',
  /** 优惠券状态页签 */
  COUPON_TABS = 'couponTabs',
  /** 券列表 */
  COUPON_LIST = 'couponList',
  /** 规则入口 */
  RULE_ENTRY = 'ruleEntry',
}

/** 组件中文名，用于报错文案与平台端组件库标题 */
export const SECTION_LABELS: Record<AppConfigSectionKey, string> = {
  [AppConfigSectionKey.BANNER]: '品牌轮播',
  [AppConfigSectionKey.ENTRY_GRID]: '场景入口',
  [AppConfigSectionKey.SEARCH_BAR]: '搜索框',
  [AppConfigSectionKey.NOTICE]: '公告栏',
  [AppConfigSectionKey.SHOP_LIST]: '门店列表',
  [AppConfigSectionKey.COUPON_ENTRY]: '领券入口',
  [AppConfigSectionKey.USER_HEADER]: '用户头部',
  [AppConfigSectionKey.ASSET_BAR]: '资产栏',
  [AppConfigSectionKey.ORDER_ENTRY]: '订单入口',
  [AppConfigSectionKey.SERVICE_GRID]: '服务宫格',
  [AppConfigSectionKey.MEMBER_CARD]: '会员卡面',
  [AppConfigSectionKey.BENEFIT_GRID]: '会员权益',
  [AppConfigSectionKey.TASK_LIST]: '成长任务',
  [AppConfigSectionKey.FOOTER_BUTTON]: '底部按钮',
  [AppConfigSectionKey.COUPON_TABS]: '券页签',
  [AppConfigSectionKey.COUPON_LIST]: '券列表',
  [AppConfigSectionKey.RULE_ENTRY]: '规则入口',
};

export const SECTION_KEYS = Object.values(AppConfigSectionKey);

/**
 * 每个页面允许的组件。
 *
 * 这份表就是「装修器的组件库按页过滤」与「后端拒收越界组件」的同一条规则 ——
 * 把券列表拖到首页这种错，在保存时就该报错，而不是等小程序渲染出一个空壳。
 */
export const PAGE_SECTION_KEYS: Record<AppConfigPageKey, AppConfigSectionKey[]> = {
  [AppConfigPageKey.HOME]: [
    AppConfigSectionKey.BANNER,
    AppConfigSectionKey.ENTRY_GRID,
    AppConfigSectionKey.SEARCH_BAR,
    AppConfigSectionKey.NOTICE,
    AppConfigSectionKey.SHOP_LIST,
    AppConfigSectionKey.COUPON_ENTRY,
  ],
  [AppConfigPageKey.MEMBER]: [
    AppConfigSectionKey.USER_HEADER,
    AppConfigSectionKey.ASSET_BAR,
    AppConfigSectionKey.ORDER_ENTRY,
    AppConfigSectionKey.SERVICE_GRID,
  ],
  [AppConfigPageKey.CARD]: [
    AppConfigSectionKey.MEMBER_CARD,
    AppConfigSectionKey.BENEFIT_GRID,
    AppConfigSectionKey.TASK_LIST,
    AppConfigSectionKey.FOOTER_BUTTON,
  ],
  [AppConfigPageKey.COUPON]: [
    AppConfigSectionKey.COUPON_TABS,
    AppConfigSectionKey.COUPON_LIST,
    AppConfigSectionKey.RULE_ENTRY,
  ],
};

/** 组件归属页面；报错与「这个组件能放在哪」都查这张表 */
export function pageOfSection(key: AppConfigSectionKey): AppConfigPageKey | null {
  const found = APP_CONFIG_PAGE_KEYS.find((page) => PAGE_SECTION_KEYS[page].includes(key));
  return found ?? null;
}

// ==================== 主题 ====================

/**
 * 主题 token：四页共享，小程序启动后映射成根节点的 CSS 变量。
 *
 * 字段名与 `Small-web/doc/config-design.md` 第三节一致，值全部是**展示**参数 ——
 * 这里不放任何业务规则，改色改间距不该影响下单金额。
 */
export class AppThemeDto {
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'primaryColor 需为 #RRGGBB 格式' })
  primaryColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'subColor 需为 #RRGGBB 格式' })
  subColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'bgColor 需为 #RRGGBB 格式' })
  bgColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'textColor 需为 #RRGGBB 格式' })
  textColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'subTextColor 需为 #RRGGBB 格式' })
  subTextColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'dividerColor 需为 #RRGGBB 格式' })
  dividerColor?: string;

  /** 卡片圆角（px）。按钮/弹层的胶囊圆角由前端固定，不给配置，免得配出个 3px 的「胶囊」 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'radius 必须为整数' })
  @Min(0, { message: 'radius 最小为 0' })
  @Max(32, { message: 'radius 最大为 32' })
  radius?: number;

  /** 卡片不透明度：设计稿是毛玻璃半透明白，0.70 是那一版 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'cardAlpha 最多两位小数' })
  @Min(0, { message: 'cardAlpha 最小为 0' })
  @Max(1, { message: 'cardAlpha 最大为 1' })
  cardAlpha?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cardGap 必须为整数' })
  @Min(0, { message: 'cardGap 最小为 0' })
  @Max(24, { message: 'cardGap 最大为 24' })
  cardGap?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sectionGap 必须为整数' })
  @Min(0, { message: 'sectionGap 最小为 0' })
  @Max(32, { message: 'sectionGap 最大为 32' })
  sectionGap?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageMargin 必须为整数' })
  @Min(0, { message: 'pageMargin 最小为 0' })
  @Max(32, { message: 'pageMargin 最大为 32' })
  pageMargin?: number;

  /**
   * tabBar 皮肤标识。
   *
   * 微信的 tabBar 图标是**小程序包内静态资源**，后端只能下发「用哪一套」这个 key，
   * 不能下发图标本身 —— 新增一套皮肤必须随小程序发版。
   */
  @IsOptional()
  @IsString()
  @MaxLength(24, { message: 'tabbarSkin 最长 24 个字符' })
  tabbarSkin?: string;
}

// ==================== 共用小结构 ====================

class BannerImageDto {
  @IsUrl(IMAGE_URL, { message: '轮播图片需为合法地址' })
  url!: string;

  @IsOptional()
  @Matches(APP_LINK_PATTERN, { message: '轮播跳转需为 /pages/xxx/xxx 或 scan' })
  @MaxLength(200, { message: '跳转链接最长 200 个字符' })
  link?: string;
}

/** 宫格项：图标只能取内置线稿 key，文案与跳转可改 */
class IconItemDto {
  @IsIn(APP_ICON_KEYS as unknown as string[], { message: 'icon 只能是内置图标之一' })
  icon!: AppIconKey;

  @IsString()
  @MaxLength(8, { message: '入口文案最长 8 个字符' })
  text!: string;

  @IsOptional()
  @Matches(APP_LINK_PATTERN, { message: 'link 需为 /pages/xxx/xxx 或 scan' })
  @MaxLength(200, { message: '跳转链接最长 200 个字符' })
  link?: string;

  @IsOptional()
  @MaxLength(6, { message: '角标最长 6 个字符' })
  badge?: string;
}

// ==================== 首页组件 ====================

export class BannerPropsDto {
  /**
   * 这里只管**结构与格式**（类型、上限、每张必须有地址）；
   * 「一张都没有」是完整性问题，归发布校验管 —— 否则草稿存不下来。
   */
  @IsArray()
  @ArrayMaxSize(5, { message: '轮播最多 5 张图片' })
  @Type(() => BannerImageDto)
  @ValidateNested({ each: true })
  images!: BannerImageDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(120, { message: '轮播高度最小 120' })
  @Max(400, { message: '轮播高度最大 400' })
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24, { message: '轮播圆角最大 24' })
  radius?: number;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'indicatorColor 需为 #RRGGBB 格式' })
  indicatorColor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'interval 必须为整数' })
  @Min(1000, { message: '切换间隔最短 1000ms' })
  @Max(10000, { message: '切换间隔最长 10000ms' })
  interval?: number;
}

export class EntryGridPropsDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3, 4, 5], { message: '列数只能是 1 到 5' })
  cols?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '标题最长 16 个字符' })
  title?: string;

  /** 空数组在草稿里合法（刚拖进来还没配），发布时由 validator 卡「显示就必须有内容」 */
  @IsArray()
  @ArrayMaxSize(10, { message: '入口最多 10 个' })
  @Type(() => IconItemDto)
  @ValidateNested({ each: true })
  items!: IconItemDto[];
}

export class SearchBarPropsDto {
  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '占位文案最长 16 个字符' })
  placeholder?: string;

  /** 搜索落到哪个页面（一般是门店列表），不给就只读不回跳 */
  @IsOptional()
  @Matches(APP_LINK_PATTERN, { message: 'link 需为 /pages/xxx/xxx 或 scan' })
  @MaxLength(200, { message: '跳转链接最长 200 个字符' })
  link?: string;
}

export class NoticePropsDto {
  @IsString()
  @MaxLength(60, { message: '公告文案最长 60 个字符' })
  text!: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'bgColor 需为 #RRGGBB 格式' })
  bgColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'textColor 需为 #RRGGBB 格式' })
  textColor?: string;

  @IsOptional()
  @IsIn(APP_ICON_KEYS as unknown as string[], { message: 'icon 只能是内置图标之一' })
  icon?: AppIconKey;
}

export class ShopListPropsDto {
  /** rating 不在选项里：后端没有评价表，排序维度不能凭空出现 */
  @IsOptional()
  @IsIn(['distance', 'sales'], { message: '排序只能是 distance 或 sales' })
  sortMode?: 'distance' | 'sales';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit 必须为整数' })
  @Min(1, { message: '显示条数最少 1 条' })
  @Max(20, { message: '显示条数最多 20 条' })
  limit?: number;

  @IsOptional()
  @IsBoolean()
  showDistance?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '标题最长 16 个字符' })
  title?: string;
}

export class CouponEntryPropsDto {
  @IsString()
  @MaxLength(16, { message: '标题最长 16 个字符' })
  title!: string;

  /** 利益点文案。券数据本身走营销接口，这里只决定这条横幅说什么 */
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '利益点文案最长 20 个字符' })
  benefit?: string;

  @IsOptional()
  @IsIn(APP_ICON_KEYS as unknown as string[], { message: 'icon 只能是内置图标之一' })
  icon?: AppIconKey;

  @IsOptional()
  @Matches(APP_LINK_PATTERN, { message: 'link 需为 /pages/xxx/xxx 或 scan' })
  @MaxLength(200, { message: '跳转链接最长 200 个字符' })
  link?: string;
}

// ==================== 个人中心组件 ====================

class GradientBackgroundDto {
  @IsOptional()
  @IsIn(['gradient', 'image'], { message: 'bgType 只能是 gradient 或 image' })
  bgType?: 'gradient' | 'image';

  /** 草稿可以给空数组（刚拖进来还没调色），齐不齐由发布校验管 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2, { message: '渐变只取两个色值' })
  @Matches(HEX_COLOR, { each: true, message: 'bgColors 需全为 #RRGGBB 格式' })
  bgColors?: string[];

  @IsOptional()
  @IsUrl(IMAGE_URL, { message: 'bgImage 需为合法图片地址' })
  bgImage?: string;
}

export class UserHeaderPropsDto extends GradientBackgroundDto {
  @IsOptional()
  @IsBoolean()
  showId?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '提示文案最长 30 个字符' })
  bindPhoneTip?: string;
}

/** 资产项的键是闭合枚举：每一项都对应一个真有数据的接口，加一项要先有接口 */
export const ASSET_KEYS = ['balance', 'point', 'coupon'] as const;

class AssetItemDto {
  @IsIn(ASSET_KEYS as unknown as string[], { message: '资产项只能是 balance / point / coupon' })
  key!: (typeof ASSET_KEYS)[number];

  @IsString()
  @MaxLength(6, { message: '资产名称最长 6 个字符' })
  label!: string;
}

export class AssetBarPropsDto {
  @IsArray()
  @ArrayMaxSize(3, { message: '资产最多三项' })
  @ArrayUnique((item: AssetItemDto) => item.key, { message: '资产项不能重复' })
  @Type(() => AssetItemDto)
  @ValidateNested({ each: true })
  items!: AssetItemDto[];
}

/** 订单入口的四个桶与后端订单状态口径对应，不许多也不许少成五六个 */
export const ORDER_ENTRY_KEYS = ['unpaid', 'processing', 'review', 'refund'] as const;

class OrderEntryItemDto {
  @IsIn(ORDER_ENTRY_KEYS as unknown as string[], {
    message: '订单入口只能是 unpaid / processing / review / refund',
  })
  key!: (typeof ORDER_ENTRY_KEYS)[number];

  @IsString()
  @MaxLength(6, { message: '入口文案最长 6 个字符' })
  text!: string;

  @IsOptional()
  @IsIn(APP_ICON_KEYS as unknown as string[], { message: 'icon 只能是内置图标之一' })
  icon?: AppIconKey;

  @IsOptional()
  @Matches(APP_LINK_PATTERN, { message: 'link 需为 /pages/xxx/xxx 或 scan' })
  @MaxLength(200, { message: '跳转链接最长 200 个字符' })
  link?: string;
}

export class OrderEntryPropsDto {
  @IsOptional()
  @IsString()
  @MaxLength(8, { message: '标题最长 8 个字符' })
  title?: string;

  @IsArray()
  @ArrayMaxSize(4, { message: '订单入口最多 4 个' })
  @ArrayUnique((item: OrderEntryItemDto) => item.key, { message: '订单入口不能重复' })
  @Type(() => OrderEntryItemDto)
  @ValidateNested({ each: true })
  items!: OrderEntryItemDto[];
}

/**
 * 服务宫格的可选项。
 *
 * 键是闭合的：每个键都对应一个真存在的页面或动作，平台只能增删改排序与文案，
 * 不能凭空造入口 —— 装修配置不该决定小程序里有没有某个功能。
 */
export const SERVICE_ENTRY_KEYS = [
  'newcomer',
  'address',
  'couponCenter',
  'couponMine',
  'memberCard',
  'invoice',
  'service',
  'birthday',
  'setting',
  'queue',
  'stores',
] as const;

class ServiceGridItemDto {
  @IsIn(SERVICE_ENTRY_KEYS as unknown as string[], { message: '不支持的服务入口' })
  key!: (typeof SERVICE_ENTRY_KEYS)[number];

  @IsString()
  @MaxLength(6, { message: '入口文案最长 6 个字符' })
  text!: string;

  @IsOptional()
  @IsIn(APP_ICON_KEYS as unknown as string[], { message: 'icon 只能是内置图标之一' })
  icon?: AppIconKey;

  @IsOptional()
  @Matches(APP_LINK_PATTERN, { message: 'link 需为 /pages/xxx/xxx 或 scan' })
  @MaxLength(200, { message: '跳转链接最长 200 个字符' })
  link?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ServiceGridPropsDto {
  @IsOptional()
  @IsString()
  @MaxLength(8, { message: '标题最长 8 个字符' })
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([3, 4], { message: '服务宫格只能是 3 列或 4 列' })
  cols?: number;

  @IsArray()
  @ArrayMaxSize(12, { message: '服务入口最多 12 个' })
  @ArrayUnique((item: ServiceGridItemDto) => item.key, { message: '服务入口不能重复' })
  @Type(() => ServiceGridItemDto)
  @ValidateNested({ each: true })
  items!: ServiceGridItemDto[];
}

// ==================== 会员卡组件 ====================

export class MemberCardPropsDto extends GradientBackgroundDto {
  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '品牌名最长 16 个字符' })
  brandName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12, { message: '等级名称最长 12 个字符' })
  levelName?: string;

  @IsOptional()
  @IsBoolean()
  showCardNo?: boolean;

  /** 关掉只是不画进度条：成长值本身是账号数据，不由装修决定 */
  @IsOptional()
  @IsBoolean()
  showGrowth?: boolean;
}

export const BENEFIT_KEYS = [
  'birthday',
  'freeShipping',
  'doublePoints',
  'service',
  'coupon',
  'points',
] as const;

class BenefitItemDto {
  @IsIn(BENEFIT_KEYS as unknown as string[], { message: '不支持的权益项' })
  key!: (typeof BENEFIT_KEYS)[number];

  @IsString()
  @MaxLength(6, { message: '权益名称最长 6 个字符' })
  text!: string;

  @IsOptional()
  @IsIn(APP_ICON_KEYS as unknown as string[], { message: 'icon 只能是内置图标之一' })
  icon?: AppIconKey;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '权益说明最长 30 个字符' })
  desc?: string;
}

export class BenefitGridPropsDto {
  @IsOptional()
  @IsString()
  @MaxLength(8, { message: '标题最长 8 个字符' })
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([2, 3, 4], { message: '权益宫格只能是 2 / 3 / 4 列' })
  cols?: number;

  @IsArray()
  @ArrayMaxSize(8, { message: '权益最多 8 项' })
  @ArrayUnique((item: BenefitItemDto) => item.key, { message: '权益项不能重复' })
  @Type(() => BenefitItemDto)
  @ValidateNested({ each: true })
  items!: BenefitItemDto[];
}

class TaskItemDto {
  @IsString()
  @MaxLength(20, { message: '任务文案最长 20 个字符' })
  text!: string;

  @IsOptional()
  @MaxLength(6, { message: '按钮文案最长 6 个字符' })
  btnText?: string;

  @IsOptional()
  @Matches(APP_LINK_PATTERN, { message: 'link 需为 /pages/xxx/xxx 或 scan' })
  @MaxLength(200, { message: '跳转链接最长 200 个字符' })
  link?: string;
}

export class TaskListPropsDto {
  @IsOptional()
  @IsString()
  @MaxLength(8, { message: '标题最长 8 个字符' })
  title?: string;

  @IsArray()
  @ArrayMaxSize(6, { message: '成长任务最多 6 条' })
  @Type(() => TaskItemDto)
  @ValidateNested({ each: true })
  items!: TaskItemDto[];
}

export class FooterButtonPropsDto {
  @IsString()
  @MaxLength(12, { message: '按钮文案最长 12 个字符' })
  text!: string;

  /** 已开通会员时换一套文案与跳转，避免「立即开通」压在已经是会员的人身上 */
  @IsOptional()
  @IsString()
  @MaxLength(12, { message: '已开通文案最长 12 个字符' })
  openedText?: string;

  @IsOptional()
  @Matches(APP_LINK_PATTERN, { message: 'link 需为 /pages/xxx/xxx 或 scan' })
  @MaxLength(200, { message: '跳转链接最长 200 个字符' })
  link?: string;
}

// ==================== 优惠券中心组件 ====================

export const COUPON_TAB_KEYS = ['unused', 'used', 'expired'] as const;

class CouponTabItemDto {
  @IsIn(COUPON_TAB_KEYS as unknown as string[], { message: '页签只能是 unused / used / expired' })
  key!: (typeof COUPON_TAB_KEYS)[number];

  @IsString()
  @MaxLength(4, { message: '页签文案最长 4 个字符' })
  text!: string;
}

export class CouponTabsPropsDto {
  @IsArray()
  @ArrayMaxSize(3, { message: '页签最多 3 个' })
  @ArrayUnique((item: CouponTabItemDto) => item.key, { message: '页签不能重复' })
  @Type(() => CouponTabItemDto)
  @ValidateNested({ each: true })
  items!: CouponTabItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'defaultIndex 必须为整数' })
  @Min(0, { message: 'defaultIndex 不能为负' })
  @Max(2, { message: 'defaultIndex 最大为 2' })
  defaultIndex?: number;
}

export class CouponListPropsDto {
  @IsOptional()
  @IsIn(['ticket', 'plain'], { message: '券面样式只能是 ticket 或 plain' })
  cardStyle?: 'ticket' | 'plain';

  @IsOptional()
  @IsBoolean()
  showShopName?: boolean;

  @IsOptional()
  @IsBoolean()
  showExpire?: boolean;

  @IsOptional()
  @MaxLength(6, { message: '按钮文案最长 6 个字符' })
  btnText?: string;

  @IsOptional()
  @MaxLength(6, { message: '失效按钮文案最长 6 个字符' })
  expiredBtnText?: string;

  @IsOptional()
  @MaxLength(10, { message: '空状态文案最长 10 个字符' })
  emptyText?: string;
}

export class RuleEntryPropsDto {
  @IsString()
  @MaxLength(8, { message: '入口文案最长 8 个字符' })
  text!: string;
}

/** key → props 校验类。保存与发布都按这张表分派，白名单外的 key 直接拒 */
export const SECTION_SCHEMAS: Record<AppConfigSectionKey, ClassConstructor<object>> = {
  [AppConfigSectionKey.BANNER]: BannerPropsDto,
  [AppConfigSectionKey.ENTRY_GRID]: EntryGridPropsDto,
  [AppConfigSectionKey.SEARCH_BAR]: SearchBarPropsDto,
  [AppConfigSectionKey.NOTICE]: NoticePropsDto,
  [AppConfigSectionKey.SHOP_LIST]: ShopListPropsDto,
  [AppConfigSectionKey.COUPON_ENTRY]: CouponEntryPropsDto,
  [AppConfigSectionKey.USER_HEADER]: UserHeaderPropsDto,
  [AppConfigSectionKey.ASSET_BAR]: AssetBarPropsDto,
  [AppConfigSectionKey.ORDER_ENTRY]: OrderEntryPropsDto,
  [AppConfigSectionKey.SERVICE_GRID]: ServiceGridPropsDto,
  [AppConfigSectionKey.MEMBER_CARD]: MemberCardPropsDto,
  [AppConfigSectionKey.BENEFIT_GRID]: BenefitGridPropsDto,
  [AppConfigSectionKey.TASK_LIST]: TaskListPropsDto,
  [AppConfigSectionKey.FOOTER_BUTTON]: FooterButtonPropsDto,
  [AppConfigSectionKey.COUPON_TABS]: CouponTabsPropsDto,
  [AppConfigSectionKey.COUPON_LIST]: CouponListPropsDto,
  [AppConfigSectionKey.RULE_ENTRY]: RuleEntryPropsDto,
};

/** 组件 props 的默认值：装修器新增组件时按这个起手，小程序不必再兜一层 */
export const SECTION_DEFAULT_PROPS: Record<AppConfigSectionKey, Record<string, unknown>> = {
  [AppConfigSectionKey.BANNER]: { images: [], height: 180, radius: 0, interval: 3000 },
  [AppConfigSectionKey.ENTRY_GRID]: { cols: 2, title: '', items: [] },
  [AppConfigSectionKey.SEARCH_BAR]: { placeholder: '搜索门店', link: '/pages/stores/stores' },
  [AppConfigSectionKey.NOTICE]: { text: '', icon: 'notice' },
  [AppConfigSectionKey.SHOP_LIST]: { sortMode: 'distance', limit: 10, showDistance: true, title: '附近门店' },
  [AppConfigSectionKey.COUPON_ENTRY]: { title: '领券中心', benefit: '新人立减 5 元', icon: 'coupon' },
  [AppConfigSectionKey.USER_HEADER]: { bgType: 'gradient', bgColors: ['#C8752B', '#E8A860'], showId: true, bindPhoneTip: '点击绑定手机号' },
  [AppConfigSectionKey.ASSET_BAR]: {
    items: [
      { key: 'balance', label: '余额' },
      { key: 'point', label: '积分' },
      { key: 'coupon', label: '优惠券' },
    ],
  },
  [AppConfigSectionKey.ORDER_ENTRY]: {
    title: '我的订单',
    items: [
      { key: 'unpaid', text: '待付款', icon: 'unpaid' },
      { key: 'processing', text: '进行中', icon: 'pending' },
      { key: 'review', text: '待评价', icon: 'review' },
      { key: 'refund', text: '退款', icon: 'refund' },
    ],
  },
  [AppConfigSectionKey.SERVICE_GRID]: {
    title: '服务功能',
    cols: 3,
    items: [
      { key: 'address', text: '收货地址', icon: 'address' },
      { key: 'couponCenter', text: '领券中心', icon: 'coupon' },
      { key: 'couponMine', text: '我的优惠券', icon: 'coupon' },
      { key: 'memberCard', text: '会员卡', icon: 'memberCard' },
      { key: 'invoice', text: '发票管理', icon: 'invoice' },
      { key: 'service', text: '在线客服', icon: 'service' },
      { key: 'queue', text: '排队叫号', icon: 'queue' },
      { key: 'stores', text: '查看门店', icon: 'store' },
      { key: 'setting', text: '设置', icon: 'setting' },
    ],
  },
  [AppConfigSectionKey.MEMBER_CARD]: {
    bgType: 'gradient',
    bgColors: ['#3A2A1E', '#8B5E3C'],
    brandName: '旺卡咖啡',
    levelName: '黄金会员',
    showCardNo: true,
    showGrowth: true,
  },
  [AppConfigSectionKey.BENEFIT_GRID]: {
    title: '会员权益',
    cols: 4,
    items: [
      { key: 'birthday', text: '生日礼券', icon: 'birthday' },
      { key: 'freeShipping', text: '免配送费', icon: 'freeShipping' },
      { key: 'doublePoints', text: '积分加倍', icon: 'doublePoints' },
      { key: 'service', text: '专属客服', icon: 'service' },
    ],
  },
  [AppConfigSectionKey.TASK_LIST]: {
    title: '成长任务',
    items: [{ text: '累计消费满 200 元', btnText: '去完成', link: '/pages/stores/stores' }],
  },
  [AppConfigSectionKey.FOOTER_BUTTON]: { text: '立即开通会员', openedText: '查看我的权益' },
  [AppConfigSectionKey.COUPON_TABS]: {
    items: [
      { key: 'unused', text: '未使用' },
      { key: 'used', text: '已使用' },
      { key: 'expired', text: '已过期' },
    ],
    defaultIndex: 0,
  },
  [AppConfigSectionKey.COUPON_LIST]: {
    cardStyle: 'ticket',
    showShopName: true,
    showExpire: true,
    btnText: '立即使用',
    expiredBtnText: '已过期',
    emptyText: '暂无优惠券',
  },
  [AppConfigSectionKey.RULE_ENTRY]: { text: '使用规则' },
};

/**
 * 一份都没发布时 C 端拿到的兜底配置。
 *
 * 必须有：小程序首启不能因为「平台还没装修」而白屏。
 * 这里同时也是各字段缺省值的**唯一**事实来源，小程序端不必再兜一层。
 * 版式照 `Small-web/doc/ui.md`：首页只有品牌大图 + 五个场景入口。
 */
export const DEFAULT_APP_CONFIG_CONTENT = {
  theme: {
    primaryColor: '#c8752b',
    subColor: '#8b5e3c',
    bgColor: '#faf8f6',
    textColor: '#3a322c',
    subTextColor: '#9a908a',
    dividerColor: '#efebe7',
    radius: 16,
    cardAlpha: 0.7,
    cardGap: 8,
    sectionGap: 12,
    pageMargin: 16,
    tabbarSkin: 'warm',
  },
  pages: {
    home: [
      {
        id: 'default-banner',
        key: AppConfigSectionKey.BANNER,
        visible: true,
        props: { images: [], height: 200, radius: 0, interval: 3000 },
      },
      {
        id: 'default-entry-grid',
        key: AppConfigSectionKey.ENTRY_GRID,
        visible: true,
        props: {
          cols: 2,
          title: '',
          items: [
            { icon: 'takeout', text: '门店自取', link: '/pages/stores/stores?mode=pickup' },
            { icon: 'delivery', text: '外卖', link: '/pages/stores/stores?mode=delivery' },
            { icon: 'dinein', text: '堂食点餐', link: 'scan' },
            { icon: 'queue', text: '排队叫号', link: '/pages/queue/queue' },
            { icon: 'store', text: '查看门店', link: '/pages/stores/stores' },
          ],
        },
      },
      {
        id: 'default-notice',
        key: AppConfigSectionKey.NOTICE,
        visible: true,
        props: { text: '', icon: 'notice' },
      },
      {
        id: 'default-shop-list',
        key: AppConfigSectionKey.SHOP_LIST,
        visible: false,
        props: { sortMode: 'distance', limit: 10, showDistance: true, title: '附近门店' },
      },
      {
        id: 'default-search-bar',
        key: AppConfigSectionKey.SEARCH_BAR,
        visible: false,
        props: { placeholder: '搜索门店', link: '/pages/stores/stores' },
      },
      {
        id: 'default-coupon-entry',
        key: AppConfigSectionKey.COUPON_ENTRY,
        visible: false,
        props: { title: '领券中心', benefit: '', icon: 'coupon', link: '/pages/coupon/coupon' },
      },
    ],
    member: [
      {
        id: 'default-user-header',
        key: AppConfigSectionKey.USER_HEADER,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.USER_HEADER],
      },
      {
        id: 'default-asset-bar',
        key: AppConfigSectionKey.ASSET_BAR,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.ASSET_BAR],
      },
      {
        id: 'default-order-entry',
        key: AppConfigSectionKey.ORDER_ENTRY,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.ORDER_ENTRY],
      },
      {
        id: 'default-service-grid',
        key: AppConfigSectionKey.SERVICE_GRID,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.SERVICE_GRID],
      },
    ],
    card: [
      {
        id: 'default-member-card',
        key: AppConfigSectionKey.MEMBER_CARD,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.MEMBER_CARD],
      },
      {
        id: 'default-benefit-grid',
        key: AppConfigSectionKey.BENEFIT_GRID,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.BENEFIT_GRID],
      },
      {
        id: 'default-task-list',
        key: AppConfigSectionKey.TASK_LIST,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.TASK_LIST],
      },
      {
        id: 'default-footer-button',
        key: AppConfigSectionKey.FOOTER_BUTTON,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.FOOTER_BUTTON],
      },
    ],
    coupon: [
      {
        id: 'default-coupon-tabs',
        key: AppConfigSectionKey.COUPON_TABS,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.COUPON_TABS],
      },
      {
        id: 'default-coupon-list',
        key: AppConfigSectionKey.COUPON_LIST,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.COUPON_LIST],
      },
      {
        id: 'default-rule-entry',
        key: AppConfigSectionKey.RULE_ENTRY,
        visible: true,
        props: SECTION_DEFAULT_PROPS[AppConfigSectionKey.RULE_ENTRY],
      },
    ],
  },
};
