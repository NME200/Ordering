<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Picture, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  acceptOrder,
  cancelOrder,
  completeOrder,
  fetchOrder,
  fetchOrders,
  fetchOrderStatusCount,
  markOrderOfflinePaid,
  readyOrder,
} from '@shared/api/order';
import { fetchStoreOptions } from '@shared/api/store';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { useUserStore } from '@/store/modules/user';
import {
  DiningType,
  DINING_TYPE_LABELS,
  DINING_TYPE_OPTIONS,
  OrderSource,
  OrderStatus,
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_OPTIONS,
  ORDER_STATUS_TAG_TYPES,
  Permission,
} from '@shared/types/enums';
import type { Order, OrderItem, OrderQuery } from '@shared/types/order';
import type { Store } from '@shared/types/store';
import { fenToYuan, formatDateTime, orEmpty } from '@shared/utils/format';

const route = useRoute();
const userStore = useUserStore();

const canOperate = computed(() => userStore.hasPermission(Permission.ORDER_UPDATE));
const canCancel = computed(() => userStore.hasPermission(Permission.ORDER_CANCEL));
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

/* ---------------- 状态计数 ---------------- */

const statusCounts = ref<Record<number, number>>({});

async function loadStatusCounts(): Promise<void> {
  try {
    const list = await fetchOrderStatusCount({ storeId: query.storeId });
    const next: Record<number, number> = {};
    list.forEach((item) => {
      next[item.status] = item.count;
    });
    statusCounts.value = next;
  } catch {
    statusCounts.value = {};
  }
}

