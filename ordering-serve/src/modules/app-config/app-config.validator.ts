import { plainToInstance } from 'class-transformer';
import {
  AppConfigPageKey,
  AppConfigSectionKey,
  PAGE_LABELS,
  PAGE_SECTION_KEYS,
  SECTION_LABELS,
  SECTION_SCHEMAS,
  AppThemeDto,
} from './constants/app-config-schema';
import { isAppLinkTarget } from '../../shared/constants/app-entry';
import { collectValidationErrors as collectErrors } from '../../common/utils/validation-errors';
import { AppConfigContent, AppConfigSection } from './entities/app-config.entity';

function sectionLabel(key: string): string {
  const label = SECTION_LABELS[key as AppConfigSectionKey];
  return label ? `${label}（${key}）` : key;
}

const APP_PAGES = Object.values(AppConfigPageKey);

/** 组件属于哪个页面；越界放置要给出「它能放在哪」的提示 */
function ownerPageLabel(key: AppConfigSectionKey): string {
  const page = APP_PAGES.find((item) => PAGE_SECTION_KEYS[item].includes(key));
  return page ? PAGE_LABELS[page] : '未知页面';
}

/**
 * 递归找出所有 `link` 字段。
 *
 * 跳转链接散在各组件 props 的各层（轮播每张图、宫格每一项、底部按钮…），
 * 与其让每个组件 DTO 重复写一遍成员校验，不如统一扫一次：
 * 形状由 DTO 卡（是不是 `/pages/x/x`），成员资格由这里卡（页面是否真存在）。
 */
function collectLinks(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectLinks(item, out));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [field, value] of Object.entries(node as Record<string, unknown>)) {
      if (field === 'link') {
        if (typeof value === 'string' && value) out.push(value);
      } else {
        collectLinks(value, out);
      }
    }
  }
}

/** 跳转必须命中小程序真有的页面（或保留动作 `scan`） */
function assertLinkTargets(props: Record<string, unknown>, label: string): string[] {
  const links: string[] = [];
  collectLinks(props, links);
  return links
    .filter((link) => !isAppLinkTarget(link))
    .map((link) => `${label}：跳转地址 ${link} 不是小程序已有的页面`);
}

/**
 * 校验一份布局内容（四个页面一起）。
 *
 * 返回错误列表而不是抛异常，因为草稿与发布用同一套结构校验、
 * 差别只在 `strict`：**草稿允许缺字段，发布必须齐**。
 */
export function validateAppConfigContent(content: AppConfigContent, strict: boolean): string[] {
  const errors: string[] = [];

  errors.push(...collectErrors(plainToInstance(AppThemeDto, content.theme ?? {}), '主题'));

  const pages = content.pages ?? ({} as AppConfigContent['pages']);
  for (const page of APP_PAGES) {
    const sections = pages[page] ?? [];
    const pageLabel = PAGE_LABELS[page];
    const allowed = PAGE_SECTION_KEYS[page];
    const seenKeys = new Set<string>();

    for (const section of sections) {
      const key = section.key as AppConfigSectionKey;

      const label = `${pageLabel}的${sectionLabel(section.key)}`;

      if (seenKeys.has(section.key)) {
        errors.push(`${label} 重复添加，同一页面里一个组件只能放一次`);
      }
      seenKeys.add(section.key);

      if (!allowed.includes(key)) {
        errors.push(`${pageLabel}不支持组件「${sectionLabel(section.key)}」，它属于${ownerPageLabel(key)}`);
        continue;
      }

      const schema = SECTION_SCHEMAS[key];
      if (!schema) {
        errors.push(`不支持的组件类型：${section.key}`);
        continue;
      }
      errors.push(...collectErrors(plainToInstance(schema, section.props ?? {}), label));
      errors.push(...assertLinkTargets(section.props ?? {}, label));

      if (strict && section.visible) {
        errors.push(...collectRequiredFields(page, section));
      }
    }
  }

  if (strict) {
    const home = pages[AppConfigPageKey.HOME] ?? [];
    if (home.length === 0) {
      errors.push(`${PAGE_LABELS[AppConfigPageKey.HOME]}至少需要一个组件`);
    }
    if (!home.some((section) => section.visible)) {
      errors.push(`${PAGE_LABELS[AppConfigPageKey.HOME]}至少要有一个可见组件，否则小程序首启是白屏`);
    }
    /**
     * 其余三页**不要求装修**：留空时 C 端按页回落到内置默认（见 service 的 resolveForClient），
     * 逼运营把四页都摆满只会换来一堆凑数的组件。
     */
    for (const [field, label] of REQUIRED_THEME_FIELDS) {
      const value = (content.theme as Record<string, unknown>)?.[field];
      if (value === undefined || value === null || value === '') {
        errors.push(`主题的「${label}」未填写`);
      }
    }
  }

  return errors;
}

/** 发布时必须有值的主题字段（缺了小程序就没法正确渲染） */
const REQUIRED_THEME_FIELDS: readonly [string, string][] = [
  ['primaryColor', '主色'],
  ['bgColor', '背景色'],
  ['textColor', '主文字色'],
  ['radius', '卡片圆角'],
];

/** 各组件「开着就必须填完整」的字段 */
function collectRequiredFields(page: AppConfigPageKey, section: AppConfigSection): string[] {
  const props = section.props as Record<string, unknown>;
  const label = `${PAGE_LABELS[page]}的${sectionLabel(section.key)}`;
  const items = (props.items ?? []) as unknown[];

  switch (section.key) {
    case AppConfigSectionKey.BANNER: {
      const images = (props.images ?? []) as { url?: string }[];
      if (images.length === 0) return [`${label} 已显示但未配置任何图片`];
      return images.some((image) => !image?.url) ? [`${label} 存在空图片地址`] : [];
    }
    case AppConfigSectionKey.NOTICE:
      return props.text ? [] : [`${label} 已显示但公告文案为空`];
    case AppConfigSectionKey.ENTRY_GRID:
      return items.length > 0 ? [] : [`${label} 已显示但一个入口都没配`];
    case AppConfigSectionKey.ASSET_BAR:
      return items.length > 0 ? [] : [`${label} 已显示但没有资产项`];
    case AppConfigSectionKey.ORDER_ENTRY:
      return items.length > 0 ? [] : [`${label} 已显示但没配订单入口`];
    case AppConfigSectionKey.SERVICE_GRID:
      return items.length > 0 ? [] : [`${label} 已显示但服务宫格是空的`];
    case AppConfigSectionKey.COUPON_TABS:
      return items.length > 0 ? [] : [`${label} 已显示但页签是空的`];
    case AppConfigSectionKey.COUPON_ENTRY:
      return props.title ? [] : [`${label} 已显示但标题为空`];
    case AppConfigSectionKey.RULE_ENTRY:
      return props.text ? [] : [`${label} 已显示但入口文案为空`];
    case AppConfigSectionKey.FOOTER_BUTTON:
      return props.text ? [] : [`${label} 已显示但按钮文案为空`];
    case AppConfigSectionKey.USER_HEADER:
    case AppConfigSectionKey.MEMBER_CARD: {
      if (props.bgType === 'gradient' && !props.bgImage) {
        const colors = (props.bgColors ?? []) as unknown[];
        if (colors.length < 2) return [`${label} 选了渐变背景，但没给两个色值`];
      }
      return [];
    }
    default:
      return [];
  }
}
