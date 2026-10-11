<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import {
  callQueue,
  fetchQueues,
  passQueue,
  recallQueue,
  seatQueue,
  takeQueue,
} from '@/api/queue';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import { Permission } from '@shared/types/enums';
import { formatDate } from '@shared/utils/format';
import {
  QUEUE_STATUS_LABELS,
  QUEUE_STATUS_TAG_TYPES,
  QUEUE_TABLE_TYPES,
  resolveTableType,
} from '@/types/queue';
import type { QueueRow, QueueStatus } from '@/types/queue';
import { useTerminalStore } from '@/store/modules/terminal';
import { useUserStore } from '@/store/modules/user';

/**
 * 叫号台。
 *
 * 三件事：代客取号、按桌型看当日队列、把每一桌推到下一步。
 * 状态机由服务端硬校验（waiting → called/passed；called → seated/passed；
 * passed → waiting(召回回队尾)/cancelled；seated 终态），
 * 因此每张卡片只渲染**当前状态允许的按钮**，别的状态一个都不给 ——
 * 多出来的按钮按下去只会吃一个 400，收银台上等于白等一秒。
 *
 * 队列接口返回的是数组（不分页），`ahead` 在门店侧列表里恒为 0，
 * 所以「前面还有几桌」不显示，只显示各桌型的等待桌数（这个由当日队列真实算出）。
 */
const userStore = useUserStore();
const canOperate = computed(() => userStore.hasPermission(Permission.QUEUE_UPDATE));
const canTake = computed(() => userStore.hasPermission(Permission.QUEUE_CREATE));

/** 自动刷新间隔：顾客在小程序里自助取号，靠轮询才看得见 */
const POLL_MS = 15_000;

/* ---------------- 门店 ---------------- */

/**
 * 收银台是「一台机器 = 一个门店」：账号是门店绑定角色（收银员 / 门店管理员），
 * 服务端按 Token 强制本店，前端传的 storeId 只用于满足取号接口的必填参数。
 * 所以这里做成只读的门店上下文，而不是一个永远只有一项的下拉框。
 */
const terminalStore = useTerminalStore();
const storeId = computed(() => userStore.storeId ?? terminalStore.store?.id);

/* ---------------- 队列 ---------------- */

const rows = ref<QueueRow[]>([]);
const loading = ref(false);
const pollFailed = ref(false);
/** 只看某一种状态；不传即当日全部 */
const statusFilter = ref<QueueStatus | undefined>(undefined);

async function load(silent = false): Promise<void> {
  if (!silent) {
    loading.value = true;
  }
  try {
    rows.value = await fetchQueues({
      storeId: storeId.value,
      status: statusFilter.value,
      pageSize: 100,
    });
    pollFailed.value = false;
  } catch {
    if (silent) {
      pollFailed.value = true;
    } else {
      rows.value = [];
    }
  } finally {
    if (!silent) {
      loading.value = false;
    }
  }
}

watch(statusFilter, () => {
  void load();
});

const STATUS_FILTERS: QueueStatus[] = ['waiting', 'called', 'passed', 'seated', 'cancelled'];

const statusChips = computed(() => [
  { value: undefined as QueueStatus | undefined, label: '全部' },
  ...STATUS_FILTERS.map((value) => ({
    value: value as QueueStatus | undefined,
    label: QUEUE_STATUS_LABELS[value],
  })),
]);

/** 每个桌型这一屏的真实条数 */
function rowsOf(tableType: string): QueueRow[] {
  return rows.value.filter((row) => row.tableType === tableType);
}

/** 等待桌数：只算 waiting，叫号中与过号的不算「还在排」 */
function waitingCount(tableType: string): number {
  return rowsOf(tableType).filter((row) => row.status === 'waiting').length;
}

const totalWaiting = computed(() =>
  QUEUE_TABLE_TYPES.reduce((sum, type) => sum + waitingCount(type.key), 0),
);

const bizDateLabel = computed(() => formatDate(rows.value[0]?.bizDate ?? new Date()));

/* ---------------- 代客取号 ---------------- */

const takeForm = ref({
  tableType: 'small',
  partySize: 2,
  phone: '',
});
const taking = ref(false);

const activeTableType = computed(() => resolveTableType(takeForm.value.tableType));

