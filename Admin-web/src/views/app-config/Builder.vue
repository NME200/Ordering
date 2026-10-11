<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { ArrowDown, ArrowUp, Delete, Hide, Plus, View } from '@element-plus/icons-vue';
import PhoneFrame from './PhoneFrame.vue';
import SectionForm from './SectionForm.vue';
import SectionPreview from './SectionPreview.vue';
import ThemePanel from './ThemePanel.vue';
import LineIcon from './LineIcon.vue';
import type { Decoration } from './use-decoration';
import type { SectionKey } from '../../types/app-config';
import { PAGE_META, SECTION_META } from '../../types/app-config';

/**
 * 三栏装修器（11.2）：分组组件库 → 手机画布 → 「组件 / 页面 / 主题」三签属性栏。
 *
 * 右侧做成三个签而不是全堆在一列，是因为组件属性 + 主题十几项堆起来要滚很久；
 * 运营的心智是「先摆东西、再调这一页、最后调色」，正好对应这三个签。
 */
const props = defineProps<{ deck: Decoration }>();

const deck = props.deck;
const { theme, pages, activePage, readonly, sections, selectedSection, selectedId, palette, usedKeys, preview } = deck;

const tab = ref<'section' | 'page' | 'theme'>('section');

/**
 * 机身宽度三档。
 *
 * 只调宽度不调高度：画布高度由视口给，机身 `is-fill` 撑满它，
 * 这样无论哪一档都不会出现「手机悬在一大片灰中间」。
 */
const ZOOMS = [
  { key: 'sm', label: '紧凑', width: 340 },
  { key: 'md', label: '标准', width: 390 },
  { key: 'lg', label: '大屏', width: 430 },
] as const;

const ZOOM_KEY = 'app-config-phone-width';

const zoom = ref<'sm' | 'md' | 'lg'>((localStorage.getItem(ZOOM_KEY) as 'sm' | 'md' | 'lg') || 'md');

watch(zoom, (value) => localStorage.setItem(ZOOM_KEY, value));

const zoomIndex = computed(() => Math.max(0, ZOOMS.findIndex((item) => item.key === zoom.value)));

const pageList = computed(() => pages[activePage.value]);
const visibleTotal = computed(() => pageList.value.filter((item) => item.visible).length);

/** 组件库分组：与参考稿的「基础 / 商品 / 营销」同一思路，按这一页能放什么归类 */
const GROUPS: Record<string, string> = {
  banner: '基础',
  searchBar: '基础',
  notice: '基础',
  entryGrid: '导航',
  shopList: '导航',
  serviceGrid: '导航',
  orderEntry: '导航',
  couponEntry: '营销',
  userHeader: '账号',
  assetBar: '账号',
  memberCard: '账号',
  benefitGrid: '账号',
  taskList: '账号',
  footerButton: '账号',
  couponTabs: '营销',
  couponList: '营销',
  ruleEntry: '营销',
};

