<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Delete, DocumentCopy, EditPen, Refresh, RefreshLeft, Upload } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import PageHeader from '@shared/components/PageHeader.vue';
import Builder from './Builder.vue';
import Workbench from './Workbench.vue';
import { useDecoration } from './use-decoration';
import type { AppConfigPageKey } from '../../types/app-config';
import { APP_CONFIG_PAGES, PAGE_META } from '../../types/app-config';

/**
 * 小程序布局（平台管理端）外壳。
 *
 * 两个视图对应参考稿的两屏：11.1 的「工作台」（页面表 + 主题设置 + 真机预览）
 * 与 11.2 的「装修」（分组组件库 + 手机画布 + 组件/页面/主题三签属性栏）。
 * 顶部那排页面胶囊是 11.3 的排法 —— 一份方案含四页，切页这件事要一直看得见。
 */
const deck = useDecoration();
const view = ref<'workbench' | 'builder'>('workbench');

function editPage(page: AppConfigPageKey): void {
  deck.switchPage(page);
  view.value = 'builder';
}

async function confirmRollback(): Promise<void> {
  const target = deck.archivedSelected.value;
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
  await deck.rollback(target.id);
}

async function confirmDelete(): Promise<void> {
  const target = deck.selectedConfig.value;
  if (!target) {
    return;
  }
  const archived = target.status === 'archived';
  try {
    await ElMessageBox.confirm(
      archived
        ? `确定删除「${target.name}」（v${target.version}）吗？它是历史版本 —— 删掉之后就回滚不到这一版了。`
        : `确定删除草稿「${target.name}」吗？草稿没有发布过，删掉不影响顾客看到的内容。`,
      archived ? '删除历史版本' : '删除草稿',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    );
  } catch {
    return;
  }
  await deck.removeConfig(target.id);
}

/** 改名与内容无关：生效中与历史版本的正文仍然锁着，只有标签能动 */
async function confirmRename(): Promise<void> {
  const target = deck.selectedConfig.value;
  if (!target) {
    return;
  }
  try {
    const { value } = await ElMessageBox.prompt('给这份方案起一个认得出来的名字', '重命名', {
      inputValue: target.name,
      inputValidator: (input: string) => (input.trim() ? true : '名字不能为空'),
      inputErrorMessage: '名字不能为空',
      confirmButtonText: '保存名字',
      cancelButtonText: '取消',
    });
    await deck.renameConfig(target.id, value);
  } catch {
    // 取消
  }
}

onMounted(async () => {
  await Promise.all([deck.loadConfigs(), deck.loadStores()]);
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="小程序布局"
      description="一份方案同时管首页 / 个人中心 / 会员卡 / 优惠券中心四页与全局主题；改完先存草稿，发布后顾客端立即读到"
    >
      <template #actions>
        <el-input
          v-model="deck.name.value"
          class="toolbar__name"
          placeholder="方案名称，如「2026 国庆」"
          maxlength="40"
          show-word-limit
          :disabled="deck.readonly.value"
        />
        <el-select
          v-model="deck.currentId.value"
          class="toolbar__select"
          placeholder="选择方案"
          :clearable="false"
          @change="deck.selectConfig"
        >
          <el-option
            v-for="item in deck.configs.value"
            :key="item.id"
            :label="`${item.name} · ${item.statusLabel}${item.version ? ` · v${item.version}` : ''}`"
            :value="item.id"
          />
        </el-select>
        <el-select
          v-model="deck.previewStoreId.value"
          class="toolbar__select"
          placeholder="预览门店（可选）"
          clearable
          filterable
        >
          <el-option v-for="item in deck.stores.value" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-button
          v-if="deck.canWrite.value && deck.selectedConfig.value"
          :icon="EditPen"
          @click="confirmRename"
        >
          重命名
        </el-button>
        <el-button :icon="DocumentCopy" @click="deck.newDraft">新建草稿</el-button>
        <el-button
          :icon="Refresh"
          :loading="deck.loading.value"
          @click="deck.loadConfigs(deck.currentId.value ?? undefined)"
        >
          刷新
        </el-button>
        <el-button
          v-if="deck.canWrite.value"
          :loading="deck.saving.value"
          :disabled="deck.readonly.value"
          @click="deck.saveDraft"
        >
          存为草稿
        </el-button>
        <el-button
          v-if="deck.canWrite.value"
          type="primary"
          :icon="Upload"
          :loading="deck.publishing.value"
          :disabled="deck.readonly.value"
          @click="deck.publishNow"
        >
          发布
        </el-button>
        <el-button
          v-if="deck.canWrite.value && deck.archivedSelected.value"
          type="warning"
          :icon="RefreshLeft"
          :loading="deck.publishing.value"
          @click="confirmRollback"
        >
          回到这一版
        </el-button>
      </template>
    </PageHeader>

    <div class="bar">
      <div class="bar__pages">
        <button
          v-for="page in APP_CONFIG_PAGES"
          :key="page"
          type="button"
          class="pill"
          :class="{ 'is-on': deck.activePage.value === page }"
          :title="PAGE_META[page].hint"
          @click="deck.switchPage(page)"
        >
          {{ PAGE_META[page].label }}
          <span class="pill__count">{{ deck.pageCount.value[page] }}</span>
        </button>
      </div>

      <div class="bar__modes">
        <button type="button" class="mode" :class="{ 'is-on': view === 'workbench' }" @click="view = 'workbench'">
          工作台
        </button>
        <button type="button" class="mode" :class="{ 'is-on': view === 'builder' }" @click="view = 'builder'">
          装修
        </button>
      </div>
    </div>

    <p v-if="deck.readonly.value" class="tip">
      当前方案不可编辑 —— 生效中的配置与历史版本是只读的，点「新建草稿」复制一份再改。
    </p>

    <Workbench v-if="view === 'workbench'" :deck="deck" @edit="editPage" />
    <Builder v-else :deck="deck" />

    <div v-if="deck.deletable.value" class="foot">
      <el-button link type="danger" :icon="Delete" @click="confirmDelete">
        {{ deck.selectedConfig.value?.status === 'archived' ? '删除这份历史版本' : '删除这份草稿' }}
      </el-button>
      <span v-if="deck.selectedConfig.value?.status === 'archived'" class="foot__note">
        生效中的那一份不给删；历史版本删掉之后就回滚不到它了。
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.toolbar__select {
  width: 190px;
}

.toolbar__name {
  width: 220px;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}

.bar__pages {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 7px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background-color: var(--surface);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;

  &.is-on {
    border-color: var(--brand-500);
    background-color: var(--brand-500);
    color: #fff;
    font-weight: 600;
  }
}

.pill__count {
  padding: 0 6px;
  border-radius: var(--radius-full);
  background-color: rgba(0, 0, 0, 0.06);
  font-size: 11.5px;
}

.pill.is-on .pill__count {
  background-color: rgba(255, 255, 255, 0.25);
}

.bar__modes {
  display: flex;
  padding: 3px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background-color: var(--surface);
}

.mode {
  padding: 5px 16px;
  border: none;
  border-radius: var(--radius-full);
  background: none;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;

  &.is-on {
    background-color: var(--brand-50);
    color: var(--brand-600);
    font-weight: 600;
  }
}

.tip {
  margin: 0 0 var(--space-4);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background-color: var(--neutral-100);
  font-size: 12.5px;
  color: var(--text-secondary);
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.foot__note {
  font-size: 12.5px;
  color: var(--text-secondary);
}
</style>
