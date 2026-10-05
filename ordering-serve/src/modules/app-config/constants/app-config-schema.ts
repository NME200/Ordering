import { Type, type ClassConstructor } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 十六进制颜色，如 `#FF6B4A`。只收 6 位，避免 3 位简写在各端渲染不一致 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * 图片地址。
 *
 * `require_tld: false` 是为了让本地联调能用 `http://localhost:5173/x.png`；
 * 生产仍应是 https 的完整域名。刻意不收相对路径与 data URI ——
 * 小程序的 `<image>` 只认网络地址。
 */
const IMAGE_URL = { require_tld: false, protocols: ['http', 'https'] as string[] };

/** 首页组件白名单：**小程序端必须为每个 key 预置渲染器**，加一项就得同步发版 */
export enum AppConfigSectionKey {
  BANNER = 'banner',
  NOTICE = 'notice',
  CATEGORY_NAV = 'categoryNav',
  HOT_DISHES = 'hotDishes',
}

/** 组件中文名，用于报错文案与平台端组件库标题 */
export const SECTION_LABELS: Record<AppConfigSectionKey, string> = {
  [AppConfigSectionKey.BANNER]: '首页轮播',
  [AppConfigSectionKey.NOTICE]: '公告栏',
  [AppConfigSectionKey.CATEGORY_NAV]: '分类导航',
  [AppConfigSectionKey.HOT_DISHES]: '热销推荐位',
};

export const SECTION_KEYS = Object.values(AppConfigSectionKey);

/** 主题 token：小程序启动后映射成 CSS variables 与图片地址 */
export class AppThemeDto {
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'primaryColor 需为 #RRGGBB 格式' })
  primaryColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'backgroundColor 需为 #RRGGBB 格式' })
  backgroundColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'textPrimary 需为 #RRGGBB 格式' })
  textPrimary?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'textSecondary 需为 #RRGGBB 格式' })
  textSecondary?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cardRadius 必须为整数' })
  @Min(0, { message: 'cardRadius 最小为 0' })
  @Max(32, { message: 'cardRadius 最大为 32' })
  cardRadius?: number;

  @IsOptional()
  @IsUrl(IMAGE_URL, { message: 'headerImage 需为合法图片地址' })
  headerImage?: string;

  @IsOptional()
  @IsUrl(IMAGE_URL, { message: 'logoUrl 需为合法图片地址' })
  logoUrl?: string;

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

class BannerImageDto {
  @IsUrl(IMAGE_URL, { message: '轮播图片需为合法地址' })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '跳转链接最长 255 个字符' })
  link?: string;
}

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
  @IsUrl(IMAGE_URL, { message: '公告图标需为合法图片地址' })
  iconUrl?: string;
}

export class CategoryNavPropsDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([4, 5], { message: 'columns 只能是 4 或 5' })
  columns?: number;

  @IsOptional()
  @IsBoolean()
  showAll?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '标题最长 16 个字符' })
  title?: string;
}

export class HotDishesPropsDto {
  @IsOptional()
  @IsIn(['recommend', 'manual'], { message: 'source 只能是 recommend 或 manual' })
  source?: 'recommend' | 'manual';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: '手选菜品最多 12 个' })
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true, message: 'dishIds 需全为整数' })
  dishIds?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '标题最长 16 个字符' })
  title?: string;

  @IsOptional()
  @IsBoolean()
  showPrice?: boolean;
}

/** key → props 校验类。发布与保存草稿都按这张表分派，白名单外的 key 直接拒 */
export const SECTION_SCHEMAS: Record<AppConfigSectionKey, ClassConstructor<object>> = {
  [AppConfigSectionKey.BANNER]: BannerPropsDto,
  [AppConfigSectionKey.NOTICE]: NoticePropsDto,
  [AppConfigSectionKey.CATEGORY_NAV]: CategoryNavPropsDto,
  [AppConfigSectionKey.HOT_DISHES]: HotDishesPropsDto,
};

/**
 * 一份都没发布时 C 端拿到的兜底配置。
 *
 * 必须有：小程序首启不能因为「平台还没装修」而白屏。
 * 这里同时也是各字段缺省值的**唯一**事实来源，小程序端不必再兜一层。
 */
export const DEFAULT_APP_CONFIG_CONTENT = {
  theme: {
    primaryColor: '#c2603c',
    backgroundColor: '#f7f5f3',
    textPrimary: '#181615',
    textSecondary: '#6b615c',
    cardRadius: 12,
    headerImage: '',
    logoUrl: '',
    tabbarSkin: 'default',
  },
  sections: [
    {
      id: 'default-banner',
      key: AppConfigSectionKey.BANNER,
      visible: true,
      props: { images: [], height: 160, radius: 12 },
    },
    {
      id: 'default-notice',
      key: AppConfigSectionKey.NOTICE,
      visible: true,
      props: { text: '', bgColor: '#fdf3ec', textColor: '#c2603c' },
    },
    {
      id: 'default-category-nav',
      key: AppConfigSectionKey.CATEGORY_NAV,
      visible: true,
      props: { columns: 4, showAll: true, title: '点菜' },
    },
    {
      id: 'default-hot-dishes',
      key: AppConfigSectionKey.HOT_DISHES,
      visible: true,
      props: { source: 'recommend', title: '本店热销', showPrice: true },
    },
  ],
};
