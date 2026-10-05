<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import {
  ArrowDown,
  ArrowUp,
  Delete,
  DocumentCopy,
  Hide,
  Plus,
  Refresh,
  RefreshLeft,
  Upload,
  View,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  createAppConfig,
  fetchAppConfigs,
  publishAppConfig,
  removeAppConfig,
  updateAppConfig,
} from '@/api/app-config';
import { fetchDishCategoryOptions } from '@shared/api/dish-category';
import { fetchDishes } from '@shared/api/dish';
import { fetchStores } from '@shared/api/store';
import PageHeader from '@shared/components/PageHeader.vue';
import { useUserStore } from '@/store/modules/user';
import { Permission } from '@shared/types/enums';
import type { Store } from '@shared/types/store';
import type { Dish } from '@shared/types/dish';
import type {
  AppConfig,
  AppTheme,
  LayoutSection,
  PreviewData,
  PreviewDish,
  SectionKey,
} from '../../types/app-config';
import { SECTION_DEFAULTS, SECTION_META } from '../../types/app-config';
import PropsPanel from './PropsPanel.vue';
import SectionForm from './SectionForm.vue';
import SectionPreview from './SectionPreview.vue';

/**
 * 小程序布局装修器（平台管理端）。
 *
 * 三栏：组件库（拖出）→ 手机壳画布（排序 / 选中 / 显隐 / 删除）→ 属性面板。
 *
 * 两条刻意的取舍：
 * - **预览是近似复刻，不是小程序真渲染**。两端只共用 props 与主题 token，
 *   所以预览尽量用真实数据（选了预览门店就拉真分类与真菜品），减少漂移；
 * - **只有草稿能编辑**。生效中与历史版本打开即只读，要改就从它复制一份新草稿，
 *   这样「线上下着的那份」永远不会被误改一半。
 */
const userStore = useUserStore();

const canWrite = computed(() => userStore.hasPermission(Permission.APP_CONFIG_UPDATE));

/* ---------------- 编辑中的方案 ---------------- */

const configs = ref<AppConfig[]>([]);
const currentId = ref<number | null>(null);
const name = ref('未命名方案');
const theme = reactive<AppTheme>({});
const sections = ref<LayoutSection[]>([]);
const selectedId = ref<string | null>(null);
const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);

/** 当前选中的是生效中 / 历史版本时整页只读 */
const readonly = computed(() => {
  if (currentId.value === null) {
    return !canWrite.value;
  }
  const target = configs.value.find((item) => item.id === currentId.value);
  return target ? target.status !== 'draft' || !canWrite.value : !canWrite.value;
});

/** 选中的是历史版本时给一个「回到这一版」入口：回滚 = 把归档那份再发布一次 */
const archivedSelected = computed(() => {
  const target = configs.value.find((item) => item.id === currentId.value);
  return target?.status === 'archived' ? target : null;
});

const selectedSection = computed(
  () => sections.value.find((item) => item.id === selectedId.value) ?? null,
);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function randomId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 规整画布列表。
 *
 * 拖拽进来的项要处理两件事：
 * - 从组件库 clone 的那份与库里模板是同一个对象引用，不深拷贝的话拖两份轮播会共用 props；
 * - **每种组件只允许一个位置**（与后端同口径），拖重了的丢掉并提示，免得保存时才报错。
 */
function normalizeSections(): void {
  const seenKeys = new Set<SectionKey>();
  const seenIds = new Set<string>();
  const next: LayoutSection[] = [];
  let dropped = 0;
  for (const item of sections.value) {
    const key = item.key as SectionKey;
    if (seenKeys.has(key)) {
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
  sections.value = next;
  if (dropped > 0) {
    ElMessage.warning(`每种组件只能放一个位置，多出来的 ${dropped} 个已丢弃`);
  }
}

/* ---------------- 预览数据（选了门店才是真的） ---------------- */

const stores = ref<Store[]>([]);
const previewStoreId = ref<number | undefined>();
const preview = reactive<PreviewData>({ categories: [], dishes: [] });

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
  preview.categories = categories.map((item) => item.name);
  preview.dishes = dishes.list.map(
    (dish): PreviewDish => ({
      id: dish.id,
      name: dish.name,
      price: dish.effectivePrice,
      imageUrl: dish.imageUrl,
    }),
  );
}

watch(previewStoreId, () => {
  void loadPreview();
});

/* ---------------- 方案读写 ---------------- */

function applyConfig(config: AppConfig | null, id: number | null = config?.id ?? null): void {
  currentId.value = id;
  name.value = config?.name ?? '未命名方案';
  Object.assign(theme, clone(config?.content.theme ?? {}));
  for (const key of Object.keys(theme) as (keyof AppTheme)[]) {
    if (!(key in (config?.content.theme ?? {}))) {
      delete theme[key];
    }
  }
  sections.value = clone(config?.content.sections ?? []);
  selectedId.value = sections.value[0]?.id ?? null;
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
 * `currentId` 必须是 null：否则保存时会拿源方案的 id 去改线上那份，
 * 而不是新建一份草稿。
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
      content: clone(source?.content ?? { theme, sections: sections.value }),
      createdBy: null,
      publishedAt: null,
      createdAt: '',
      updatedAt: '',
    },
    null,
  );
}

