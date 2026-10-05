<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Clock, Refresh, Search } from '@element-plus/icons-vue';
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
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { useUserStore } from '@/store/modules/user';
import {
  OrderStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_OPTIONS,
  ORDER_STATUS_TAG_TYPES,
  Permission,
} from '@shared/types/enums';
import type { Order, OrderItem, OrderQuery } from '@shared/types/order';
import { fenToYuan, formatDateTime, orEmpty } from '@shared/utils/format';

const route = useRoute();
const userStore = useUserStore();

const canOperate = computed(() => userStore.hasPermission(Permission.ORDER_UPDATE));
/** 取消 / 退款属于资金动作，收银员没有该权限，门店管理员才有 */
const canCancel = computed(() => userStore.hasPermission(Permission.ORDER_CANCEL));

/** 自动刷新间隔：扫码单不会自己跳到屏幕上 */
const POLL_MS = 30_000;

/* ---------------- 状态计数与筛选 ---------------- */

const statusCounts = ref<Record<number, number>>({});

async function loadStatusCounts(): Promise<void> {
  try {
    const list = await fetchOrderStatusCount();
    const next: Record<number, number> = {};
    list.forEach((item) => {
      next[item.status] = item.count;
    });
    statusCounts.value = next;
  } catch {
    statusCounts.value = {};
  }
}

const pendingTotal = computed(() =>
  [OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.READY].reduce(
    (sum, status) => sum + (statusCounts.value[status] ?? 0),
    0,
  ),
);

const chips = computed(() => [
  {
    value: undefined as OrderStatus | undefined,
    label: '全部',
    count: undefined as number | undefined,
  },
  ...ORDER_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    count: statusCounts.value[option.value] ?? 0,
  })),
]);

/** 只看待处理：一次性把四个进行中状态之外的终态排除掉，靠状态筛选实现 */
const todayOnly = ref(false);

