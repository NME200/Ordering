<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchPayment, fetchPayments, refundPayment } from '@shared/api/payment';
import { fetchStoreOptions } from '@shared/api/store';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { useUserStore } from '@/store/modules/user';
import {
  PaymentChannel,
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_CHANNEL_OPTIONS,
  PaymentStatus,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_OPTIONS,
  PAYMENT_STATUS_TAG_TYPES,
  Permission,
  RefundStatus,
  REFUND_STATUS_LABELS,
} from '@shared/types/enums';
import type { Payment, PaymentQuery } from '@shared/types/payment';
import type { Store } from '@shared/types/store';
import { fenToYuan, formatDateTime, orEmpty } from '@shared/utils/format';

const userStore = useUserStore();

const canRefund = computed(() => userStore.hasPermission(Permission.PAYMENT_REFUND));
/** 门店管理员的数据范围被服务端限定为本店，无需再展示门店筛选 */
const showStoreFilter = computed(() => !userStore.isStoreManager);

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

const defaultQuery: PaymentQuery = {
  page: 1,
  pageSize: 10,
  storeId: undefined,
  channel: undefined,
  status: undefined,
  keyword: '',
  startTime: undefined,
  endTime: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(
  fetchPayments,
  defaultQuery,
);

/** el-table 插槽的 row 为宽松类型（EP 的 DefaultRow），按索引取回强类型行 */
function rowAt(index: number): Payment {
  return list.value[index];
}

const timeRange = ref<[string, string] | null>(null);

watch(timeRange, (range) => {
  query.startTime = range ? new Date(range[0].replace(' ', 'T')).toISOString() : undefined;
  query.endTime = range ? new Date(range[1].replace(' ', 'T')).toISOString() : undefined;
  search();
});

watch(
  () => query.storeId,
  () => {
    search();
  },
);

const isFiltered = computed(
  () =>
    Boolean(query.keyword) ||
    query.channel !== undefined ||
    query.status !== undefined ||
    query.storeId !== undefined ||
    timeRange.value !== null,
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
  timeRange.value = null;
  reset();
}

/* ---------------- 详情 ---------------- */

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<Payment | null>(null);

async function openDetail(row: Payment): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = row;
  try {
    detail.value = await fetchPayment(row.id);
  } catch {
    // 失败时退回列表行数据
  } finally {
    detailLoading.value = false;
  }
}

/* ---------------- 退款 ---------------- */

/** 可退款：支付成功、且当前没有成功或处理中的退款 */
function canRefundThis(row: Payment): boolean {
  return (
    canRefund.value &&
    row.status === PaymentStatus.SUCCESS &&
    row.refundStatus !== RefundStatus.SUCCESS &&
    row.refundStatus !== RefundStatus.PENDING
  );
}

const refunding = ref(false);

async function handleRefund(row: Payment): Promise<void> {
  let reason = '';
  try {
    const result = await ElMessageBox.prompt(
      `将对支付单 ${row.paymentNo} 发起整单全额退款，金额 ¥ ${fenToYuan(row.amount)}。该操作不可撤销。`,
      '发起退款',
      {
        type: 'warning',
        confirmButtonText: '确认退款',
        cancelButtonText: '取消',
        inputPlaceholder: '退款原因（选填，最多 128 字）',
        inputValidator: (value: string) => (value.length > 128 ? '原因最长 128 个字符' : true),
      },
    );
    reason = result.value ?? '';
  } catch {
    return;
  }

  refunding.value = true;
  try {
    await refundPayment(row.id, { reason: reason.trim() || undefined });
    ElMessage.success('退款已发起');
    await load();
    if (detailVisible.value && detail.value?.id === row.id) {
      detail.value = await fetchPayment(row.id).catch(() => detail.value);
    }
  } finally {
    refunding.value = false;
  }
}

/** 退款状态的标签配色 */
function refundTagType(row: Payment): 'success' | 'warning' | 'danger' | 'info' {
  switch (row.refundStatus) {
    case RefundStatus.SUCCESS:
      return 'success';
    case RefundStatus.PENDING:
      return 'warning';
    case RefundStatus.FAILED:
      return 'danger';
    default:
      return 'info';
  }
}

onMounted(async () => {
  await loadStoreOptions();
  await load();
});
</script>