/** 换桌型时把人数拉回该桌型区间，否则服务端会以「桌型不支持 N 人」拒掉 */
watch(
  () => takeForm.value.tableType,
  (key) => {
    const type = resolveTableType(key);
    if (!type) {
      return;
    }
    takeForm.value.partySize = Math.min(Math.max(takeForm.value.partySize, type.minParty), type.maxParty);
  },
);

function stepParty(delta: number): void {
  const type = activeTableType.value;
  if (!type) {
    return;
  }
  const next = takeForm.value.partySize + delta;
  takeForm.value.partySize = Math.min(Math.max(next, type.minParty), type.maxParty);
}

const PARTY_QUICK = QUEUE_TABLE_TYPES.map((type) => ({
  key: type.key,
  label: type.shortLabel,
  hint: `${type.minParty}-${type.maxParty} 人`,
}));

async function handleTake(): Promise<void> {
  const id = storeId.value;
  if (id === undefined) {
    ElMessage.warning('当前账号没有绑定门店，无法取号，请联系管理员');
    return;
  }
  const phone = takeForm.value.phone.trim();
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    ElMessage.warning('手机号格式不正确');
    return;
  }

  taking.value = true;
  try {
    const created = await takeQueue({
      storeId: id,
      tableType: takeForm.value.tableType,
      partySize: takeForm.value.partySize,
      phone: phone || undefined,
    });
    ElMessage.success(`已取号 ${created.queueNo}`);
    takeForm.value.phone = '';
    statusFilter.value = undefined;
    await load();
  } catch {
    // 门店打烊 / 桌型人数不符，服务端原因已由请求层弹出
  } finally {
    taking.value = false;
  }
}

/* ---------------- 状态推进 ---------------- */

interface QueueAction {
  key: 'call' | 'seat' | 'pass' | 'recall';
  label: string;
  primary: boolean;
}

/** 后端状态机在前端的映射：只给「当前状态的下一步」 */
function nextActions(row: QueueRow): QueueAction[] {
  if (!canOperate.value) {
    return [];
  }
  switch (row.status) {
    case 'waiting':
      return [
        { key: 'call', label: '叫号', primary: true },
        { key: 'pass', label: '过号', primary: false },
      ];
    case 'called':
      return [
        { key: 'seat', label: '入座', primary: true },
        { key: 'pass', label: '过号', primary: false },
      ];
    case 'passed':
      return [{ key: 'recall', label: '召回', primary: true }];
    default:
      // seated / cancelled 是终态，没有任何可点动作
      return [];
  }
}

const acting = ref(false);

async function runAction(row: QueueRow, action: QueueAction['key']): Promise<void> {
  const handlers = {
    call: callQueue,
    seat: seatQueue,
    pass: passQueue,
    recall: recallQueue,
  } as const;

  acting.value = true;
  try {
    const updated = await handlers[action](row.id);
    // 召回会换发新号面（回队尾），提示里必须给返回的新号，否则收银员还照着旧号喊
    ElMessage.success(
      action === 'recall' ? `已召回，回队尾并换发新号 ${updated.queueNo}` : `${row.queueNo} ${QUEUE_STATUS_LABELS[updated.status]}`,
    );
    await load();
  } catch {
    // 状态被另一端先推进了会吃 400，原因已由请求层弹出，刷新一次让屏幕回到真相
    await load();
  } finally {
    acting.value = false;
  }
}

/* ---------------- 展示辅助 ---------------- */