function toPayload() {
  return {
    name: name.value.trim() || '未命名方案',
    theme: clone(theme),
    sections: sections.value.map((item) => ({
      id: item.id,
      key: item.key,
      visible: item.visible,
      props: clone(item.props),
    })),
  };
}

/** 保存草稿，返回保存后的方案；未落库过的新草稿走创建 */
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

/**
 * 发布。
 *
 * 先存草稿再发布 —— 顾客看到的一直是「画布上刚点保存的那份」，
 * 不会出现改了属性但忘了存、结果发布出旧内容的事。
 */
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
    // 校验失败的具体缺失项已由请求层弹出
  } finally {
    publishing.value = false;
  }
}

/**
 * 回滚：把选中的历史版本再发布一次。
 *
 * 版本号继续往前走（不把 v3 退回 v1）：C 端是拿本地版本号做缓存比对的，
 * 回退编号会让它以为自己已经是最新的那份。
 */
async function rollback(): Promise<void> {
  const target = archivedSelected.value;
  if (!target) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定把「${target.name}」（v${target.version}）重新发布吗？现在生效的那份会转为历史版本。`,
      '回到这一版',
      { type: 'warning', confirmButtonText: '确认回滚', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  publishing.value = true;
  try {
    const published = await publishAppConfig(target.id);
    ElMessage.success(`已回到那一版，现在生效的是 v${published.version}`);
    await loadConfigs(published.id);
  } catch {
    // 失败原因已由请求层弹出
  } finally {
    publishing.value = false;
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

async function deleteDraft(): Promise<void> {
  if (currentId.value === null) {
    return;
  }
  try {
    await ElMessageBox.confirm('确定删除这份草稿吗？', '删除草稿', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  await removeAppConfig(currentId.value);
  ElMessage.success('草稿已删除');
  await loadConfigs();
}

/* ---------------- 画布操作 ---------------- */

const paletteKeys = Object.keys(SECTION_META) as SectionKey[];

/** 组件库里的模板项：拖出去时会被 clone，normalize 时再深拷贝一次 */
const palette = ref<LayoutSection[]>(
  paletteKeys.map((key) => ({
    id: `palette-${key}`,
    key,
    visible: true,
    props: SECTION_DEFAULTS[key](),
  })),
);

const usedKeys = computed(() => new Set(sections.value.map((item) => item.key)));

function addSection(key: SectionKey): void {
  if (usedKeys.value.has(key)) {
    ElMessage.warning(`${SECTION_META[key].label} 已经在画布上，每种组件只能放一个位置`);
    return;
  }
  sections.value.push({ id: randomId(), key, visible: true, props: SECTION_DEFAULTS[key]() });
  selectedId.value = sections.value[sections.value.length - 1].id;
}

function removeSection(id: string): void {
  sections.value = sections.value.filter((item) => item.id !== id);
  if (selectedId.value === id) {
    selectedId.value = sections.value[0]?.id ?? null;
  }
}

function toggleVisible(section: LayoutSection): void {
  section.visible = !section.visible;
}

/**
 * 上下移动一位。
 *
 * 拖拽是主路径，但触屏板与键盘用户需要一条确定性的排序方式，
 * 而且排序结果最终要落库，能精确验证比好看重要。
 */
function moveSection(id: string, delta: number): void {
  const from = sections.value.findIndex((item) => item.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= sections.value.length) {
    return;
  }
  const next = [...sections.value];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  sections.value = next;
}

onMounted(async () => {
  await Promise.all([loadConfigs(), loadStores()]);
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="小程序布局"
      description="配置顾客侧小程序的首页组件与主题皮肤。改完先存草稿，发布后 C 端立即读到；预览是近似复刻，最终以小程序为准"
    >
      <template #actions>
        <el-input
          v-model="name"
          class="toolbar__name"
          placeholder="方案名称，如「2026 国庆」"
          maxlength="24"
          show-word-limit
          :disabled="readonly"
        />
        <el-select
          v-model="currentId"
          class="toolbar__select"
          placeholder="选择方案"
          :clearable="false"
          @change="selectConfig"
        >
          <el-option
            v-for="item in configs"
            :key="item.id"
            :label="`${item.name} · ${item.statusLabel}${item.version ? ` · v${item.version}` : ''}`"
            :value="item.id"
          />
        </el-select>
        <el-select
          v-model="previewStoreId"
          class="toolbar__select"
          placeholder="预览门店（可选）"
          clearable
          filterable
        >
          <el-option v-for="item in stores" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-button :icon="DocumentCopy" @click="newDraft">新建草稿</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="loadConfigs(currentId ?? undefined)">
          刷新
        </el-button>
        <el-button
          v-if="canWrite"
          :loading="saving"
          :disabled="readonly"
          @click="saveDraft"
        >
          存为草稿
        </el-button>
        <el-button
          v-if="canWrite"
          type="primary"
          :icon="Upload"
          :loading="publishing"
          :disabled="readonly"
          @click="publishNow"
        >
          发布
        </el-button>
        <el-button
          v-if="canWrite && archivedSelected"
          type="warning"
          :icon="RefreshLeft"
          :loading="publishing"
          @click="rollback"
        >
          回到这一版
        </el-button>
      </template>
    </PageHeader>

    <p v-if="readonly" class="readonly-tip">
      当前方案不可编辑 —— 生效中的配置与历史版本是只读的，要点「新建草稿」复制一份再改。
    </p>

    <div class="builder">
      <!-- ---------------- 组件库 ---------------- -->
      <aside class="panel palette">
        <h3 class="panel__title">组件库</h3>
        <VueDraggable
          v-model="palette"
          :group="{ name: 'app-layout', pull: 'clone', put: false }"
          :sort="false"
          class="palette__list"
        >
          <div
            v-for="item in palette"
            :key="item.id"
            class="palette__item"
            :class="{ 'is-used': usedKeys.has(item.key) }"
          >
            <span class="palette__name">{{ SECTION_META[item.key as SectionKey].label }}</span>
            <span class="palette__hint">{{ SECTION_META[item.key as SectionKey].hint }}</span>
            <el-button
              :icon="Plus"
              link
              type="primary"
              :disabled="readonly || usedKeys.has(item.key)"
              @click="addSection(item.key)"
            >
              {{ usedKeys.has(item.key) ? '已在画布上' : '添加' }}
            </el-button>
          </div>
        </VueDraggable>
        <p class="palette__foot">拖进中间的手机壳，或直接点「添加」</p>
      </aside>

      <!-- ---------------- 手机壳画布 ---------------- -->
      <main class="panel canvas">
        <div class="phone">
          <div class="phone__status">
            <span class="num">9:41</span>
            <span class="phone__brand">{{ theme.logoUrl ? '' : name }}</span>
          </div>
          <img v-if="theme.headerImage" class="phone__header" :src="theme.headerImage" alt="" />

          <div class="phone__body" :style="{ background: theme.backgroundColor }">
            <VueDraggable
              v-model="sections"
              :group="{ name: 'app-layout' }"
              :disabled="readonly"
              class="phone__sections"
              @end="normalizeSections"
              @add="normalizeSections"
            >
              <div
                v-for="section in sections"
                :key="section.id"
                class="slot"
                :class="{ 'is-selected': section.id === selectedId, 'is-hidden': !section.visible }"
                @click="selectedId = section.id"
              >
                <div class="slot__bar">
                  <span class="slot__name">{{ SECTION_META[section.key as SectionKey].label }}</span>
                  <span v-if="!section.visible" class="slot__flag">已隐藏</span>
                  <div class="slot__actions">
                    <el-button
                      :icon="ArrowUp"
                      link
                      size="small"
                      :disabled="readonly || sections.indexOf(section) === 0"
                      title="上移一位"
                      @click.stop="moveSection(section.id, -1)"
                    />
                    <el-button
                      :icon="ArrowDown"
                      link
                      size="small"
                      :disabled="readonly || sections.indexOf(section) === sections.length - 1"
                      title="下移一位"
                      @click.stop="moveSection(section.id, 1)"
                    />
                    <el-button
                      :icon="section.visible ? View : Hide"
                      link
                      size="small"
                      :disabled="readonly"
                      @click.stop="toggleVisible(section)"
                    />
                    <el-button
                      :icon="Delete"
                      link
                      size="small"
                      type="danger"
                      :disabled="readonly"
                      @click.stop="removeSection(section.id)"
                    />
                  </div>
                </div>
                <SectionPreview :section="section" :theme="theme" :preview="preview" />
              </div>
            </VueDraggable>

            <p v-if="sections.length === 0" class="phone__empty">
              还没有组件，从左侧拖一个进来
            </p>
          </div>
        </div>
      </main>

      <!-- ---------------- 属性面板 ---------------- -->
      <aside class="panel props">
        <PropsPanel :theme="theme" :readonly="readonly" />
        <template v-if="selectedSection">
          <el-divider />
          <SectionForm :section="selectedSection" :preview="preview" :readonly="readonly" />
        </template>
        <p v-else class="props__empty">点击画布中的组件可编辑它的属性</p>
        <div v-if="currentId !== null && !readonly" class="props__foot">
          <el-button link type="danger" @click="deleteDraft">删除这份草稿</el-button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
.toolbar__select {
  width: 200px;
}

.toolbar__name {
  width: 230px;
}

.readonly-tip {
  margin: 0 0 var(--space-4);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background-color: var(--neutral-50);
  font-size: 12.5px;
  color: var(--text-secondary);
}

.builder {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 320px;
  gap: var(--space-4);
  align-items: start;
}

.panel {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background-color: var(--surface);

  &__title {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--neutral-100);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.palette {
  &__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--space-3);
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-md);
    background-color: var(--surface);
    cursor: grab;

    &:active {
      cursor: grabbing;
    }

    &.is-used {
      opacity: 0.55;
    }
  }

  &__name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  &__hint {
    font-size: 11.5px;
    color: var(--text-placeholder);
  }

  &__foot {
    margin: 0;
    padding: 0 var(--space-4) var(--space-4);
    font-size: 11.5px;
    color: var(--text-placeholder);
  }
}

.canvas {
  display: flex;
  justify-content: center;
  padding: var(--space-5);
}

.phone {
  width: 375px;
  border: 1px solid var(--border-color);
  border-radius: 28px;
  overflow: hidden;
  background-color: var(--surface);
  box-shadow: var(--shadow-sm);

  &__status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  &__brand {
    font-weight: 600;
  }

  &__header {
    display: block;
    width: 100%;
    height: 88px;
    object-fit: cover;
  }

  &__body {
    min-height: 420px;
    padding: 8px 0 16px;
  }

  &__sections {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 400px;
  }

  &__empty {
    padding: 40px 16px;
    text-align: center;
    font-size: 12.5px;
    color: var(--text-placeholder);
  }
}

.slot {
  position: relative;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out-quart);

  &:hover {
    border-color: var(--brand-300);
  }

  &.is-selected {
    border-color: var(--brand-500);
    box-shadow: 0 0 0 2px var(--brand-50);
  }

  &.is-hidden {
    opacity: 0.45;
  }

  &__bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    background-color: rgba(24, 22, 21, 0.05);
    font-size: 11px;
  }

  &__name {
    font-weight: 500;
    color: var(--text-secondary);
  }

  &__flag {
    padding: 0 6px;
    border-radius: var(--radius-full);
    background-color: var(--warning-100);
    color: var(--warning-700);
  }

  &__actions {
    margin-left: auto;
    display: flex;
    align-items: center;
  }
}

.props {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 200px);

  &__foot {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--neutral-100);
  }

  &__empty {
    padding: 0 var(--space-4) var(--space-4);
    font-size: 12px;
    color: var(--text-placeholder);
  }
}
</style>