/** 计数条：全部 + 各状态；当前选中的高亮 */
const countChips = computed(() => [
  { value: undefined as OrderStatus | undefined, label: '全部', count: undefined as number | undefined },
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

/* ---------------- 列表 ---------------- */

const defaultQuery: OrderQuery = {
  page: 1,
  pageSize: 10,
  storeId: undefined,
  status: undefined,
  diningType: undefined,
  keyword: '',
  startTime: undefined,
  endTime: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(fetchOrders, defaultQuery);

/** el-table 插槽的 row 为宽松类型（EP 的 DefaultRow），按索引取回强类型行 */
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

/** 切换门店后刷新状态计数（计数随门店范围变化） */
watch(
  () => query.storeId,
  () => {
    void loadStatusCounts();
    search();
  },
);

const isFiltered = computed(
  () =>
    Boolean(query.keyword) ||
    query.status !== undefined ||
    query.diningType !== undefined ||
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

/** 商品摘要：首项 + 「等 N 件」 */
function itemSummary(order: Order): string {
  const first = order.items[0];
  if (!first) {
    return '—';
  }
  const head = first.specSummary ? `${first.dishName}（${first.specSummary}）` : first.dishName;
  return order.items.length > 1 ? `${head} 等 ${order.items.length} 项` : head;
}

/* ---------------- 状态流转 ---------------- */

/** 当前状态下的可用操作（与后端状态机一致） */
function availableActions(order: Order): { key: string; label: string; type: 'primary' | 'danger' }[] {
  const actions: { key: string; label: string; type: 'primary' | 'danger' }[] = [];
  if (order.status === OrderStatus.PENDING_PAYMENT) {
    if (canOperate.value) actions.push({ key: 'offline-pay', label: '线下收款', type: 'primary' });
  }
  if (order.status === OrderStatus.PAID && canOperate.value) {
    actions.push({ key: 'accept', label: '接单', type: 'primary' });
  }
  if (order.status === OrderStatus.PREPARING && canOperate.value) {
    actions.push({ key: 'ready', label: '出餐', type: 'primary' });
  }
  if (order.status === OrderStatus.READY && canOperate.value) {
    actions.push({ key: 'complete', label: '完成', type: 'primary' });
  }
  if (
    canCancel.value &&
    (order.status === OrderStatus.PENDING_PAYMENT ||
      order.status === OrderStatus.PAID ||
      order.status === OrderStatus.PREPARING)
  ) {
    actions.push({ key: 'cancel', label: '取消', type: 'danger' });
  }
  return actions;
}

const acting = ref(false);

async function runAction(order: Order, action: string): Promise<void> {
  if (action === 'cancel') {
    let reason = '';
    try {
      const result = await ElMessageBox.prompt(
        `确定取消订单 ${order.orderNo} 吗？可填写取消原因，便于后续对账。`,
        '取消订单',
        {
          confirmButtonText: '确认取消',
          cancelButtonText: '再想想',
          inputPlaceholder: '取消原因（选填，最多 128 字）',
          inputValidator: (value: string) => (value.length > 128 ? '原因最长 128 个字符' : true),
        },
      );
      reason = result.value ?? '';
    } catch {
      return;
    }

    acting.value = true;
    try {
      await cancelOrder(order.id, { reason: reason.trim() || undefined });
      ElMessage.success('订单已取消');
      await afterMutation();
    } finally {
      acting.value = false;
    }
    return;
  }

  if (action === 'offline-pay') {
    try {
      await ElMessageBox.confirm(
        `确认已收到订单 ${order.orderNo} 的款项（现金 / 收款码）？确认后订单将直接置为已支付。`,
        '标记线下收款',
        { type: 'warning', confirmButtonText: '确认已收款', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
  }

  const handlers: Record<string, (id: number) => Promise<Order>> = {
    accept: acceptOrder,
    ready: readyOrder,
    complete: completeOrder,
    'offline-pay': markOrderOfflinePaid,
  };
  const handler = handlers[action];
  if (!handler) {
    return;
  }

  const successText: Record<string, string> = {
    accept: '已接单，订单进入制作中',
    ready: '已出餐，等待顾客取餐',
    complete: '订单已完成',
    'offline-pay': '已标记线下收款',
  };

  acting.value = true;
  try {
    await handler(order.id);
    ElMessage.success(successText[action] ?? '操作成功');
    await afterMutation();
  } finally {
    acting.value = false;
  }
}

/** 操作成功后刷新列表、计数与已打开的详情 */
async function afterMutation(): Promise<void> {
  await Promise.all([load(), loadStatusCounts()]);
  if (detailVisible.value && detailOrder.value) {
    detailOrder.value = await fetchOrder(detailOrder.value.id).catch(() => detailOrder.value);
  }
}

/* ---------------- 详情抽屉 ---------------- */

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

/** 详情里的时间轴节点 */
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

function itemSubtotal(item: OrderItem): string {
  return fenToYuan(item.subtotal);
}

onMounted(async () => {
  // 工作台的待办卡片通过 ?status= 跳进来
  const statusFromQuery = Number(route.query.status);
  if (Object.values(OrderStatus).includes(statusFromQuery as OrderStatus)) {
    query.status = statusFromQuery as OrderStatus;
  }
  await Promise.all([loadStoreOptions(), loadStatusCounts()]);
  await load();
});
</script>

<template>
  <div class="page">
    <PageHeader title="订单管理" description="接单、出餐、完成与退款处理；金额与明细均为下单时的快照">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="afterMutation">刷新</el-button>
      </template>
    </PageHeader>

    <!-- 状态计数 -->
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

        <el-select
          v-model="query.diningType"
          class="filters__field"
          placeholder="全部就餐方式"
          clearable
          @change="search"
        >
          <el-option
            v-for="option in DINING_TYPE_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索订单号 / 手机号 / 取餐码"
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

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="订单号" min-width="200">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main num">{{ row.orderNo }}</span>
              <span class="cell-stack__sub">
                {{ row.sourceLabel || ORDER_SOURCE_LABELS[row.source as OrderSource] }}
                <template v-if="row.tableNo"> · 桌号 {{ row.tableNo }}</template>
                <template v-if="row.pickupCode">
                  · 取餐码 <span class="pickup-code num">{{ row.pickupCode }}</span>
                </template>
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="showStoreFilter" label="门店" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ storeName(row.storeId) }}</template>
        </el-table-column>

        <el-table-column label="就餐" width="96" align="center">
          <template #default="{ row }">
            {{ row.diningTypeLabel || DINING_TYPE_LABELS[row.diningType as DiningType] }}
          </template>
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
            <el-tag :type="ORDER_STATUS_TAG_TYPES[row.status as OrderStatus]" effect="light" size="small" round>
              {{ row.statusLabel || ORDER_STATUS_LABELS[row.status as OrderStatus] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="下单时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(rowAt($index))">详情</el-button>
              <el-button
                v-for="action in availableActions(rowAt($index))"
                :key="action.key"
                link
                :type="action.type"
                :disabled="acting"
                @click="runAction(rowAt($index), action.key)"
              >
                {{ action.label }}
              </el-button>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty :filtered="isFiltered" hint="换个状态或时间范围试试；新订单会自动出现在这里" />
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

    <!-- 订单详情 -->
    <el-drawer v-model="detailVisible" title="订单详情" size="560px" :destroy-on-close="false">
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

          <div class="detail__actions">
            <el-button
              v-for="action in availableActions(detailOrder)"
              :key="action.key"
              :type="action.type"
              :disabled="acting"
              size="small"
              @click="runAction(detailOrder, action.key)"
            >
              {{ action.label }}
            </el-button>
            <span v-if="availableActions(detailOrder).length === 0" class="muted">
              该订单已进入终态，无可执行操作
            </span>
          </div>

          <el-descriptions :column="2" border size="small" class="detail__desc">
            <el-descriptions-item label="门店">{{ storeName(detailOrder.storeId) }}</el-descriptions-item>
            <el-descriptions-item label="就餐方式">
              {{ detailOrder.diningTypeLabel || DINING_TYPE_LABELS[detailOrder.diningType] }}
            </el-descriptions-item>
            <el-descriptions-item label="桌号">{{ orEmpty(detailOrder.tableNo) }}</el-descriptions-item>
            <el-descriptions-item label="取餐码">
              <span class="pickup-code num">{{ orEmpty(detailOrder.pickupCode) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="下单人">{{ orEmpty(detailOrder.customerName) }}</el-descriptions-item>
            <el-descriptions-item label="手机号">
              <span class="num">{{ orEmpty(detailOrder.customerPhone) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="下单来源">{{ detailOrder.sourceLabel }}</el-descriptions-item>
            <el-descriptions-item label="操作人">
              {{ orEmpty(detailOrder.createdByName) }}
            </el-descriptions-item>
            <!-- 只在外卖单出现：堂食有桌号、自提有取餐码，摆一行空地址只会让人以为配送信息丢了 -->
            <el-descriptions-item
              v-if="detailOrder.diningType === DiningType.DELIVERY"
              label="收货信息"
              :span="2"
            >
              {{ orEmpty(detailOrder.addressSnapshot) }}
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
                {{ detailOrder.paidAmount === null ? '未收款' : `¥ ${fenToYuan(detailOrder.paidAmount)}` }}
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
                <span v-if="item.specSummary" class="detail-item__spec">{{ item.specSummary }}</span>
                <span class="detail-item__price num">
                  ¥ {{ fenToYuan(item.unitPrice) }}
                  <template v-if="item.specAmount !== 0">
                    （含规格 {{ item.specAmount > 0 ? '+' : '' }}{{ fenToYuan(item.specAmount) }}）
                  </template>
                </span>
              </div>

              <div class="detail-item__amount">
                <span class="num">× {{ item.quantity }}</span>
                <span class="num detail-item__subtotal">¥ {{ itemSubtotal(item) }}</span>
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
/* ---------------- 状态计数条 ---------------- */
.status-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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

.cell-stack--right {
  align-items: flex-end;
}

/* 取餐码是店员这一侧真正要对着喊的字段，比旁边的说明文字重一档 */
.pickup-code {
  font-weight: 600;
  color: var(--brand-700);
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

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
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