function timeOnly(value: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ---------------- 轮询 ---------------- */

let pollTimer: number | undefined;

onMounted(async () => {
  await terminalStore.load();
  await load();
  pollTimer = window.setInterval(() => {
    // 正在推进状态或正在取号时不打扰，避免把屏幕上的卡片换掉
    if (!acting.value && !taking.value) {
      void load(true);
    }
  }, POLL_MS);
});

onBeforeUnmount(() => {
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
});
</script>

<template>
  <div class="terminal-page desk">
    <PageHeader
      title="叫号台"
      :description="`${bizDateLabel} 的队列，每 ${POLL_MS / 1000} 秒自动刷新。顾客在小程序自助取号后也会出现在这里；当前 ${totalWaiting} 桌在排队`"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load()">刷新</el-button>
      </template>
    </PageHeader>

    <p v-if="pollFailed" class="desk__warn">最近一次自动刷新失败，屏幕上的队列可能是旧的。</p>

    <!-- 代客取号 -->
    <section v-if="canTake" class="panel take">
      <div class="take__row">
        <div class="take__field">
          <span class="take__label">门店</span>
          <p class="take__store">{{ terminalStore.storeName || '未绑定门店' }}</p>
        </div>

        <div class="take__field">
          <span class="take__label">桌型</span>
          <div class="take__types">
            <button
              v-for="item in PARTY_QUICK"
              :key="item.key"
              class="chip"
              :class="{ 'is-active': takeForm.tableType === item.key }"
              type="button"
              @click="takeForm.tableType = item.key"
            >
              {{ item.label }}
              <em class="chip__hint">{{ item.hint }}</em>
            </button>
          </div>
        </div>

        <div class="take__field">
          <span class="take__label">人数</span>
          <div class="stepper">
            <button class="stepper__btn" type="button" @click="stepParty(-1)">－</button>
            <span class="stepper__value num">{{ takeForm.partySize }}</span>
            <button class="stepper__btn" type="button" @click="stepParty(1)">＋</button>
          </div>
        </div>

        <label class="take__field">
          <span class="take__label">手机号（选填）</span>
          <el-input
            v-model="takeForm.phone"
            class="take__phone"
            placeholder="到店顾客留个号，方便过号后联系"
            maxlength="11"
            clearable
          />
        </label>

        <el-button
          class="take__submit"
          type="primary"
          size="large"
          :icon="Plus"
          :loading="taking"
          :disabled="storeId === undefined"
          @click="handleTake"
        >
          代客取号
        </el-button>
      </div>
      <p v-if="activeTableType" class="take__hint">
        {{ activeTableType.label }} 号面前缀 {{ activeTableType.prefix }}，人数超出区间会被服务端拒绝。
      </p>
    </section>

    <!-- 状态筛选 -->
    <div class="desk__chips">
      <button
        v-for="chip in statusChips"
        :key="String(chip.value)"
        class="chip"
        :class="{ 'is-active': statusFilter === chip.value }"
        type="button"
        @click="statusFilter = chip.value"
      >
        {{ chip.label }}
      </button>
    </div>

    <!-- 桌型分组卡片流 -->
    <div v-loading="loading" class="desk__body">
      <section
        v-for="type in QUEUE_TABLE_TYPES"
        :key="type.key"
        class="group"
        :class="{ 'group--muted': rowsOf(type.key).length === 0 }"
      >
        <header class="group__head">
          <div class="group__title">
            <strong>{{ type.label }}</strong>
            <span class="num group__waiting">等待 {{ waitingCount(type.key) }} 桌</span>
          </div>
          <span class="group__calling num">
            当前叫到
            {{ rowsOf(type.key).find((row) => row.status === 'called')?.queueNo ?? '—' }}
          </span>
        </header>

        <div v-if="rowsOf(type.key).length" class="group__grid">
          <article
            v-for="row in rowsOf(type.key)"
            :key="row.id"
            class="qcard"
            :class="`is-${row.status}`"
          >
            <div class="qcard__no num">{{ row.queueNo }}</div>
            <div class="qcard__party num">{{ row.partySize }} 人</div>
            <div class="qcard__status">
              <el-tag
                :type="QUEUE_STATUS_TAG_TYPES[row.status]"
                effect="light"
                size="small"
                round
              >
                {{ row.statusLabel || QUEUE_STATUS_LABELS[row.status] }}
              </el-tag>
            </div>
            <div class="qcard__time num">
              取 {{ timeOnly(row.createdAt) }}
              <template v-if="row.calledAt"> · 叫 {{ timeOnly(row.calledAt) }}</template>
              <template v-if="row.seatedAt"> · 坐 {{ timeOnly(row.seatedAt) }}</template>
            </div>

            <div class="qcard__actions">
              <button
                v-for="action in nextActions(row)"
                :key="action.key"
                class="qcard__btn"
                :class="{ 'is-ghost': !action.primary }"
                type="button"
                :disabled="acting"
                @click="runAction(row, action.key)"
              >
                {{ action.label }}
              </button>
              <span v-if="!nextActions(row).length" class="qcard__done">
                {{ canOperate ? '终态，无需操作' : '只读：当前账号无叫号权限' }}
              </span>
            </div>
          </article>
        </div>

        <p v-else class="group__empty">
          {{ statusFilter ? '这个桌型在当前状态下没有号' : '这个桌型今天还没有号' }}
        </p>
      </section>

      <TableEmpty
        v-if="!rows.length && !loading"
        :filtered="statusFilter !== undefined"
        title="今天还没有人取号"
        hint="顾客在小程序门店页点「排队取号」，或用上方「代客取号」替到店顾客取一张。"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.desk {
  gap: var(--space-4);

  &__warn {
    margin: 0;
    font-size: 12.5px;
    color: var(--warning-500);
  }

  &__chips {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-height: 200px;
  }
}

/* ---------------- 取号表单 ---------------- */
.take {
  padding: var(--space-4) var(--space-5);

  &__row {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: var(--space-5);
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  &__store {
    margin: 0;
    min-height: var(--touch-size);
    display: flex;
    align-items: center;
    padding: 0 var(--space-3);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background-color: var(--neutral-50);
    font-size: 13.5px;
    color: var(--text-regular);
  }

  &__types {
    display: flex;
    gap: 8px;
  }

  &__phone {
    width: 220px;
  }

  &__submit {
    min-width: 148px;
    min-height: var(--touch-size);
  }

  &__hint {
    margin: var(--space-3) 0 0;
    font-size: 12px;
    color: var(--text-placeholder);
  }
}

.stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;

  &__btn {
    width: var(--touch-size);
    height: var(--touch-size);
    border: none;
    background-color: var(--neutral-50);
    color: var(--text-regular);
    font-size: 18px;
    cursor: pointer;

    &:hover {
      background-color: var(--brand-50);
      color: var(--brand-700);
    }
  }

  &__value {
    min-width: 52px;
    text-align: center;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-height: var(--touch-size);
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background-color: var(--surface);
  color: var(--text-regular);
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

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

  &__hint {
    font-size: 11.5px;
    font-style: normal;
    color: var(--text-placeholder);
  }
}

/* ---------------- 桌型分组 ---------------- */
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &--muted {
    opacity: 0.55;
  }

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--neutral-200);
  }

  &__title {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);

    strong {
      font-size: 15px;
      color: var(--text-primary);
    }
  }

  &__waiting {
    font-size: 13px;
    font-weight: 600;
    color: var(--warning-500);
  }

  &__calling {
    font-size: 13px;
    color: var(--text-secondary);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(216px, 1fr));
    gap: var(--space-3);
  }

  &__empty {
    margin: 0;
    padding: var(--space-4) 0;
    font-size: 12.5px;
    color: var(--text-placeholder);
  }
}

