import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  createAppConfig,
  fetchAppConfigs,
  publishAppConfig,
  removeAppConfig,
  renameAppConfig,
  updateAppConfig,
} from '@/api/app-config';
import { fetchDishCategoryOptions } from '@shared/api/dish-category';
import { fetchDishes } from '@shared/api/dish';
import { fetchStores } from '@shared/api/store';
import { useUserStore } from '@/store/modules/user';
import { Permission } from '@shared/types/enums';
import type { Store } from '@shared/types/store';
import type { Dish } from '@shared/types/dish';
import type {
  AppConfig,
  AppConfigPageKey,
  AppConfigPages,
  AppTheme,
  LayoutSection,
  PreviewData,
  PreviewDish,
  SaveAppConfigPayload,
  SectionKey,
} from '../../types/app-config';
import {
  APP_CONFIG_PAGES,
  DEFAULT_THEME,
  PAGE_SECTION_KEYS,
  SECTION_DEFAULTS,
} from '../../types/app-config';

/**
 * 装修器的共享状态。
 *
 * 模块级单例：工作台、三栏编辑器、主题面板、属性面板都要读写同一份草稿，
 * 用 props 一层层传下去会把 `pages` 的双向绑定切成好几段，反而更容易出错。
 *
 * 两条刻意的口径（与后端一致，别在界面上放开）：
 * - **只有草稿能编辑**，生效中与历史版本打开即只读，要改就复制一份新草稿；
 * - **同一页每种组件只放一个位置**，越界与重复在归一化时丢弃并提示。
 */

const configs = ref<AppConfig[]>([]);
const currentId = ref<number | null>(null);
const name = ref('未命名方案');
const theme = reactive<AppTheme>({});
const activePage = ref<AppConfigPageKey>('home');
const pages = reactive<AppConfigPages>({ home: [], member: [], card: [], coupon: [] });
const selectedId = ref<string | null>(null);
const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);

const stores = ref<Store[]>([]);
const previewStoreId = ref<number | undefined>();
const preview = reactive<PreviewData>({ categories: [], dishes: [], storeName: '' });

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function randomId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function emptyPages(): AppConfigPages {
  return { home: [], member: [], card: [], coupon: [] };
}