function startOfToday(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/* ---------------- 列表 ---------------- */

const defaultQuery: OrderQuery = {
  page: 1,
  pageSize: 12,
  status: undefined,
  keyword: '',
  startTime: undefined,
  endTime: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(
  fetchOrders,
  defaultQuery,
);

function rowAt(index: number): Order {
  return list.value[index];
}

function selectStatus(status: OrderStatus | undefined): void {
  query.status = status;
  search();
}

watch(todayOnly, (value) => {
  query.startTime = value ? startOfToday() : undefined;
  search();
});

const isFiltered = computed(
  () => Boolean(query.keyword) || query.status !== undefined || todayOnly.value,
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
  todayOnly.value = false;
  reset();
}

/** 商品摘要：首项 + 「等 N 项」，收银台上靠这个认单 */
function itemSummary(order: Order): string {
  const first = order.items[0];
  if (!first) {
    return '—';
  }
  const head = first.specSummary ? `${first.dishName}（${first.specSummary}）` : first.dishName;
  return order.items.length > 1 ? `${head} 等 ${order.items.length} 项` : head;
}

function timeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ---------------- 状态流转 ---------------- */

interface OrderAction {
  key: 'offline-pay' | 'accept' | 'ready' | 'complete' | 'cancel';
  label: string;
  primary: boolean;
}

/** 与后端状态机一致的可执行操作（由状态 + 权限推导，不在模板里写条件） */
function availableActions(order: Order): OrderAction[] {
  const actions: OrderAction[] = [];
  if (order.status === OrderStatus.PENDING_PAYMENT && canOperate.value) {
    actions.push({ key: 'offline-pay', label: '收款', primary: true });
  }
  if (order.status === OrderStatus.PAID && canOperate.value) {
    actions.push({ key: 'accept', label: '接单', primary: true });
  }
  if (order.status === OrderStatus.PREPARING && canOperate.value) {
    actions.push({ key: 'ready', label: '出餐', primary: true });
  }
  if (order.status === OrderStatus.READY && canOperate.value) {
    actions.push({ key: 'complete', label: '完成', primary: true });
  }
  if (
    canCancel.value &&
    (order.status === OrderStatus.PENDING_PAYMENT ||
      order.status === OrderStatus.PAID ||
      order.status === OrderStatus.PREPARING)
  ) {
    actions.push({ key: 'cancel', label: '取消', primary: false });
  }
  return actions;
}

/** 状态色：待接单最紧急，其余按流程推进 */
const statusAccents: Record<number, 'danger' | 'warning' | 'primary' | 'success' | 'muted'> = {
  [OrderStatus.PENDING_PAYMENT]: 'warning',
  [OrderStatus.PAID]: 'danger',
  [OrderStatus.PREPARING]: 'primary',
  [OrderStatus.READY]: 'success',
  [OrderStatus.COMPLETED]: 'muted',
  [OrderStatus.CANCELLED]: 'muted',
};

const acting = ref(false);

async function runAction(order: Order, action: OrderAction['key']): Promise<void> {
  if (action === 'cancel') {
    let reason = '';
    try {
      const result = await ElMessageBox.prompt(
        `确定取消订单 ${order.orderNo} 吗？可填写原因，便于后续对账。`,
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
        `确认已收到订单 ${order.orderNo} 的款项 ¥ ${fenToYuan(order.payableAmount)}？`,
        '标记线下收款',
        { type: 'warning', confirmButtonText: '确认已收款', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
  }

  const handlers: Record<
    Exclude<OrderAction['key'], 'cancel'>,
    (id: number) => Promise<unknown>
  > = {
    accept: acceptOrder,
    ready: readyOrder,
    complete: completeOrder,
    'offline-pay': markOrderOfflinePaid,
  };

  const successText: Record<Exclude<OrderAction['key'], 'cancel'>, string> = {
    accept: '已接单，进入制作中',
    ready: '已出餐，等待取餐',
    complete: '订单已完成',
    'offline-pay': '已收款，订单进入待接单',
  };

  acting.value = true;
  try {
    await handlers[action](order.id);
    ElMessage.success(successText[action]);
    await afterMutation();
  } finally {
    acting.value = false;
  }
}

/** 操作后刷新列表与计数，并同步已打开的详情 */
async function afterMutation(): Promise<void> {
  await Promise.all([load(), loadStatusCounts()]);
  if (detailVisible.value && detailOrder.value) {
    detailOrder.value = await fetchOrder(detailOrder.value.id).catch(() => detailOrder.value);
  }
}

/* ---------------- 详情 ---------------- */

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
    // 详情接口失败时退回列表数据，基本信息仍可展示
  } finally {
    detailLoading.value = false;
  }
}

const timelineNodes = computed(() => {
  const order = detailOrder.value;
  if (!order) {
    return [];
  }
  return [
    { label: '下单', time: order.createdAt },
    { label: '支付', time: order.paidAt },
    { label: '接单', time: order.acceptedAt },
    { label: '出餐', time: order.readyAt },
    { label: '完成', time: order.completedAt },
    { label: '取消', time: order.cancelledAt },
  ].filter((node) => Boolean(node.time));
});

function unitPrice(item: OrderItem): string {
  return fenToYuan(item.unitPrice + item.specAmount);
}

/* ---------------- 定时刷新 ---------------- */

let pollTimer: number | undefined;

onMounted(async () => {
  // 顶部回执小票与工作台式入口会带 ?status= / ?keyword= 进来
  const statusFromQuery = Number(route.query.status);
  if (Object.values(OrderStatus).includes(statusFromQuery as OrderStatus)) {
    query.status = statusFromQuery as OrderStatus;
  }
  const keywordFromQuery = route.query.keyword;
  if (typeof keywordFromQuery === 'string' && keywordFromQuery) {
    query.keyword = keywordFromQuery;
  }

  await loadStatusCounts();
  await load();

  pollTimer = window.setInterval(() => {
    // 正在操作或开着详情时不打扰，避免把用户看到的列表换掉
    if (!acting.value && !detailVisible.value) {
      void Promise.all([load(), loadStatusCounts()]);
    }
  }, POLL_MS);
});

onBeforeUnmount(() => {
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer);
  }
});
</script>

<template>
  <div class="terminal-page orders">
    <PageHeader
      title="订单流转"
      :description="`本门店的订单。每 ${POLL_MS / 1000} 秒自动刷新一次；当前 ${pendingTotal} 笔未进入终态`"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="afterMutation">刷新</el-button>
      </template>
    </PageHeader>

    <div class="orders__chips">
      <button
        v-for="chip in chips"
        :key="String(chip.value)"
        class="chip"
        :class="{ 'is-active': query.status === chip.value }"
        type="button"
        @click="selectStatus(chip.value)"
      >
        <span>{{ chip.label }}</span>
        <span v-if="chip.count !== undefined" class="num chip__count">{{ chip.count }}</span>
      </button>

      <span class="orders__spacer" />

      <button
        class="chip"
        :class="{ 'is-active': todayOnly }"
        type="button"
        @click="todayOnly = !todayOnly"
      >
        <el-icon class="chip__icon"><Clock /></el-icon>
        <span>只看今天</span>
      </button>
    </div>

    <div class="orders__filters">
      <el-input
        v-model="query.keyword"
        class="orders__search"
        placeholder="订单号 / 手机号"
        :prefix-icon="Search"
        clearable
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" :icon="Search" @click="search">查询</el-button>
      <el-button :icon="Refresh" @click="handleReset">重置</el-button>
    </div>

    <div v-loading="loading" class="orders__body">
      <div v-if="list.length" class="orders__grid">
        <article
          v-for="(_, index) in list"
          :key="rowAt(index).id"
          class="ocard"
          :class="`is-${statusAccents[rowAt(index).status]}`"
        >
          <header class="ocard__head">
            <div class="ocard__id">
              <span class="num ocard__no">{{ rowAt(index).orderNo }}</span>
              <span class="ocard__src">
                {{ rowAt(index).sourceLabel }}
                <template v-if="rowAt(index).tableNo"> · 桌号 {{ rowAt(index).tableNo }}</template>
              </span>
            </div>
            <span class="ocard__time num">{{ timeOnly(rowAt(index).createdAt) }}</span>
          </header>

          <p class="ocard__items">{{ itemSummary(rowAt(index)) }}</p>

          <p class="ocard__sub num">
            共 {{ rowAt(index).itemCount }} 件 ·
            {{
              rowAt(index).paidAmount === null
                ? '未收款'
                : `已收 ¥ ${fenToYuan(rowAt(index).paidAmount)}`
            }}
            <template v-if="rowAt(index).createdByName">
              · 经手 {{ rowAt(index).createdByName }}</template
            >
          </p>

          <footer class="ocard__foot">
            <div class="ocard__money">
              <strong class="num">¥ {{ fenToYuan(rowAt(index).payableAmount) }}</strong>
              <span>{{
                rowAt(index).statusLabel || ORDER_STATUS_LABELS[rowAt(index).status]
              }}</span>
            </div>
            <div class="ocard__actions">
              <button class="ocard__detail" type="button" @click="openDetail(rowAt(index))">
                详情
              </button>
              <button
                v-for="action in availableActions(rowAt(index))"
                :key="action.key"
                class="ocard__btn"
                :class="{ 'is-danger': !action.primary }"
                type="button"
                :disabled="acting"
                @click="runAction(rowAt(index), action.key)"
              >
                {{ action.label }}
              </button>
            </div>
          </footer>
        </article>
      </div>

      <TableEmpty
        v-else-if="!loading"
        :filtered="isFiltered"
        title="这一屏没有订单"
        hint="换个状态看看，或等顾客扫码下单 / 在收银台开单后回来刷新。"
      />
    </div>

    <TablePagination
      :total="total"
      :page="query.page"
      :page-size="query.pageSize"
      @page-change="handlePageChange"
      @size-change="handlePageSizeChange"
    />

    <!-- 详情 -->
    <el-drawer v-model="detailVisible" title="订单详情" size="520px">
      <div v-loading="detailLoading" class="odetail">
        <template v-if="detailOrder">
          <header class="odetail__head">
            <div>
              <p class="num odetail__no">{{ detailOrder.orderNo }}</p>
              <p class="muted">
                {{ formatDateTime(detailOrder.createdAt) }} · {{ detailOrder.sourceLabel }}
              </p>
            </div>
            <el-tag
              :type="ORDER_STATUS_TAG_TYPES[detailOrder.status]"
              effect="light"
              size="large"
              round
            >
              {{ detailOrder.statusLabel }}
            </el-tag>
          </header>

          <div class="odetail__actions">
            <button
              v-for="action in availableActions(detailOrder)"
              :key="action.key"
              class="ocard__btn ocard__btn--lg"
              :class="{ 'is-danger': !action.primary }"
              type="button"
              :disabled="acting"
              @click="runAction(detailOrder, action.key)"
            >
              {{ action.label }}
            </button>
            <span v-if="availableActions(detailOrder).length === 0" class="muted">
              已进入终态，无可执行操作
            </span>
          </div>

          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="桌号">{{
              orEmpty(detailOrder.tableNo)
            }}</el-descriptions-item>
            <el-descriptions-item label="称呼">{{
              orEmpty(detailOrder.customerName)
            }}</el-descriptions-item>
            <el-descriptions-item label="手机号">
              <span class="num">{{ orEmpty(detailOrder.customerPhone) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="经手人">{{
              orEmpty(detailOrder.createdByName)
            }}</el-descriptions-item>
            <el-descriptions-item label="应收">
              <span class="num">¥ {{ fenToYuan(detailOrder.payableAmount) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="实收">
              <span class="num">
                {{
                  detailOrder.paidAmount === null
                    ? '未收款'
                    : `¥ ${fenToYuan(detailOrder.paidAmount)}`
                }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{
              orEmpty(detailOrder.remark)
            }}</el-descriptions-item>
            <el-descriptions-item v-if="detailOrder.cancelReason" label="取消原因" :span="2">
              {{ detailOrder.cancelReason }}
            </el-descriptions-item>
          </el-descriptions>

          <h3 class="odetail__section">商品明细</h3>
          <ul class="odetail__items">
            <li v-for="item in detailOrder.items" :key="item.id" class="odetail__item">
              <span class="odetail__item-name">
                {{ item.dishName }}
                <em v-if="item.specSummary">{{ item.specSummary }}</em>
              </span>
              <span class="num">× {{ item.quantity }}</span>
              <span class="num">¥ {{ unitPrice(item) }} /份</span>
              <span class="num odetail__item-subtotal">¥ {{ fenToYuan(item.subtotal) }}</span>
            </li>
          </ul>

          <h3 class="odetail__section">流转记录</h3>
          <el-timeline>
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
.orders {
  gap: var(--space-3);

  &__chips,
  &__filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__spacer {
    margin-left: auto;
  }

  &__search {
    width: 236px;
  }

  &__body {
    flex: 1;
    min-height: 160px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-3);
  }
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background-color: var(--surface);
  color: var(--text-regular);
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
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
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  &__icon {
    font-size: 14px;
  }
}

/* ---------------- 订单卡片 ---------------- */
.ocard {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background-color: var(--surface);
  box-shadow: var(--shadow-xs);
  overflow: hidden;

  /* 左侧色条 = 紧急程度，比整块底色更克制 */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background-color: var(--neutral-300);
  }

  &.is-danger::before {
    background-color: var(--danger-500);
  }

  &.is-warning::before {
    background-color: var(--warning-500);
  }

  &.is-primary::before {
    background-color: var(--brand-500);
  }

  &.is-success::before {
    background-color: var(--success-500);
  }

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  &__id {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__no {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text-primary);
  }

  &__src {
    font-size: 11.5px;
    color: var(--text-placeholder);
  }

  &__time {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }

  &__items {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-regular);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__sub {
    font-size: 11.5px;
    color: var(--text-placeholder);
  }

  &__foot {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: 4px;
    padding-top: var(--space-3);
    border-top: 1px dashed var(--border-color);
  }

  &__money {
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong {
      font-size: 19px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    span {
      font-size: 11.5px;
      color: var(--text-secondary);
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  &__detail {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background-color: transparent;
    color: var(--text-secondary);
    font-size: 12.5px;
    cursor: pointer;

    &:hover {
      color: var(--brand-700);
      background-color: var(--brand-50);
    }
  }

  /* 大号动作按钮：戴手套 / 单手也能按准 */
  &__btn {
    min-height: var(--touch-size);
    padding: 0 16px;
    border: none;
    border-radius: var(--radius-sm);
    background: linear-gradient(140deg, var(--brand-500), var(--brand-700));
    color: #fff;
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: var(--shadow-brand);
    transition:
      transform var(--duration-fast) var(--ease-out-quart),
      box-shadow var(--duration-fast) var(--ease-out-quart);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: scale(0.98);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      box-shadow: none;
    }

    &.is-danger {
      background-color: var(--surface);
      border: 1px solid var(--border-color-strong);
      color: var(--danger-500);
      box-shadow: none;

      &:hover:not(:disabled) {
        border-color: var(--danger-500);
        background-color: var(--danger-100);
      }
    }

    &--lg {
      min-width: 92px;
    }
  }
}

/* ---------------- 详情抽屉 ---------------- */
.odetail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 120px;

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    padding-bottom: var(--space-3);
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
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__section {
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

  &__item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52px 92px 84px;
    align-items: baseline;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--neutral-100);
    font-size: 12.5px;
    color: var(--text-regular);

    &:last-child {
      border-bottom: none;
    }

    &-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      em {
        margin-left: 4px;
        font-size: 11px;
        font-style: normal;
        color: var(--text-placeholder);
      }
    }

    &-subtotal {
      text-align: right;
      font-weight: 600;
      color: var(--text-primary);
    }
  }
}
</style>
