<script setup lang="ts">
import { computed } from 'vue';
import PhoneFrame from './PhoneFrame.vue';
import SectionPreview from './SectionPreview.vue';
import ThemePanel from './ThemePanel.vue';
import type { Decoration } from './use-decoration';
import { APP_CONFIG_PAGES, PAGE_META, PAGE_SECTION_KEYS } from '../../types/app-config';

/**
 * 工作台（11.1）：页面装修表 + 主题设置 + 右侧真机预览。
 *
 * 「状态」这一列说的是**这一页装修了没有**：一份方案含四页，运营经常只改首页就发布，
 * 其余三页其实还在吃内置默认 —— 摆在表里一眼看得见，比翻编辑器诚实。
 */
const props = defineProps<{ deck: Decoration }>();

const emit = defineEmits<{ edit: [page: (typeof APP_CONFIG_PAGES)[number]] }>();

const deck = props.deck;
const { theme, pages, activePage, readonly, configs, currentId, preview } = deck;

const rows = computed(() =>
  APP_CONFIG_PAGES.map((page) => {
    const list = pages[page];
    return {
      page,
      label: PAGE_META[page].label,
      hint: PAGE_META[page].hint,
      total: list.length,
      visible: list.filter((item) => item.visible).length,
      allowed: PAGE_SECTION_KEYS[page].length,
    };
  }),
);

const current = computed(() => configs.value.find((item) => item.id === currentId.value) ?? null);

const statusText = computed(() =>
  current.value ? `${current.value.statusLabel}${current.value.version ? ` · v${current.value.version}` : ''}` : '未保存的草稿',
);

/** 只预览可见组件：隐藏的那几段顾客看不到，画出来只会让人误判 */
const previewSections = computed(() => pages[activePage.value].filter((item) => item.visible));
</script>

<template>
  <div class="workbench">
    <div class="workbench__main">
      <section class="card">
        <header class="card__head">
          <h3 class="card__title">页面装修</h3>
          <span class="card__meta">{{ statusText }} · 最后更新 {{ current?.updatedAt || '—' }}</span>
        </header>
        <el-table :data="rows" class="pages-table">
          <el-table-column label="页面名称" min-width="160">
            <template #default="{ row }">
              <div class="page-cell">
                <b>{{ row.label }}</b>
                <i>{{ row.hint }}</i>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="150">
            <template #default="{ row }">
              <span v-if="row.total" class="tag tag--on">已装修 {{ row.visible }}/{{ row.total }} 段</span>
              <span v-else class="tag">用内置默认</span>
            </template>
          </el-table-column>
          <el-table-column label="可选组件" width="110">
            <template #default="{ row }">{{ row.allowed }} 个</template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button link type="primary" @click="emit('edit', row.page)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section class="card">
        <ThemePanel :theme="theme" :readonly="readonly" @reset="deck.resetTheme" />
      </section>
    </div>

    <aside class="workbench__side">
      <PhoneFrame :theme="theme" :page="activePage">
        <div v-for="section in previewSections" :key="section.id" class="slot">
          <SectionPreview :section="section" :theme="theme" :preview="preview" />
        </div>
        <p v-if="!previewSections.length" class="empty">
          {{ PAGE_META[activePage].label }}还没装修，顾客端会看到内置默认的样子
        </p>
      </PhoneFrame>
      <p class="workbench__tip">预览是后台复刻的近似效果，最终以小程序真机为准</p>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 388px;
  gap: var(--space-4);
  align-items: start;
}

.workbench__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.card {
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background-color: var(--surface);

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }

  &__title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__meta {
    font-size: 12px;
    color: var(--text-placeholder);
  }
}

.page-cell {
  display: flex;
  flex-direction: column;

  i {
    font-style: normal;
    font-size: 11.5px;
    color: var(--text-placeholder);
  }
}

.tag {
  padding: 2px 9px;
  border-radius: var(--radius-full);
  background-color: var(--neutral-100);
  font-size: 12px;
  color: var(--text-secondary);
}

.tag--on {
  background-color: var(--brand-50);
  color: var(--brand-600);
}

.workbench__side {
  --phone-w: 348px;
  --phone-h: 720px;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: radial-gradient(circle at 50% 0%, var(--neutral-100), var(--neutral-200));
}

.workbench__tip {
  margin: 0;
  font-size: 11px;
  color: var(--text-placeholder);
}

.slot {
  margin-bottom: 8px;
  border-radius: var(--radius-md);
  background-color: rgba(255, 255, 255, 0.72);
}

.empty {
  margin: 40px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-placeholder);
}
</style>
