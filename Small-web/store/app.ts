import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchAppConfig } from '@/api/public';
import type { AppConfigPageKey, AppTheme, LayoutSection, PublicStore } from '@/types/api';
import { getVisitorKey } from '@/utils/visitor';

const CACHE_KEY = 'app-config-cache-v2';
const DINING_KEY = 'dining-type-v1';
const TABLE_KEY = 'table-no-v1';

/** 与后端 DINING_OPTION_KEYS 对齐的点餐方式键 */
export type DiningChoice = 'dineIn' | 'pickup' | 'delivery';

/** 点餐方式键 → 后端 orders.dining_type 数值（0 堂食 / 1 自提 / 2 外卖） */
export const DINING_TYPE_VALUE: Record<DiningChoice, number> = {
  dineIn: 0,
  pickup: 1,
  delivery: 2,
};

export const DINING_TYPE_LABEL: Record<DiningChoice, string> = {
  dineIn: '堂食点餐',
  pickup: '门店自取',
  delivery: '外卖配送',
};

/**
 * 内置兜底主题（ui.md 第一节的 Design Tokens）。
 *
 * 配置接口限流 30 次/分，且平台一行都没发布过时才回默认内容 ——
 * 拿不到配置时界面不能没有主色，所以这里保底一份。
 * 这里的值与后端 `DEFAULT_APP_CONFIG_CONTENT.theme` 必须一致。
 */
export const FALLBACK_THEME: AppTheme = {
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
};

type PageSections = Record<AppConfigPageKey, LayoutSection[]>;

/**
 * 桌号连同「它是哪家店的桌」一起存。
 *
 * 旧版本只存了桌号字符串 —— 那种记录没法判断属于哪家店，读到时直接当空处理，
 * 宁可让顾客重新扫一次码，也不能把上一家店的 A12 端到这一家来。
 */
interface TableBinding {
  storeId: number;
  tableNo: string;
}

function readTableBinding(): TableBinding {
  const raw = String(uni.getStorageSync(TABLE_KEY) || '');
  if (!raw) {
    return { storeId: 0, tableNo: '' };
  }
  try {
    const parsed = JSON.parse(raw) as { storeId?: unknown; tableNo?: unknown };
    return { storeId: Number(parsed.storeId) || 0, tableNo: String(parsed.tableNo ?? '') };
  } catch {
    return { storeId: 0, tableNo: '' };
  }
}

function emptyPages(): PageSections {
  return { home: [], member: [], card: [], coupon: [] };
}

function visibleOnly(pages: PageSections): PageSections {
  return Object.fromEntries(
    Object.entries(pages).map(([key, list]) => [key, list.filter((item) => item.visible)]),
  ) as PageSections;
}

function readCache(): { version: number; theme: AppTheme; pages: PageSections } | null {
  try {
    const raw = uni.getStorageSync(CACHE_KEY);
    return raw ? (JSON.parse(raw) as { version: number; theme: AppTheme; pages: PageSections }) : null;
  } catch {
    return null;
  }
}

