import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AppConfigSectionKey,
  SECTION_LABELS,
  SECTION_SCHEMAS,
  AppThemeDto,
} from './constants/app-config-schema';
import { AppConfigContent, AppConfigSection } from './entities/app-config.entity';

/** 收集 class-validator 的错误文案 */
function collectErrors(target: object): string[] {
  return validateSync(target, {
    // 未声明的字段直接判错：宁可让平台端改配置时报错，也不要把拼错的属性名静默存进库里
    whitelist: true,
    forbidNonWhitelisted: true,
  }).flatMap((error) =>
    error.constraints ? Object.values(error.constraints) : [],
  );
}

function sectionLabel(key: string): string {
  const label = SECTION_LABELS[key as AppConfigSectionKey];
  return label ? `${label}（${key}）` : key;
}

/**
 * 校验一份布局内容。
 *
 * 返回错误列表而不是抛异常，因为草稿与发布用同一套结构校验、
 * 差别只在 `strict`：**草稿允许缺字段，发布必须齐**。
 */
export function validateAppConfigContent(content: AppConfigContent, strict: boolean): string[] {
  const errors: string[] = [];

  errors.push(...collectErrors(plainToInstance(AppThemeDto, content.theme ?? {})));

  const sections = content.sections ?? [];
  const seenKeys = new Set<string>();
  for (const section of sections) {
    if (seenKeys.has(section.key)) {
      errors.push(`${sectionLabel(section.key)} 重复添加，同一组件只能放一个`);
    }
    seenKeys.add(section.key);

    const schema = SECTION_SCHEMAS[section.key as AppConfigSectionKey];
    if (!schema) {
      errors.push(`不支持的组件类型：${section.key}`);
      continue;
    }
    errors.push(...collectErrors(plainToInstance(schema, section.props ?? {})));

    if (strict && section.visible) {
      errors.push(...collectRequiredFields(section));
    }
  }

  if (strict) {
    if (sections.length === 0) {
      errors.push('至少需要一个组件');
    }
    if (!sections.some((section) => section.visible)) {
      errors.push('至少要有一个可见组件，否则小程序首页会是空白');
    }
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
  ['backgroundColor', '背景色'],
  ['textPrimary', '主文字色'],
  ['cardRadius', '卡片圆角'],
];

/** 各组件「开着就必须填完整」的字段 */
function collectRequiredFields(section: AppConfigSection): string[] {
  const props = section.props as Record<string, unknown>;
  const label = sectionLabel(section.key);

  switch (section.key) {
    case AppConfigSectionKey.BANNER: {
      const images = (props.images ?? []) as { url?: string }[];
      if (images.length === 0) {
        return [`${label} 已显示但未配置任何图片`];
      }
      return images.some((image) => !image?.url) ? [`${label} 存在空图片地址`] : [];
    }
    case AppConfigSectionKey.NOTICE:
      return props.text ? [] : [`${label} 已显示但公告文案为空`];
    case AppConfigSectionKey.HOT_DISHES:
      if (props.source === 'manual' && !(props.dishIds as unknown[])?.length) {
        return [`${label} 选择手选菜品，但还没挑菜`];
      }
      return [];
    default:
      return [];
  }
}