export function useDecoration() {
  const userStore = useUserStore();
  const canWrite = computed(() => userStore.hasPermission(Permission.APP_CONFIG_UPDATE));

  const sections = computed({
    get: () => pages[activePage.value],
    set: (next: LayoutSection[]) => {
      pages[activePage.value] = next;
    },
  });

  /** 当前选中的是生效中 / 历史版本时整页只读 */
  const readonly = computed(() => {
    if (currentId.value === null) {
      return !canWrite.value;
    }
    const target = configs.value.find((item) => item.id === currentId.value);
    return target ? target.status !== 'draft' || !canWrite.value : !canWrite.value;
  });

  const archivedSelected = computed(() => {
    const target = configs.value.find((item) => item.id === currentId.value);
    return target?.status === 'archived' ? target : null;
  });

  /** 当前选中的那一份（生效中与历史版本也算），界面靠它决定「能不能删 / 能不能改名」 */
  const selectedConfig = computed(
    () => configs.value.find((item) => item.id === currentId.value) ?? null,
  );

  /**
   * 生效中的那份不给删 —— 删了 C 端直接没有配置可读。
   * 其余（草稿、历史版本）都可以：历史版本堆成一排「未命名方案」时，
   * 留着也谈不上是回滚落点，不如让运营自己清掉。
   */
  const deletable = computed(() => {
    const target = selectedConfig.value;
    return canWrite.value && target !== null && target.status !== 'published';
  });

  const selectedSection = computed(
    () => sections.value.find((item) => item.id === selectedId.value) ?? null,
  );

  const usedKeys = computed(() => new Set(sections.value.map((item) => item.key)));

  const paletteKeys = computed(() => PAGE_SECTION_KEYS[activePage.value]);

  const palette = computed<LayoutSection[]>(() =>
    paletteKeys.value.map((key) => ({
      id: `palette-${key}`,
      key,
      visible: true,
      props: SECTION_DEFAULTS[key](),
    })),
  );

  const pageCount = computed(() => {
    const result: Record<AppConfigPageKey, number> = { home: 0, member: 0, card: 0, coupon: 0 };
    for (const page of APP_CONFIG_PAGES) {
      result[page] = pages[page].length;
    }
    return result;
  });

  /** 四页各自的可见组件数，工作台的页面表要用它显示「摆了几段」 */
  const visibleCount = computed(() => {
    const result: Record<AppConfigPageKey, number> = { home: 0, member: 0, card: 0, coupon: 0 };
    for (const page of APP_CONFIG_PAGES) {
      result[page] = pages[page].filter((item) => item.visible).length;
    }
    return result;
  });

  /* ---------------- 画布操作 ---------------- */

  function normalizeSections(): void {
    const allowed = PAGE_SECTION_KEYS[activePage.value];
    const seenKeys = new Set<SectionKey>();
    const seenIds = new Set<string>();
    const next: LayoutSection[] = [];
    let dropped = 0;
    for (const item of sections.value) {
      const key = item.key as SectionKey;
      if (!allowed.includes(key) || seenKeys.has(key)) {
        dropped += 1;
        continue;
      }
      seenKeys.add(key);
      const id = item.id && !seenIds.has(item.id) ? item.id : randomId();
      seenIds.add(id);
      const defaults = SECTION_DEFAULTS[key];
      next.push({
        id,
        key,
        visible: item.visible !== false,
        props: { ...(defaults ? defaults() : {}), ...clone(item.props ?? {}) },
      });
    }
    pages[activePage.value] = next;
    if (dropped > 0) {
      ElMessage.warning('这一页每种组件只能放一个，越界或重复的已丢弃');
    }
  }

  function addSection(key: SectionKey): void {
    if (usedKeys.value.has(key)) {
      ElMessage.warning('这一页已经有这个组件了，每种组件只能放一个位置');
      return;
    }
    sections.value.push({ id: randomId(), key, visible: true, props: SECTION_DEFAULTS[key]() });
    selectedId.value = sections.value[sections.value.length - 1].id;
  }

  function removeSection(id: string): void {
    pages[activePage.value] = sections.value.filter((item) => item.id !== id);
    if (selectedId.value === id) {
      selectedId.value = pages[activePage.value][0]?.id ?? null;
    }
  }

  function toggleVisible(section: LayoutSection): void {
    section.visible = !section.visible;
  }

  /**
   * 上下移动一位。
   *
   * 拖拽是主路径，但触屏与键盘需要一条确定性路径，而且排序最终要落库，
   * 能精确验证比手感重要。
   */
  function moveSection(id: string, delta: number): void {
    const list = sections.value;
    const from = list.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) {
      return;
    }
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    pages[activePage.value] = next;
  }

  function selectSection(id: string): void {
    selectedId.value = id;
  }

  /** 主题恢复默认：只动 theme，不碰已摆好的组件 */
  function resetTheme(): void {
    for (const key of Object.keys(theme) as (keyof AppTheme)[]) {
      delete theme[key];
    }
    Object.assign(theme, clone(DEFAULT_THEME));
  }

  function switchPage(page: AppConfigPageKey): void {
    activePage.value = page;
    selectedId.value = pages[page][0]?.id ?? null;
  }

  /* ---------------- 预览数据 ---------------- */

  async function loadStores(): Promise<void> {
    try {
      const page = await fetchStores({ page: 1, pageSize: 100 });
      stores.value = page.list;
    } catch {
      stores.value = [];
    }
  }

  async function loadPreview(): Promise<void> {
    if (!previewStoreId.value) {
      preview.categories = [];
      preview.dishes = [];
      return;
    }
    const store = stores.value.find((item) => item.id === previewStoreId.value);
    if (!store) {
      return;
    }
    const [categories, dishes] = await Promise.all([
      fetchDishCategoryOptions(store.merchantId, store.id).catch(() => []),
      fetchDishes({ page: 1, pageSize: 100, merchantId: store.merchantId, storeId: store.id }).catch(
        () => ({ list: [] as Dish[], total: 0, page: 1, pageSize: 100 }),
      ),
    ]);
    preview.storeName = store.name;
    preview.categories = categories.map((item) => item.name);
    preview.dishes = dishes.list.map(
      (dish): PreviewDish => ({ id: dish.id, name: dish.name, price: dish.effectivePrice, imageUrl: dish.imageUrl }),
    );
  }

  watch(previewStoreId, () => {
    void loadPreview();
  });

  /* ---------------- 方案读写 ---------------- */

  function applyConfig(config: AppConfig | null, id: number | null = config?.id ?? null): void {
    currentId.value = id;
    name.value = config?.name ?? '未命名方案';
    // 先铺默认主题再叠配置里的：新建一份草稿不必把六个色值重新点一遍
    Object.assign(theme, clone(DEFAULT_THEME), clone(config?.content.theme ?? {}));
    const next = emptyPages();
    for (const page of APP_CONFIG_PAGES) {
      next[page] = clone(config?.content.pages?.[page] ?? []);
    }
    Object.assign(pages, next);
    selectedId.value = pages[activePage.value][0]?.id ?? null;
  }

  async function loadConfigs(preferId?: number): Promise<void> {
    loading.value = true;
    try {
      configs.value = await fetchAppConfigs();
      const target =
        configs.value.find((item) => item.id === preferId) ??
        configs.value.find((item) => item.status === 'draft') ??
        configs.value.find((item) => item.status === 'published') ??
        null;
      applyConfig(target);
    } finally {
      loading.value = false;
    }
  }

  function selectConfig(id: number): void {
    const target = configs.value.find((item) => item.id === id);
    if (target) {
      applyConfig(target);
    }
  }

  /**
   * 从当前方案（或当前画布）复制一份未落库的新草稿。
   *
   * `currentId` 必须置 null：否则保存会拿源方案的 id 去改线上那行，而不是新建草稿。
   */
  function newDraft(): void {
    const source = configs.value.find((item) => item.id === currentId.value) ?? null;
    applyConfig(
      {
        id: 0,
        name: `${source?.name ?? name.value} 副本`,
        status: 'draft',
        statusLabel: '草稿',
        version: 0,
        content: clone(source?.content ?? { theme, pages: clone(pages) }),
        createdBy: null,
        publishedAt: null,
        createdAt: '',
        updatedAt: '',
      },
      null,
    );
  }

  function toPayload(): SaveAppConfigPayload {
    const next: AppConfigPages = emptyPages();
    for (const page of APP_CONFIG_PAGES) {
      next[page] = pages[page].map((item) => ({
        id: item.id,
        key: item.key,
        visible: item.visible,
        props: clone(item.props),
      }));
    }
    return { name: name.value.trim() || '未命名方案', theme: clone(theme), pages: next };
  }

  async function persistDraft(): Promise<AppConfig> {
    const payload = toPayload();
    return currentId.value === null
      ? createAppConfig(payload)
      : updateAppConfig(currentId.value, payload);
  }

  async function saveDraft(): Promise<AppConfig | null> {
    saving.value = true;
    try {
      const saved = await persistDraft();
      currentId.value = saved.id;
      ElMessage.success('草稿已保存');
      await loadConfigs(saved.id);
      return saved;
    } catch {
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function saveDraftSilently(): Promise<AppConfig | null> {
    try {
      const saved = await persistDraft();
      currentId.value = saved.id;
      return saved;
    } catch {
      return null;
    }
  }

  /** 发布前先存一次：顾客看到的必须正是画布上这份，而不是上一次保存的旧内容 */
  async function publishNow(): Promise<void> {
    publishing.value = true;
    try {
      const saved = await saveDraftSilently();
      if (!saved) {
        return;
      }
      const published = await publishAppConfig(saved.id);
      ElMessage.success(`已发布，版本号 v${published.version}`);
      await loadConfigs(published.id);
    } catch {
      // 缺失项已由请求层逐条弹出
    } finally {
      publishing.value = false;
    }
  }

  /** 回滚 = 把历史版本再发布一次，版本号继续往前走（C 端靠它判新旧） */
  async function rollback(id: number): Promise<void> {
    publishing.value = true;
    try {
      const published = await publishAppConfig(id);
      ElMessage.success(`已回到那一版，现在生效的是 v${published.version}`);
      await loadConfigs(published.id);
    } catch {
      // 失败原因已由请求层弹出
    } finally {
      publishing.value = false;
    }
  }

  /** 删除当前这份方案（软删）。生效中的由服务端兜底拒绝 */
  async function removeConfig(id: number): Promise<void> {
    await removeAppConfig(id);
    ElMessage.success('方案已删除');
    if (currentId.value === id) {
      currentId.value = null;
    }
    await loadConfigs();
  }

  /** 改名对三种状态都开放：那只是标签，不动内容也不动版本号 */
  async function renameConfig(id: number, nextName: string): Promise<void> {
    const trimmed = nextName.trim();
    if (!trimmed) {
      ElMessage.warning('名字不能为空');
      return;
    }
    const saved = await renameAppConfig(id, trimmed);
    if (currentId.value === id) {
      name.value = saved.name;
    }
    ElMessage.success('名称已更新');
    await loadConfigs(currentId.value ?? undefined);
  }

  return {
    // state
    configs,
    currentId,
    name,
    theme,
    pages,
    activePage,
    selectedId,
    loading,
    saving,
    publishing,
    stores,
    previewStoreId,
    preview,
    // computed
    canWrite,
    sections,
    readonly,
    archivedSelected,
    selectedConfig,
    deletable,
    selectedSection,
    usedKeys,
    palette,
    paletteKeys,
    pageCount,
    visibleCount,
    // actions
    addSection,
    removeSection,
    toggleVisible,
    moveSection,
    selectSection,
    switchPage,
    resetTheme,
    normalizeSections,
    loadConfigs,
    loadStores,
    selectConfig,
    newDraft,
    saveDraft,
    publishNow,
    rollback,
    removeConfig,
    renameConfig,
  };
}

export type Decoration = ReturnType<typeof useDecoration>;