export const useAppStore = defineStore('app', () => {
  const theme = ref<AppTheme>({ ...FALLBACK_THEME });
  const pages = ref<PageSections>(emptyPages());
  const version = ref(0);
  /** 当前门店：进店后所有页面共用，冷启动从扫码参数恢复 */
  const store = ref<PublicStore | null>(null);
  /** 顾客位置：只在内存里，用于算距离；拒绝授权时为 null */
  const position = ref<{ latitude: number; longitude: number } | null>(null);

  /** 弹窗埋点与将来的账号都挂在这个设备标识上 */
  const visitorKey = getVisitorKey();

  /** 缓存先落地，小程序冷启动就不会有一秒是默认色 */
  function hydrate(): void {
    const cached = readCache();
    if (!cached) return;
    theme.value = { ...FALLBACK_THEME, ...cached.theme };
    pages.value = cached.pages;
    version.value = cached.version;
  }

  /**
   * 原生 tabBar 的选中色是编译期写死在 pages.json 里的，
   * 平台改了主色就会「页面新、底栏旧」，所以拉到配置后再同步一次。
   */
  function syncTabBar(color: string): void {
    uni.setTabBarStyle({ selectedColor: color, fail: () => undefined });
  }

  /**
   * 拉整份皮肤（主题 + 四个页面）。
   *
   * 后端刻意一次给全四页：按页发四个请求会把同一个限流桶一次消耗四次，
   * 而且四页共用一个版本号才能保证「换肤不会半新半旧」。
   */
  async function loadConfig(): Promise<void> {
    try {
      const res = await fetchAppConfig(version.value);
      if (res.unchanged || !res.pages) return;
      version.value = res.version;
      theme.value = { ...FALLBACK_THEME, ...(res.theme ?? {}) };
      pages.value = visibleOnly({ ...emptyPages(), ...res.pages });
      uni.setStorageSync(
        CACHE_KEY,
        JSON.stringify({ version: res.version, theme: theme.value, pages: pages.value }),
      );
      syncTabBar(theme.value.primaryColor ?? FALLBACK_THEME.primaryColor ?? '#c8752b');
    } catch {
      // 静默：装修配置拿不到不影响点餐，用兜底主题继续
    }
  }

  /**
   * 就餐方式（堂食 / 自提 / 外卖）。
   *
   * 只影响下单记录与展示，不改价格；本地缓存一份，顾客选一次后进菜单、
   * 确认页都沿用同一个值，否则每页都要重选。
   */
  const diningType = ref<DiningChoice>(
    (uni.getStorageSync(DINING_KEY) as DiningChoice) || 'dineIn',
  );

  /**
   * 桌号：**只能由桌上的二维码带进来**（见 utils/scan 调 applyScan），界面上没有手填口。
   *
   * 和门店绑在一起存 —— 换一家店继续点时，上一桌的号必须自动失效，
   * 否则「A12」会跟着顾客跑到另一家店，餐端到错桌去。
   */
  const table = ref<TableBinding>(readTableBinding());
  const tableNo = computed(() => table.value.tableNo);
  /** 扫码带进来的门店，一次性：点餐页取走后就清掉 */
  const scanStoreId = ref(0);

  function setDiningType(value: DiningChoice): void {
    diningType.value = value;
    uni.setStorageSync(DINING_KEY, value);
  }

  /**
   * 应用一次扫码结果：定店 + 定桌。
   *
   * 没带桌号的码（店门口的店码、纯数字门店 ID）不清掉已坐下的桌号 ——
   * 同一家店里「扫了一次没桌号的码」不该把顾客赶回未入座状态；换店才清。
   */
  function applyScan(target: { storeId: number; tableNo: string }): void {
    const no = target.tableNo.trim();
    const kept = !no && table.value.storeId === target.storeId ? table.value.tableNo : no;
    scanStoreId.value = target.storeId;
    table.value = { storeId: target.storeId, tableNo: kept };
    uni.setStorageSync(TABLE_KEY, JSON.stringify(table.value));
  }

  /** 点餐页进店时调用：不是扫码那家店，就把带进来的桌号清掉 */
  function bindTableStore(storeId: number): void {
    if (table.value.storeId === storeId) {
      return;
    }
    table.value = { storeId, tableNo: '' };
    uni.setStorageSync(TABLE_KEY, JSON.stringify(table.value));
  }

  /** 取走扫码门店（读完即清，避免下次冷启动还往这家店跳） */
  function takeScanStore(): number {
    const id = scanStoreId.value;
    scanStoreId.value = 0;
    return id;
  }

  /** 取某一页的可见组件；白名单外的 key 在渲染侧跳过，不在这里报错 */
  function sectionsOf(page: AppConfigPageKey): LayoutSection[] {
    return pages.value[page] ?? [];
  }

  function section<T extends LayoutSection = LayoutSection>(page: AppConfigPageKey, key: LayoutSection['key']): T | null {
    return (sectionsOf(page).find((item) => item.key === key) as T | undefined) ?? null;
  }

  /**
   * 主题下发到样式的唯一通道：把 token 铺成 CSS 变量挂在页面根节点上。
   *
   * 组件里一律写 `var(--brand)` 才能跟着平台改色走；
   * 写成 SCSS 字面量的话，平台换成绿色时价格仍是橙色（上一轮的真实缺陷）。
   */
  const cssVars = computed(() => {
    const t = { ...FALLBACK_THEME, ...theme.value };
    const alpha = t.cardAlpha ?? 0.7;
    return [
      `--brand:${t.primaryColor}`,
      `--brand-sub:${t.subColor}`,
      `--brand-soft:${t.primaryColor}14`,
      `--page-bg:${t.bgColor}`,
      `--ink:${t.textColor}`,
      `--ink-2:${t.subTextColor}`,
      `--divider:${t.dividerColor}`,
      `--radius:${t.radius}px`,
      `--card-bg:rgba(255,255,255,${alpha})`,
      `--card-gap:${t.cardGap}px`,
      `--section-gap:${t.sectionGap}px`,
      `--page-margin:${t.pageMargin}px`,
      /**
       * 内容型页面（确认订单 / 收银台 / 订单详情 / 地址…）的左右留白。
       *
       * 不直接用 `--page-margin`：平台把它调成 0 是想让首页 banner 通栏，
       * 但内容页跟着归零就变成文字贴屏幕边、右侧「联调渠道」这类标签被裁掉。
       * 这里兜一个 14px 的下限，平台给得更大时按平台的走。
       */
      `--content-pad:${Math.max(14, t.pageMargin ?? 16)}px`,
      `--chip-bg:${t.bgColor === '#ffffff' ? '#f4f1ee' : '#ffffff'}`,
    ].join(';');
  });

  return {
    theme,
    pages,
    version,
    store,
    position,
    visitorKey,
    diningType,
    tableNo,
    hydrate,
    loadConfig,
    sectionsOf,
    section,
    setDiningType,
    applyScan,
    bindTableStore,
    takeScanStore,
    cssVars,
  };
});
