<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { fetchReviews, replyReview } from '@/api/review';
import { fetchStoreOptions } from '@shared/api/store';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { Permission } from '@shared/types/enums';
import { formatDateTime, orEmpty } from '@shared/utils/format';
import type { Store } from '@shared/types/store';
import type { ReviewQuery, ReviewRow } from '@/types/review';
import { useUserStore } from '@/store/modules/user';

/**
 * 顾客评价管理。
 *
 * 星级筛选传 `rating`，未回复传 `unrepliedOnly=1`（服务端判的是 `=== 1`，
 * 所以关掉开关要下发 undefined 而不是 0，避免后端以后收紧口径时踩坑）。
 * 门店管理员的数据范围被服务端限定为本店，界面不再提供门店筛选与列。
 */
const userStore = useUserStore();
const canReply = computed(() => userStore.hasPermission(Permission.REVIEW_UPDATE));
/** 门店管理员只能看本店评价，门店筛选是噪音 */
const showStoreFilter = computed(() => !userStore.isStoreManager);

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((value) => ({ label: `${value} 星`, value }));

/* ---------------- 门店下拉 ---------------- */

const storeOptions = ref<Store[]>([]);

function storeName(id: number): string {
  return storeOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

async function loadStoreOptions(): Promise<void> {
  if (!showStoreFilter.value) {
    return;
  }
  try {
    storeOptions.value = await fetchStoreOptions();
  } catch {
    storeOptions.value = [];
  }
}

/* ---------------- 列表 ---------------- */

const defaultQuery: ReviewQuery = {
  page: 1,
  pageSize: 10,
  storeId: undefined,
  rating: undefined,
  unrepliedOnly: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(
  fetchReviews,
  defaultQuery,
);

function rowAt(index: number): ReviewRow {
  return list.value[index];
}

/** 「只看未回复」用本地开关驱动 query.unrepliedOnly，避免把 0 发给后端 */
const unrepliedOnly = ref(false);

watch(unrepliedOnly, (value) => {
  query.unrepliedOnly = value ? 1 : undefined;
  search();
});

const isFiltered = computed(
  () => query.storeId !== undefined || query.rating !== undefined || unrepliedOnly.value,
);

function handlePageChange(page: number): void {
  query.page = page;
  void load();
}

function handlePageSizeChange(size: number): void {
  query.pageSize = size;
  query.page = 1;
  void load();
}

function handleReset(): void {
  unrepliedOnly.value = false;
  reset();
}

/* ---------------- 回复 ---------------- */

const replyVisible = ref(false);
const saving = ref(false);
const replyTarget = ref<ReviewRow | null>(null);
const replyForm = reactive({ content: '' });
const formRef = ref<FormInstance>();

const rules: FormRules<{ content: string }> = {
  content: [
    { required: true, message: '请输入回复内容', trigger: 'blur' },
    { max: 500, message: '回复最长 500 个字符', trigger: 'blur' },
  ],
};

/** 低分评价单独标出来：这些才是需要当场安抚的 */
function isNegative(row: ReviewRow): boolean {
  return row.rating <= 2;
}

function openReply(row: ReviewRow): void {
  replyTarget.value = row;
  replyForm.content = row.replyContent ?? '';
  replyVisible.value = true;
}

async function handleReply(): Promise<void> {
  const target = replyTarget.value;
  if (!target) {
    return;
  }
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  saving.value = true;
  try {
    await replyReview(target.id, replyForm.content.trim());
    ElMessage.success(target.replyContent ? '回复已更新' : '已回复顾客');
    replyVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadStoreOptions();
  await load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="顾客评价"
      description="顾客对已完成订单的评价。一单一评，回复会同步展示给顾客；低分（1~2 星）建议当场回一句处理结果"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
        <el-select
          v-if="showStoreFilter"
          v-model="query.storeId"
          class="filters__field"
          placeholder="全部门店"
          clearable
          filterable
        >
          <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>

        <el-select v-model="query.rating" class="filters__field" placeholder="全部星级" clearable>
          <el-option
            v-for="option in RATING_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-checkbox v-model="unrepliedOnly">只看未回复</el-checkbox>

        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="顾客" width="160">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ row.customerName }}</span>
              <span v-if="row.anonymous" class="cell-stack__sub">匿名评价</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="评分" width="150" align="center">
          <template #default="{ $index }">
            <el-rate :model-value="rowAt($index).rating" disabled size="small" />
          </template>
        </el-table-column>

        <el-table-column label="评价内容" min-width="260">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main cell-stack__main--wrap">{{ orEmpty(row.content) }}</span>
              <span v-if="row.tags.length" class="cell-stack__sub">
                {{ row.tags.join(' / ') }}
                <template v-if="row.images.length"> · 附 {{ row.images.length }} 张图</template>
              </span>
              <span class="cell-stack__sub num">订单 {{ row.orderNo }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="showStoreFilter" label="门店" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ storeName(row.storeId) }}</template>
        </el-table-column>

        <el-table-column label="商家回复" min-width="200">
          <template #default="{ row, $index }">
            <div v-if="rowAt($index).replyContent" class="cell-stack">
              <span class="cell-stack__main cell-stack__main--wrap">{{ row.replyContent }}</span>
              <span class="cell-stack__sub num">{{ formatDateTime(row.repliedAt) }}</span>
            </div>
            <el-tag v-else type="warning" effect="plain" size="small" round>待回复</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="赠送积分" width="100" align="right">
          <template #default="{ row }">
            <span class="num muted">{{ row.pointAwarded }}</span>
          </template>
        </el-table-column>

        <el-table-column label="评价时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column v-if="canReply" label="操作" width="100" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button link type="primary" @click="openReply(rowAt($index))">
                {{ rowAt($index).replyContent ? '改回复' : '回复' }}
              </el-button>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty
            :filtered="isFiltered"
            hint="订单完成后顾客才能评价；勾选「只看未回复」可以清掉待处理的那批"
          />
        </template>
      </el-table>

      <TablePagination
        :total="total"
        :page="query.page"
        :page-size="query.pageSize"
        @page-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
    </section>

    <!-- 回复 -->
    <el-dialog v-model="replyVisible" title="回复评价" width="560px" :close-on-click-modal="false">
      <div v-if="replyTarget" class="reply-origin">
        <div class="reply-origin__head">
          <span class="reply-origin__who">{{ replyTarget.customerName }}</span>
          <el-rate :model-value="replyTarget.rating" disabled size="small" />
          <el-tag v-if="isNegative(replyTarget)" type="danger" effect="plain" size="small">
            低分待安抚
          </el-tag>
        </div>
        <p class="reply-origin__text">{{ orEmpty(replyTarget.content) }}</p>
        <p class="reply-origin__meta num">
          订单 {{ replyTarget.orderNo }} · {{ formatDateTime(replyTarget.createdAt) }}
        </p>
      </div>

      <el-form ref="formRef" :model="replyForm" :rules="rules" label-position="top">
        <el-form-item label="回复内容" prop="content">
          <el-input
            v-model="replyForm.content"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="顾客能看到这条回复。先说清楚怎么处理，再留一个联系入口"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="replyVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleReply">提交回复</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.cell-stack__main--wrap {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  line-height: 1.6;
  font-weight: 400;
}

.reply-origin {
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--neutral-25);

  &__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__who {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__text {
    margin: var(--space-2) 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-regular);
  }

  &__meta {
    margin: var(--space-2) 0 0;
    font-size: 12px;
    color: var(--text-placeholder);
  }
}
</style>
