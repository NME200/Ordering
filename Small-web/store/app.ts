import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchAppConfig } from '@/api/public';
import type { AppTheme, LayoutSection, PublicStore } from '@/types/api';

const CACHE_KEY = 'app-config-cache-v1';

/**
 * 内置兜底主题。
 *
 * 配置接口是限流最严的一个（30 次/分），且一行都没发布过时才回默认内容 ——
 * 拿不到配置时界面不能没有主色，所以这里保底一份。
 */
export const FALLBACK_THEME: AppTheme = {
  primaryColor: '#c2603c',
  backgroundColor: '#ffffff',
  textPrimary: '#241f1c',
  textSecondary: '#857a73',
  cardRadius: 0,
  tabbarSkin: 'default',
};

function readCache(): { version: number; theme: AppTheme; sections: LayoutSection[] } | null {
  try {
    const raw = uni.getStorageSync(CACHE_KEY);
    return raw ? (JSON.parse(raw) as { version: number; theme: AppTheme; sections: LayoutSection[] }) : null;
  } catch {
    return null;
  }
}

export const useAppStore = defineStore('app', () => {
  const theme = ref<AppTheme>({ ...FALLBACK_THEME });
  const sections = ref<LayoutSection[]>([]);
  const version = ref(0);
  /** 当前门店：进店后所有页面共用，冷启动从扫码参数恢复 */
  const store = ref<PublicStore | null>(null);

  /** 缓存先落地，小程序冷启动就不会有一秒是默认色 */
  function hydrate(): void {
    const cached = readCache();
    if (!cached) return;
    theme.value = { ...FALLBACK_THEME, ...cached.theme };
    sections.value = cached.sections;
    version.value = cached.version;
  }

  async function loadConfig(): Promise<void> {
    try {
      const res = await fetchAppConfig(version.value);
      if (res.unchanged || !res.content) return;
      version.value = res.version;
      theme.value = { ...FALLBACK_THEME, ...res.content.theme };
      sections.value = res.content.sections.filter((item) => item.visible);
      uni.setStorageSync(
        CACHE_KEY,
        JSON.stringify({ version: res.version, theme: theme.value, sections: sections.value }),
      );
    } catch {
      // 静默：装修配置拿不到不影响点餐，用兜底主题继续
    }
  }

  function section(key: LayoutSection['key']): LayoutSection | null {
    return sections.value.find((item) => item.key === key) ?? null;
  }

  /**
   * 主题下发到样式的唯一通道：把 token 铺成 CSS 变量挂在页面根节点上。
   *
   * 小程序支持自定义属性，所以组件里写 `var(--brand)` 即可跟着平台改色走，
   * 不需要每个组件都 import 一份色值。
   */
  const cssVars = computed(() => {
    const t = theme.value;
    return [
      `--brand:${t.primaryColor ?? FALLBACK_THEME.primaryColor}`,
      `--brand-soft:${t.primaryColor ?? FALLBACK_THEME.primaryColor}14`,
      `--page-bg:${t.backgroundColor ?? FALLBACK_THEME.backgroundColor}`,
      `--ink:${t.textPrimary ?? FALLBACK_THEME.textPrimary}`,
      `--ink-2:${t.textSecondary ?? FALLBACK_THEME.textSecondary}`,
      `--radius:${t.cardRadius ?? 0}px`,
    ].join(';');
  });

  return { theme, sections, version, store, hydrate, loadConfig, section, cssVars };
});
