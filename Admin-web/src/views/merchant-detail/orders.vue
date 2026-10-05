<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Picture, Refresh, Search } from '@element-plus/icons-vue';
import { fetchOrder, fetchOrders, fetchOrderStatusCount } from '@shared/api/order';
import { fetchStores } from '@shared/api/store';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_OPTIONS,
  ORDER_STATUS_TAG_TYPES,
  OrderSource,
  OrderStatus,
} from '@shared/types/enums';
import type { Order, OrderQuery } from '@shared/types/order';
import type { Store } from '@shared/types/store';
import { fenToYuan, formatDateTime, orEmpty } from '@shared/utils/format';

/**
 * 商户详情内的**订单下钻视图（只读）**。
 *
 * 平台对订单只有 `order:read`，接单 / 出餐 / 取消 / 退款都归商户，
 * 所以这里刻意不放任何流转按钮，只做「按门店排查这家商户的订单」。
 *
 * 与商户后台的订单页分开写而不是复用同一个组件：那一页带收银台操作、
 * 状态计数与本人门店范围，把它塞进共享组件会让两端互相牵制。
 */
const props = defineProps<{
  /** 固定商户范围（租户条件由服务端二次校验，这里只是查询参数） */
  merchantId: number;
  /** 从门店列表点进来的门店；变更时重新过滤 */
  storeId?: number;
}>();

/* ---------------- 门店下拉（含已禁用门店，否则停用后的历史订单查不到） ---------------- */

const storeOptions = ref<Store[]>([]);

function storeName(id: number): string {
  return storeOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

async function loadStoreOptions(): Promise<void> {
  try {
    const page = await fetchStores({ page: 1, pageSize: 100, merchantId: props.merchantId });
    storeOptions.value = page.list;
  } catch {
    storeOptions.value = [];
  }
}

/* ---------------- 列表 ---------------- */

const defaultQuery: OrderQuery = {
  page: 1,
  pageSize: 10,
  merchantId: props.merchantId,
  storeId: props.storeId,
  status: undefined,
  keyword: '',
  startTime: undefined,
  endTime: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(fetchOrders, defaultQuery);

function rowAt(index: number): Order {
  return list.value[index];
}

/** 时间范围单独维护，再同步进查询条件（避免 el-date-picker 直接写两个字段） */
const timeRange = ref<[string, string] | null>(null);

watch(timeRange, (range) => {
  query.startTime = range ? new Date(range[0].replace(' ', 'T')).toISOString() : undefined;
  query.endTime = range ? new Date(range[1].replace(' ', 'T')).toISOString() : undefined;
  search();
});

/** 门店列表页点「订单」切进来时带着该门店；直接进页签时为空表示全部门店 */
watch(
  () => props.storeId,
  (storeId) => {
    query.storeId = storeId;
    void Promise.all([loadStatusCounts(), load()]);
  },
);

watch(
  () => props.merchantId,
  async (merchantId) => {
    query.merchantId = merchantId;
    query.storeId = props.storeId;
    await loadStoreOptions();
    await Promise.all([loadStatusCounts(), load()]);
  },
);

const isFiltered = computed(
  () =>
    query.storeId !== undefined ||
    Boolean(query.keyword) ||
    query.status !== undefined ||
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

/* ---------------- 状态计数 ---------------- */

const statusCounts = ref<Record<number, number>>({});

async function loadStatusCounts(): Promise<void> {
  try {
    const rows = await fetchOrderStatusCount({
      merchantId: props.merchantId,
      storeId: query.storeId,
    });
    const next: Record<number, number> = {};
    rows.forEach((item) => {
      next[item.status] = item.count;
    });
    statusCounts.value = next;
  } catch {
    statusCounts.value = {};
  }
}

/** 计数条：全部 + 各状态；当前选中的高亮 */
const countChips = computed(() => [
  {
    value: undefined as OrderStatus | undefined,
    label: '全部',
    count: undefined as number | undefined,
  },
  ...ORDER_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    count: statusCounts.value[option.value],
  })),
]);

function selectStatus(status: OrderStatus | undefined): void {
  query.status = status;
  search();
}

/** 切换门店后计数随范围变化 */
watch(
  () => query.storeId,
  () => {
    void loadStatusCounts();
    search();
  },
);

/* ---------------- 商品摘要与详情 ---------------- */

function itemSummary(order: Order): string {
  const first = order.items[0];
  if (!first) {
    return '—';
  }
  const head = first.specSummary ? `${first.dishName}（${first.specSummary}）` : first.dishName;
  return order.items.length > 1 ? `${head} 等 ${order.items.length} 项` : head;
}

const detailVisible = ref(false);
const detailLoading = ref(false);
const detailOrder = ref<Order | null>(null);