<template>
  <div class="page">
    <PageHeader title="支付流水" description="每笔在线支付 / 线下收款的记录，可按订单追溯并处理退款">
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

        <el-select v-model="query.channel" class="filters__field" placeholder="全部渠道" clearable>
          <el-option
            v-for="option in PAYMENT_CHANNEL_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-select v-model="query.status" class="filters__field" placeholder="全部状态" clearable>
          <el-option
            v-for="option in PAYMENT_STATUS_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索支付单号 / 订单号"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />

        <el-date-picker
          v-model="timeRange"
          class="filters__field filters__field--wide"
          type="datetimerange"
          value-format="YYYY-MM-DD HH:mm:ss"
          range-separator="至"
          start-placeholder="创建起"
          end-placeholder="创建止"
          clearable
        />

        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="支付单号" min-width="200">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main num">{{ row.paymentNo }}</span>
              <span class="cell-stack__sub num">订单 {{ row.orderNo }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="showStoreFilter" label="门店" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ storeName(row.storeId) }}</template>
        </el-table-column>

        <el-table-column label="渠道" width="120" align="center">
          <template #default="{ row }">
            {{ row.channelLabel || PAYMENT_CHANNEL_LABELS[row.channel as PaymentChannel] }}
          </template>
        </el-table-column>

        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">
            <div class="cell-stack cell-stack--right">
              <span class="cell-stack__main num">¥ {{ fenToYuan(row.amount) }}</span>
              <span v-if="row.refundAmount !== null" class="cell-stack__sub num">
                已退 ¥ {{ fenToYuan(row.refundAmount) }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              :type="PAYMENT_STATUS_TAG_TYPES[row.status as PaymentStatus]"
              effect="light"
              size="small"
              round
            >
              {{ row.statusLabel || PAYMENT_STATUS_LABELS[row.status as PaymentStatus] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="退款" width="100" align="center">
          <template #default="{ row, $index }">
            <el-tag :type="refundTagType(rowAt($index))" effect="plain" size="small" round>
              {{ row.refundStatusLabel || REFUND_STATUS_LABELS[row.refundStatus as RefundStatus] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(rowAt($index))">详情</el-button>
              <el-button
                v-if="canRefundThis(rowAt($index))"
                link
                type="danger"
                :disabled="refunding"
                @click="handleRefund(rowAt($index))"
              >
                退款
              </el-button>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty :filtered="isFiltered" hint="支付成功或线下收款后，流水会出现在这里" />
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

    <!-- 支付单详情 -->
    <el-dialog v-model="detailVisible" title="支付单详情" width="600px">
      <div v-loading="detailLoading" class="detail">
        <template v-if="detail">
          <div class="detail__head">
            <div class="cell-stack">
              <span class="detail__no num">{{ detail.paymentNo }}</span>
              <span class="muted num">订单 {{ detail.orderNo }}</span>
            </div>
            <el-tag :type="PAYMENT_STATUS_TAG_TYPES[detail.status]" effect="light" size="large" round>
              {{ detail.statusLabel }}
            </el-tag>
          </div>

          <div v-if="canRefundThis(detail)" class="detail__actions">
            <el-button type="danger" size="small" :disabled="refunding" @click="handleRefund(detail)">
              发起退款（整单全额 ¥ {{ fenToYuan(detail.amount) }}）
            </el-button>
          </div>

          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="门店">{{ storeName(detail.storeId) }}</el-descriptions-item>
            <el-descriptions-item label="渠道">{{ detail.channelLabel }}</el-descriptions-item>
            <el-descriptions-item label="支付金额">
              <strong class="num">¥ {{ fenToYuan(detail.amount) }}</strong>
            </el-descriptions-item>
            <el-descriptions-item label="渠道流水号">
              <span class="num">{{ orEmpty(detail.transactionId) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              <span class="num">{{ formatDateTime(detail.createdAt) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="支付时间">
              <span class="num">{{ detail.paidAt ? formatDateTime(detail.paidAt) : '—' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="关闭时间">
              <span class="num">{{ detail.closedAt ? formatDateTime(detail.closedAt) : '—' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="失败原因">{{ orEmpty(detail.failReason) }}</el-descriptions-item>
            <el-descriptions-item label="退款状态">
              <el-tag :type="refundTagType(detail)" effect="plain" size="small" round>
                {{ detail.refundStatusLabel }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="退款金额">
              <span class="num">
                {{ detail.refundAmount === null ? '—' : `¥ ${fenToYuan(detail.refundAmount)}` }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="退款单号">
              <span class="num">{{ orEmpty(detail.refundNo) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="退款时间">
              <span class="num">{{ detail.refundedAt ? formatDateTime(detail.refundedAt) : '—' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="退款原因" :span="2">
              {{ orEmpty(detail.refundReason) }}
            </el-descriptions-item>
          </el-descriptions>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.cell-stack--right {
  align-items: flex-end;
}

.detail {
  min-height: 100px;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--neutral-100);
  }

  &__no {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    margin: var(--space-4) 0;
  }

  :deep(.el-descriptions__label) {
    width: 92px;
    color: var(--text-secondary);
  }
}
</style>