/* ---------------- 号卡 ---------------- */
.qcard {
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background-color: var(--paper, var(--surface));
  box-shadow: var(--shadow-xs);
  overflow: hidden;

  /* 左侧色条 = 这一桌现在需不需要动手 */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background-color: var(--neutral-300);
  }

  &.is-waiting::before {
    background-color: var(--warning-500);
  }

  /* 已叫号：最该被看见的一档，等人到店 */
  &.is-called::before {
    background-color: var(--brand-500);
  }

  &.is-seated::before {
    background-color: var(--success-500);
  }

  &.is-passed::before,
  &.is-cancelled::before {
    background-color: var(--neutral-400);
  }

  &.is-seated,
  &.is-cancelled {
    opacity: 0.72;
  }

  &__no {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: var(--text-primary);
  }

  &__party {
    font-size: 13px;
    color: var(--text-regular);
  }

  &__status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__phone {
    font-size: 11.5px;
    color: var(--text-placeholder);
  }

  &__time {
    font-size: 11.5px;
    color: var(--text-placeholder);
  }

  &__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px dashed var(--border-color);
  }

  &__done {
    font-size: 11.5px;
    color: var(--text-placeholder);
  }

  /* 大号动作按钮：站着、单手、戴手套也要按得准 */
  &__btn {
    min-height: var(--touch-size);
    min-width: 72px;
    padding: 0 16px;
    border: none;
    border-radius: var(--radius-sm);
    background: linear-gradient(140deg, var(--brand-500), var(--brand-700));
    color: #fff;
    font-size: 14px;
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

    &.is-ghost {
      background-color: var(--surface);
      border: 1px solid var(--border-color-strong);
      color: var(--text-regular);
      box-shadow: none;

      &:hover:not(:disabled) {
        border-color: var(--danger-500);
        color: var(--danger-500);
      }
    }
  }
}
</style>