const groupedPalette = computed(() => {
  const map = new Map<string, typeof palette.value>();
  for (const item of palette.value) {
    const group = GROUPS[item.key as SectionKey] ?? '其他';
    map.set(group, [...(map.get(group) ?? []), item]);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
});

function onTabChange(next: typeof tab.value): void {
  tab.value = next;
}
</script>

<template>
  <div class="builder">
    <!-- ---------------- 组件库 ---------------- -->
    <aside class="panel library">
      <h3 class="panel__title">组件库</h3>
      <div class="library__body">
        <section v-for="group in groupedPalette" :key="group.group" class="library__group">
          <h4 class="library__group-title">{{ group.group }}</h4>
          <VueDraggable
            :model-value="group.items"
            :group="{ name: 'app-layout', pull: 'clone', put: false }"
            :sort="false"
            class="library__list"
          >
            <div
              v-for="item in group.items"
              :key="item.id"
              class="library__item"
              :class="{ 'is-used': usedKeys.has(item.key) }"
            >
              <LineIcon :name="SECTION_META[item.key as SectionKey].icon" :size="20" :color="usedKeys.has(item.key) ? '#c3bab2' : '#c8752b'" />
              <span class="library__name">{{ SECTION_META[item.key as SectionKey].label }}</span>
              <button
                type="button"
                class="library__add"
                :disabled="readonly || usedKeys.has(item.key)"
                :title="usedKeys.has(item.key) ? '这一页已经放了一个' : '添加到这一页'"
                @click="deck.addSection(item.key)"
              >
                <el-icon><Plus /></el-icon>
              </button>
            </div>
          </VueDraggable>
        </section>
      </div>
      <p class="library__foot">拖进中间的手机，或点右侧「+」</p>
    </aside>

    <!-- ---------------- 手机画布 ---------------- -->
    <main class="canvas">
      <div class="canvas__bar">
        <span class="canvas__page">{{ PAGE_META[activePage].label }}</span>
        <span class="canvas__meta">
          {{ pageList.length }} 段组件 · {{ visibleTotal }} 段顾客可见
        </span>
        <div class="canvas__zoom">
          <button
            v-for="level in ZOOMS"
            :key="level.key"
            type="button"
            class="canvas__zoom-btn"
            :class="{ 'is-on': zoom === level.key }"
            @click="zoom = level.key"
          >
            {{ level.label }}
          </button>
        </div>
      </div>

      <div class="canvas__stage" :style="{ '--phone-w': ZOOMS[zoomIndex].width + 'px' }">
        <PhoneFrame :theme="theme" :page="activePage" fill>
          <VueDraggable
            v-model="sections"
            :group="{ name: 'app-layout' }"
            :disabled="readonly"
            class="canvas__list"
            @end="deck.normalizeSections"
            @add="deck.normalizeSections"
          >
            <div
              v-for="(section, index) in pageList"
              :key="section.id"
              class="slot"
              :class="{ 'is-selected': section.id === selectedId, 'is-hidden': !section.visible }"
              @click="deck.selectSection(section.id); onTabChange('section')"
            >
              <div class="slot__bar">
                <span class="slot__name">{{ SECTION_META[section.key as SectionKey].label }}</span>
                <span v-if="!section.visible" class="slot__flag">顾客看不到</span>
                <div class="slot__actions">
                  <el-button :icon="ArrowUp" link size="small" :disabled="readonly || index === 0" title="上移" @click.stop="deck.moveSection(section.id, -1)" />
                  <el-button :icon="ArrowDown" link size="small" :disabled="readonly || index === pageList.length - 1" title="下移" @click.stop="deck.moveSection(section.id, 1)" />
                  <el-button :icon="section.visible ? View : Hide" link size="small" :disabled="readonly" title="显示 / 隐藏" @click.stop="deck.toggleVisible(section)" />
                  <el-button :icon="Delete" link size="small" type="danger" :disabled="readonly" title="移除" @click.stop="deck.removeSection(section.id)" />
                </div>
              </div>
              <div class="slot__body">
                <SectionPreview :section="section" :theme="theme" :preview="preview" />
              </div>
            </div>
          </VueDraggable>

          <p v-if="!pageList.length" class="canvas__empty">
            {{ PAGE_META[activePage].label }}还没有组件<br />
            从左侧拖一个进来，或点组件右侧的「+」
          </p>
        </PhoneFrame>
      </div>
    </main>

    <!-- ---------------- 属性栏 ---------------- -->
    <aside class="panel props">
      <div class="props__tabs">
        <button
          v-for="item in [
            { key: 'section', label: '组件' },
            { key: 'page', label: '页面' },
            { key: 'theme', label: '主题' },
          ]"
          :key="item.key"
          type="button"
          class="props__tab"
          :class="{ 'is-on': tab === item.key }"
          @click="tab = item.key as typeof tab"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="props__body">
        <template v-if="tab === 'section'">
          <SectionForm
            v-if="selectedSection"
            :section="selectedSection"
            :preview="preview"
            :readonly="readonly"
            @remove="deck.removeSection(selectedSection.id)"
          />
          <p v-else class="props__empty">点击画布中的组件，在这里改它的属性</p>
        </template>

        <template v-else-if="tab === 'page'">
          <h3 class="props__h">{{ PAGE_META[activePage].label }}的组件</h3>
          <p class="props__sub">顺序就是顾客从上往下看到的顺序</p>
          <div
            v-for="(section, index) in pageList"
            :key="section.id"
            class="row"
            :class="{ 'is-on': section.id === selectedId }"
            @click="deck.selectSection(section.id); tab = 'section'"
          >
            <span class="row__index num">{{ index + 1 }}</span>
            <LineIcon :name="SECTION_META[section.key as SectionKey].icon" :size="16" color="#8b5e3c" />
            <span class="row__name">{{ SECTION_META[section.key as SectionKey].label }}</span>
            <el-tag v-if="!section.visible" size="small" type="info">隐藏</el-tag>
            <div class="row__actions">
              <el-button :icon="ArrowUp" link size="small" :disabled="readonly || index === 0" @click.stop="deck.moveSection(section.id, -1)" />
              <el-button :icon="ArrowDown" link size="small" :disabled="readonly || index === pageList.length - 1" @click.stop="deck.moveSection(section.id, 1)" />
            </div>
          </div>
          <p v-if="!pageList.length" class="props__empty">这一页还是空的</p>
        </template>

        <ThemePanel v-else :theme="theme" :readonly="readonly" @reset="deck.resetTheme" />
      </div>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.builder {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr) 336px;
  gap: var(--space-4);
  align-items: stretch;
  /* 窗口窄的时候整行横向滚，别把中间画布压成一条缝 */
  overflow-x: auto;
  padding-bottom: 4px;
}