async function openDetail(order: Order): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  detailOrder.value = order;
  try {
    detailOrder.value = await fetchOrder(order.id);
  } catch {
    // 失败时退回列表行数据，仍可展示基本信息
  } finally {
    detailLoading.value = false;
  }
}

const timelineNodes = computed(() => {
  const order = detailOrder.value;
  if (!order) {
    return [];
  }
  const nodes = [
    { label: '下单', time: order.createdAt },
    { label: '支付', time: order.paidAt },
    { label: '接单', time: order.acceptedAt },
    { label: '出餐', time: order.readyAt },
    { label: '完成', time: order.completedAt },
    { label: '取消', time: order.cancelledAt },
  ];
  return nodes.filter((node) => Boolean(node.time));
});

onMounted(async () => {
  await loadStoreOptions();
  await Promise.all([loadStatusCounts(), load()]);
});
</script>

<template>
  <div class="embedded-orders">
    <div class="filters">
      <el-select
        v-model="query.storeId"
        class="filters__field"
        placeholder="全部门店"
        clearable
        filterable
      >
        <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>

      <el-input
        v-model="query.keyword"
        class="filters__field"
        placeholder="搜索订单号 / 手机号"
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
        start-placeholder="下单起"
        end-placeholder="下单止"
        clearable
      />

      <el-button type="primary" :icon="Search" @click="search">查询</el-button>
      <el-button :icon="Refresh" @click="handleReset">重置</el-button>
    </div>

    <div class="status-chips">
      <button
        v-for="chip in countChips"
        :key="String(chip.value)"
        class="status-chip"
        :class="{ 'is-active': query.status === chip.value }"
        type="button"
        @click="selectStatus(chip.value)"
      >
        <span>{{ chip.label }}</span>
        <span v-if="chip.count !== undefined" class="num status-chip__count">{{ chip.count }}</span>
      </button>
    </div>

    <el-table v-loading="loading" :data="list" row-key="id" stripe>
      <el-table-column label="订单号" min-width="200">
        <template #default="{ row }">
          <div class="cell-stack">
            <span class="cell-stack__main num">{{ row.orderNo }}</span>
            <span class="cell-stack__sub">
              {{ row.sourceLabel || ORDER_SOURCE_LABELS[row.source as OrderSource] }}
              <template v-if="row.tableNo"> · 桌号 {{ row.tableNo }}</template>
            </span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="门店" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ storeName(row.storeId) }}</template>
      </el-table-column>

      <el-table-column label="商品" min-width="240" show-overflow-tooltip>
        <template #default="{ row, $index }">
          <div class="cell-stack">
            <span class="cell-stack__main">{{ itemSummary(rowAt($index)) }}</span>
            <span class="cell-stack__sub">
              共 {{ row.itemCount }} 件
              <template v-if="row.customerName"> · {{ row.customerName }}</template>
            </span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="金额" width="120" align="right">
        <template #default="{ row }">
          <div class="cell-stack cell-stack--right">
            <span class="cell-stack__main num">¥ {{ fenToYuan(row.payableAmount) }}</span>
            <span class="cell-stack__sub">
              {{ row.paidAmount === null ? '未收款' : `已收 ¥ ${fenToYuan(row.paidAmount)}` }}
            </span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag
            :type="ORDER_STATUS_TAG_TYPES[row.status as OrderStatus]"
            effect="light"
            size="small"
            round
          >
            {{ row.statusLabel || ORDER_STATUS_LABELS[row.status as OrderStatus] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="下单时间" width="170">
        <template #default="{ row }">
          <span class="num muted">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ $index }">
          <div class="table-actions">
            <el-button link type="primary" @click="openDetail(rowAt($index))">详情</el-button>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <TableEmpty :filtered="isFiltered" hint="换个门店或时间范围试试" />
      </template>
    </el-table>

    <TablePagination
      :total="total"
      :page="query.page"
      :page-size="query.pageSize"
      @page-change="handlePageChange"
      @size-change="handlePageSizeChange"
    />

    <!-- 订单详情（只读） -->
    <el-drawer v-model="detailVisible" title="订单详情" size="560px">
      <div v-loading="detailLoading" class="detail">
        <template v-if="detailOrder">
          <div class="detail__head">
            <div class="cell-stack">
              <span class="detail__no num">{{ detailOrder.orderNo }}</span>
              <span class="muted">
                {{ detailOrder.sourceLabel }} · {{ formatDateTime(detailOrder.createdAt) }}
              </span>
            </div>
            <el-tag
              :type="ORDER_STATUS_TAG_TYPES[detailOrder.status]"
              effect="light"
              size="large"
              round
            >
              {{ detailOrder.statusLabel }}
            </el-tag>
          </div>

          <p class="detail__note">
            平台只有查看权限，接单 / 出餐 / 取消 / 退款请由商户在商户后台处理。
          </p>

          <el-descriptions :column="2" border size="small" class="detail__desc">
            <el-descriptions-item label="门店">{{ storeName(detailOrder.storeId) }}</el-descriptions-item>
            <el-descriptions-item label="桌号">{{ orEmpty(detailOrder.tableNo) }}</el-descriptions-item>
            <el-descriptions-item label="下单人">{{ orEmpty(detailOrder.customerName) }}</el-descriptions-item>
            <el-descriptions-item label="手机号">
              <span class="num">{{ orEmpty(detailOrder.customerPhone) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="下单来源">{{ detailOrder.sourceLabel }}</el-descriptions-item>
            <el-descriptions-item label="操作人">
              {{ orEmpty(detailOrder.createdByName) }}
            </el-descriptions-item>
            <el-descriptions-item label="商品总额">
              <span class="num">¥ {{ fenToYuan(detailOrder.totalAmount) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="优惠">
              <span class="num">¥ {{ fenToYuan(detailOrder.discountAmount) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="应付">
              <strong class="num">¥ {{ fenToYuan(detailOrder.payableAmount) }}</strong>
            </el-descriptions-item>
            <el-descriptions-item label="实付">
              <span class="num">
                {{
                  detailOrder.paidAmount === null
                    ? '未收款'
                    : `¥ ${fenToYuan(detailOrder.paidAmount)}`
                }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">
              {{ orEmpty(detailOrder.remark) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detailOrder.cancelReason" label="取消原因" :span="2">
              {{ detailOrder.cancelReason }}
            </el-descriptions-item>
          </el-descriptions>

          <h3 class="detail__section">商品明细</h3>
          <div class="detail__items">
            <div v-for="item in detailOrder.items" :key="item.id" class="detail-item">
              <el-image v-if="item.dishImageUrl" class="cell-thumb" :src="item.dishImageUrl" fit="cover">
                <template #error>
                  <div class="cell-thumb cell-thumb--placeholder">
                    <el-icon><Picture /></el-icon>
                  </div>
                </template>
              </el-image>
              <span v-else class="cell-thumb cell-thumb--placeholder">
                <el-icon><Picture /></el-icon>
              </span>

              <div class="detail-item__body">
                <span class="detail-item__name">{{ item.dishName }}</span>
                <span v-if="item.specSummary" class="detail-item__spec">
                  {{ item.specSummary }}
                </span>
                <span class="detail-item__price num">
                  ¥ {{ fenToYuan(item.unitPrice) }}
                  <template v-if="item.specAmount !== 0">
                    （含规格 {{ item.specAmount > 0 ? '+' : '' }}{{ fenToYuan(item.specAmount) }}）
                  </template>
                </span>
              </div>

              <div class="detail-item__amount">
                <span class="num">× {{ item.quantity }}</span>
                <span class="num detail-item__subtotal">¥ {{ fenToYuan(item.subtotal) }}</span>
              </div>
            </div>
          </div>

          <h3 class="detail__section">流转记录</h3>
          <el-timeline class="detail__timeline">
            <el-timeline-item
              v-for="node in timelineNodes"
              :key="node.label"
              :timestamp="formatDateTime(node.time)"
              placement="top"
            >
              {{ node.label }}
            </el-timeline-item>
          </el-timeline>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.embedded-orders {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ---------------- 状态计数条 ---------------- */
.status-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: var(--space-4) var(--space-5) 0;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background-color: var(--surface);
  font-size: 13px;
  color: var(--text-regular);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) var(--ease-out-quart);

  &:hover {
    border-color: var(--brand-300);
    color: var(--brand-700);
  }

  &.is-active {
    border-color: var(--brand-500);
    background-color: var(--brand-50);
    color: var(--brand-700);
    font-weight: 500;
  }

  &__count {
    padding: 0 6px;
    border-radius: var(--radius-full);
    background-color: var(--neutral-100);
    font-size: 12px;
    color: var(--text-secondary);
  }

  &.is-active &__count {
    background-color: var(--brand-100);
    color: var(--brand-700);
  }
}

.filters {
  border-bottom: 1px solid var(--neutral-100);
}

.cell-stack--right {
  align-items: flex-end;
}

/* ---------------- 详情抽屉 ---------------- */
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 120px;

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

  &__note {
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    background-color: var(--neutral-50);
    font-size: 12.5px;
    color: var(--text-secondary);
  }

  &__desc {
    :deep(.el-descriptions__label) {
      width: 88px;
      color: var(--text-secondary);
    }
  }

  &__section {
    margin-top: var(--space-2);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__items {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  &__timeline {
    padding-left: 2px;
  }
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--neutral-100);

  &:last-child {
    border-bottom: none;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  &__name {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-primary);
  }

  &__spec {
    font-size: 12px;
    color: var(--text-secondary);
  }

  &__price {
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__amount {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }

  &__subtotal {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-primary);
  }
}
</style>
