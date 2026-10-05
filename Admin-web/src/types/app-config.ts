/**
 * 小程序布局配置 —— 与后端 `modules/app-config` 的出参/入参对齐。
 *
 * 只有平台端用得到，所以放在 Admin-web 而不是 Web-shared
 * （与 `types/payment-config.ts` 同样的归属判断）。
 */

export type AppConfigStatus = 'draft' | 'published' | 'archived';

export const APP_CONFIG_STATUS_LABELS: Record<AppConfigStatus, string> = {
  draft: '草稿',
  published: '生效中',
  archived: '历史版本',
};

/** 首页组件类型白名单，必须与后端 `AppConfigSectionKey` 一致 */
export type SectionKey = 'banner' | 'notice' | 'categoryNav' | 'hotDishes';

export interface AppTheme {
  primaryColor?: string;
  backgroundColor?: string;
  textPrimary?: string;
  textSecondary?: string;
  cardRadius?: number;
  headerImage?: string;
  logoUrl?: string;
  /** tabBar 皮肤标识：图标是小程序包内静态资源，这里只能下发「用哪一套」 */
  tabbarSkin?: string;
}

export interface BannerImage {
  url: string;
  link?: string;
}

export interface BannerProps {
  images: BannerImage[];
  height?: number;
  radius?: number;
}

export interface NoticeProps {
  text: string;
  bgColor?: string;
  textColor?: string;
  iconUrl?: string;
}

export interface CategoryNavProps {
  columns?: 4 | 5;
  showAll?: boolean;
  title?: string;
}

export interface HotDishesProps {
  source?: 'recommend' | 'manual';
  dishIds?: number[];
  title?: string;
  showPrice?: boolean;
}

/**
 * 各组件 props 的并集（字段都可空 —— 具体哪个组件需要哪些字段由后端按 key 校验）。
 *
 * 刻意用「一个可空字段并集」而不是 `Record<string, unknown>`：
 * 属性面板要能直接 `v-model` 绑到具体字段上。
 */
export interface SectionProps {
  images?: BannerImage[];
  height?: number;
  radius?: number;
  text?: string;
  bgColor?: string;
  textColor?: string;
  iconUrl?: string;
  columns?: number;
  showAll?: boolean;
  title?: string;
  source?: 'recommend' | 'manual';
  dishIds?: number[];
  showPrice?: boolean;
}

export interface LayoutSection {
  id: string;
  key: SectionKey;
  visible: boolean;
  props: SectionProps;
}

export interface AppConfigContent {
  theme: AppTheme;
  sections: LayoutSection[];
}

export interface AppConfig {
  id: number;
  name: string;
  status: AppConfigStatus;
  statusLabel: string;
  version: number;
  content: AppConfigContent;
  createdBy: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 保存入参：后端 DTO 是扁平的 `{ name, theme, sections }`，不是嵌 content */
export interface SaveAppConfigPayload {
  name: string;
  theme: AppTheme;
  sections: LayoutSection[];
}

/** 预览用的菜品摘要（来自所选预览门店的真实菜单） */
export interface PreviewDish {
  id: number;
  name: string;
  price: number;
  imageUrl: string | null;
}

/** 装修画布的预览数据源 */
export interface PreviewData {
  categories: string[];
  dishes: PreviewDish[];
}

/** 各组件的默认属性：拖进画布时用它初始化，避免属性面板对着 undefined 渲染 */
export const SECTION_DEFAULTS: Record<SectionKey, () => SectionProps> = {
  banner: () => ({ images: [], height: 160, radius: 12 }),
  notice: () => ({ text: '', bgColor: '#fdf3ec', textColor: '#c2603c' }),
  categoryNav: () => ({ columns: 4, showAll: true, title: '点菜' }),
  hotDishes: () => ({ source: 'recommend', title: '本店热销', showPrice: true }),
};

/** 组件库的展示元信息 */
export const SECTION_META: Record<SectionKey, { label: string; hint: string }> = {
  banner: { label: '首页轮播', hint: '节假日换头图就改这里，最多 5 张' },
  notice: { label: '公告栏', hint: '一行滚动文字，最长 60 字' },
  categoryNav: { label: '分类导航', hint: '首页的分类入口格子' },
  hotDishes: { label: '热销推荐位', hint: '自动取推荐菜，或手选菜品' },
};