.panel {
  display: flex;
  flex-direction: column;
  min-height: 560px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background-color: var(--surface);

  &__title {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--neutral-100);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.library__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3);
}

.library__group + .library__group {
  margin-top: var(--space-4);
}

.library__group-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.library__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.library__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  background-color: var(--surface);
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  &.is-used {
    opacity: 0.5;
  }
}

.library__name {
  flex: 1;
  font-size: 12.5px;
  color: var(--text-primary);
}

.library__add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background-color: var(--surface);
  color: var(--brand-600);
  cursor: pointer;
}

.library__add:disabled {
  cursor: not-allowed;
  color: var(--text-placeholder);
}

.library__foot {
  margin: 0;
  padding: var(--space-2) var(--space-4) var(--space-3);
  border-top: 1px solid var(--neutral-100);
  font-size: 11px;
  color: var(--text-placeholder);
}

.canvas {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 470px;
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: radial-gradient(circle at 50% 0%, var(--neutral-100), var(--neutral-200));
}

.canvas__bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.canvas__page {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.canvas__meta {
  flex: 1;
  font-size: 12px;
  color: var(--text-placeholder);
}

.canvas__zoom {
  display: flex;
  padding: 2px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background-color: var(--surface);
}

.canvas__zoom-btn {
  padding: 3px 12px;
  border: none;
  border-radius: var(--radius-full);
  background: none;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;

  &.is-on {
    background-color: var(--brand-500);
    color: #fff;
  }
}

/* 机身撑满这一段高度：空白留在手机内部滚动，而不是摊在手机四周 */
.canvas__stage {
  flex: 1;
  display: flex;
  justify-content: center;
  min-height: 620px;
  height: calc(100vh - 330px);
  max-height: 900px;
}

.canvas__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 100%;
}

.canvas__empty {
  margin: 140px 12px 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.9;
  color: var(--text-placeholder);
}

.slot {
  position: relative;
  /* 透明边占位：选中前后都是 1px，不会把组件挤得抖一下 */
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background-color: rgba(255, 255, 255, 0.72);
  cursor: pointer;

  &:hover {
    border-color: var(--brand-300);
  }

  /* 选中只在段内部体现：描边 + 把手条染色。
     外发光/角标会顶出手机内容区，压在黑色边框和标题栏上很难看 */
  &.is-selected {
    border-color: var(--brand-500);

    .slot__bar {
      background-color: var(--brand-50);
    }

    .slot__name {
      color: var(--brand-600);
    }
  }

  &.is-hidden {
    opacity: 0.5;
  }

  &__bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    /* 不铺底就会和轮播图糊在一起，看不出这是一段的把手 */
    background-color: rgba(36, 29, 26, 0.06);
    backdrop-filter: blur(4px);
    font-size: 11px;
  }

  &__name {
    font-weight: 600;
    color: var(--text-secondary);
  }

  &__flag {
    padding: 0 6px;
    border-radius: var(--radius-full);
    background-color: var(--warning-100);
    color: var(--warning-500);
  }

  &__actions {
    margin-left: auto;
    display: flex;
    align-items: center;
  }

  &__body {
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    overflow: hidden;
  }
}

.props {
  &__tabs {
    display: flex;
    border-bottom: 1px solid var(--neutral-100);
  }

  &__tab {
    flex: 1;
    padding: 11px 0;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;

    &.is-on {
      border-bottom-color: var(--brand-500);
      color: var(--brand-600);
      font-weight: 600;
    }
  }

  &__body {
    /* 高度跟着面板走，别写死 100vh - 300px：
       窗口矮的时候只剩三四行可见，运营会以为面板没显示全 */
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  &__h {
    margin: 0 0 2px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--brand-600);
  }

  &__sub {
    margin: 0 0 var(--space-3);
    font-size: 11.5px;
    color: var(--text-placeholder);
  }

  &__empty {
    margin: 0;
    padding: var(--space-5) var(--space-4);
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-placeholder);
  }
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  background-color: var(--surface);
  cursor: pointer;

  & + & {
    margin-top: 6px;
  }

  &.is-on {
    border-color: var(--brand-500);
    background-color: var(--brand-50);
  }

  &__index {
    width: 16px;
    font-size: 11px;
    color: var(--text-placeholder);
  }

  &__name {
    flex: 1;
    font-size: 12.5px;
  }

  &__actions {
    display: flex;
    align-items: center;
  }
}
</style>
