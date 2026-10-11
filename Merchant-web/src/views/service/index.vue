<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ChatDotRound, Promotion, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  closeServiceSession,
  fetchServiceSession,
  fetchServiceSessions,
  replyServiceSession,
} from '@/api/service';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import { SERVICE_SESSION_STATUS_LABELS, SERVICE_SESSION_STATUS_OPTIONS, SERVICE_SESSION_STATUS_TAG_TYPES } from '@/types/service';
import type { ServiceMessage, ServiceSession, ServiceSessionQuery, ServiceSessionStatus } from '@/types/service';
import { Permission } from '@shared/types/enums';
import { orEmpty } from '@shared/utils/format';
import { useUserStore } from '@/store/modules/user';

/**
 * 客服工作台。
 *
 * 后端的客服消息是**轮询**模型（没上 WebSocket），所以这里必须自己定时刷：
 * 每 5 秒刷一次会话列表（未读与最后一条预览）与当前打开的会话。
 * 定时器在 onBeforeUnmount 里必须清掉 —— 收银台 / 后台是长时间开着的页，
 * 留着定时器会让组件卸载后还在打接口。
 *
 * 轮询请求一律 silent：网络抖一下不该每 5 秒弹一次红色提示，
 * 但失败要在界面上留一句话如实说明，不能装作数据是新的。
 */
const userStore = useUserStore();
const canReply = computed(() => userStore.hasPermission(Permission.SERVICE_UPDATE));

const POLL_MS = 5000;
/** 消息长度上限，与后端 SERVICE_MESSAGE_MAX_LENGTH 同一条线 */
const MESSAGE_MAX_LENGTH = 500;

/* ---------------- 会话列表 ---------------- */

const defaultQuery: ServiceSessionQuery = { page: 1, pageSize: 20, status: undefined };

const sessions = ref<ServiceSession[]>([]);
const total = ref(0);
const query = reactive<ServiceSessionQuery>({ ...defaultQuery });
const listLoading = ref(false);
const pollFailed = ref(false);

async function loadSessions(silent = false): Promise<void> {
  if (!silent) {
    listLoading.value = true;
  }
  try {
    const page = await fetchServiceSessions({ ...query }, silent);
    sessions.value = page.list;
    total.value = page.total;
    pollFailed.value = false;
  } catch {
    if (silent) {
      pollFailed.value = true;
    }
  } finally {
    if (!silent) {
      listLoading.value = false;
    }
  }
}

const unreadTotal = computed(() =>
  sessions.value.reduce((sum, item) => sum + (item.status === 'closed' ? 0 : item.unread), 0),
);

const isFiltered = computed(() => query.status !== undefined);

function handlePageChange(page: number): void {
  query.page = page;
  void loadSessions();
}

watch(
  () => query.status,
  () => {
    query.page = 1;
    void loadSessions();
  },
);

/* ---------------- 当前会话与消息 ---------------- */

const activeId = ref<number | null>(null);
const active = computed<ServiceSession | null>(
  () => sessions.value.find((item) => item.id === activeId.value) ?? null,
);
const messages = ref<ServiceMessage[]>([]);
const detailLoading = ref(false);
const detailFailed = ref(false);

async function loadDetail(id: number, silent = false): Promise<void> {
  if (!silent) {
    detailLoading.value = true;
  }
  try {
    const result = await fetchServiceSession(id, silent);
    // 会话可能已被切走，回来的数据只贴给仍然打开的那条
    if (activeId.value !== id) {
      return;
    }
    messages.value = result.messages;
    // 服务端在 detail 里已把客服侧未读清零，本地同步一下，否则徽标要等到下一轮轮询才消失
    if (result.session) {
      applySession(result.session);
    }
    detailFailed.value = false;
    void scrollToEnd();
  } catch {
    if (silent) {
      pollFailed.value = true;
    } else {
      detailFailed.value = true;
      messages.value = [];
    }
  } finally {
    if (!silent) {
      detailLoading.value = false;
    }
  }
}

function applySession(session: ServiceSession): void {
  const index = sessions.value.findIndex((item) => item.id === session.id);
  if (index === -1) {
    return;
  }
  sessions.value[index] = { ...sessions.value[index], ...session, unread: 0 };
}

async function openSession(row: ServiceSession): Promise<void> {
  activeId.value = row.id;
  detailFailed.value = false;
  messages.value = [];
  await loadDetail(row.id);
}

/* ---------------- 回复 ---------------- */

const draft = ref('');
const sending = ref(false);

async function handleSend(): Promise<void> {
  const id = activeId.value;
  const content = draft.value.trim();
  if (!id || !content) {
    return;
  }

  sending.value = true;
  try {
    const created = await replyServiceSession(id, content);
    messages.value = [...messages.value, created];
    draft.value = '';
    // 会话状态（open → replied）与未读数以服务端为准，不自己猜
    await Promise.all([loadSessions(true), loadDetail(id, true)]);
    void scrollToEnd();
  } catch {
    // 发送失败保留草稿，服务端原因已由请求层弹出
  } finally {
    sending.value = false;
  }
}

async function handleClose(): Promise<void> {
  const id = activeId.value;
  const row = active.value;
  if (!id || !row) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定结束与「${row.customerName ?? '该顾客'}」的会话吗？结束后这条会话不再出现在待回复列表，顾客再发消息会重新开启。`,
      '结束会话',
      { type: 'warning', confirmButtonText: '确认结束', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  try {
    await closeServiceSession(id);
    ElMessage.success('会话已结束');
    draft.value = '';
    await Promise.all([loadSessions(), loadDetail(id)]);
  } catch {
    // 服务端原因已由请求层弹出
  }
}

/* ---------------- 消息流滚动 ---------------- */

const scroller = ref<HTMLElement | null>(null);

async function scrollToEnd(): Promise<void> {
  await nextTick();
  const el = scroller.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

function timeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromNow(value: string | null): string {
  if (!value) {
    return '';
  }
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) {
    return '';
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return '刚刚';
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  return `${Math.floor(hours / 24)} 天前`;
}

/* ---------------- 轮询 ---------------- */

let pollTimer: number | undefined;

function startPolling(): void {
  pollTimer = window.setInterval(() => {
    // 正在打字时不刷新输入区，只刷列表；当前会话仍要拉新消息
    void loadSessions(true);
    const id = activeId.value;
    if (id !== null) {
      void loadDetail(id, true);
    }
  }, POLL_MS);
}

onBeforeUnmount(() => {
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
});

onMounted(async () => {
  await loadSessions();
  // 默认选中第一条待回复，客服进来就能直接干活
  const first = sessions.value.find((item) => item.status !== 'closed') ?? sessions.value[0];
  if (first) {
    await openSession(first);
  }
  startPolling();
});
</script>

<template>
  <div class="page service-desk">
    <PageHeader
      title="客服工作台"
      :description="`顾客在小程序发起的咨询。消息为轮询模型，本页每 ${POLL_MS / 1000} 秒自动刷新一次未读与新消息；回复以客服身份发给顾客`"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="listLoading" @click="loadSessions()">刷新</el-button>
      </template>
    </PageHeader>

    <p v-if="pollFailed" class="desk-note desk-note--warn">
      最近一次自动刷新失败，屏幕上可能是旧内容；点上方「刷新」重试。
    </p>

    <section class="panel desk">
      <!-- 左：会话列表 -->
      <aside class="desk__list">
        <div class="desk__filters">
          <el-select v-model="query.status" placeholder="全部状态" clearable size="small">
            <el-option
              v-for="option in SERVICE_SESSION_STATUS_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <span class="desk__count num">共 {{ total }} 条 · 未读 {{ unreadTotal }}</span>
        </div>

        <div v-loading="listLoading" class="desk__sessions">
          <button
            v-for="item in sessions"
            :key="item.id"
            class="session"
            :class="{ 'is-active': item.id === activeId }"
            type="button"
            @click="openSession(item)"
          >
            <span class="session__top">
              <strong class="session__name">{{ item.customerName ?? '顾客' }}</strong>
              <span v-if="item.unread" class="session__badge num">{{ item.unread }}</span>
            </span>
            <span class="session__preview">{{ orEmpty(item.lastMessage) }}</span>
            <span class="session__foot">
              <el-tag
                :type="SERVICE_SESSION_STATUS_TAG_TYPES[item.status as ServiceSessionStatus]"
                effect="plain"
                size="small"
                round
              >
                {{ SERVICE_SESSION_STATUS_LABELS[item.status as ServiceSessionStatus] }}
              </el-tag>
              <span class="session__time num">{{ fromNow(item.lastMessageAt) }}</span>
            </span>
          </button>

          <TableEmpty
            v-if="!sessions.length && !listLoading"
            :filtered="isFiltered"
            title="还没有顾客来咨询"
            hint="顾客在小程序「我的 → 在线客服」发起会话后，会出现在这里"
          />
        </div>

        <el-pagination
          v-if="total > query.pageSize"
          :total="total"
          :page-size="query.pageSize"
          :current-page="query.page"
          layout="prev, pager, next"
          size="small"
          background
          @current-change="handlePageChange"
        />
      </aside>

      <!-- 右：消息流 -->
      <div class="desk__chat">
        <template v-if="active">
          <header class="chat__head">
            <div class="cell-stack">
              <span class="chat__name">
                {{ active.customerName ?? '顾客' }}
                <span class="chat__phone num">{{ orEmpty(active.customerPhone) }}</span>
              </span>
              <span class="chat__meta num">
                会话 #{{ active.id }}
                <template v-if="active.orderId"> · 关联订单 #{{ active.orderId }}</template>
                <template v-if="active.storeId"> · 门店 #{{ active.storeId }}</template>
              </span>
            </div>
            <div class="chat__head-actions">
              <el-tag
                :type="SERVICE_SESSION_STATUS_TAG_TYPES[active.status]"
                effect="light"
                size="small"
                round
              >
                {{ SERVICE_SESSION_STATUS_LABELS[active.status] }}
              </el-tag>
              <el-button
                v-if="canReply && active.status !== 'closed'"
                link
                type="danger"
                @click="handleClose"
              >
                结束会话
              </el-button>
            </div>
          </header>

          <div v-loading="detailLoading" ref="scroller" class="chat__body">
            <p v-if="detailFailed" class="desk-note desk-note--danger">
              这条会话的消息没能加载出来，请点右上角刷新或重新选择会话。
            </p>

            <template v-else>
              <div
                v-for="item in messages"
                :key="item.id"
                class="bubble"
                :class="item.sender === 'staff' ? 'bubble--staff' : 'bubble--customer'"
              >
                <p class="bubble__meta num">
                  {{ item.senderName }} · {{ timeOnly(item.createdAt) }}
                  <span v-if="item.orderNo" class="bubble__order">订单 {{ item.orderNo }}</span>
                </p>
                <p class="bubble__text">{{ item.content }}</p>
              </div>

              <TableEmpty
                v-if="!messages.length && !detailLoading"
                title="这条会话还没有消息"
                hint="顾客发出第一句后这里就会有内容"
              />
            </template>
          </div>

          <footer class="chat__foot">
            <template v-if="canReply && active.status !== 'closed'">
              <el-input
                v-model="draft"
                type="textarea"
                :rows="3"
                :maxlength="MESSAGE_MAX_LENGTH"
                show-word-limit
                resize="none"
                placeholder="回复顾客，Enter 换行、Ctrl + Enter 发送"
                @keydown.ctrl.enter.prevent="handleSend"
              />
              <div class="chat__foot-bar">
                <span class="muted">回复会推送给顾客，请以门店口径作答</span>
                <el-button
                  type="primary"
                  :icon="Promotion"
                  :loading="sending"
                  :disabled="!draft.trim()"
                  @click="handleSend"
                >
                  发送
                </el-button>
              </div>
            </template>
            <p v-else-if="active.status === 'closed'" class="chat__closed">
              会话已结束，不再接受回复。顾客下次咨询会新开会话。
            </p>
            <p v-else class="chat__closed">
              当前账号没有客服回复权限（service:update），只能查看会话内容。
            </p>
          </footer>
        </template>

        <div v-else class="chat__empty">
          <el-icon class="chat__empty-icon"><ChatDotRound /></el-icon>
          <template v-if="activeId !== null">
            <!-- 筛完状态后原来那条会话可能就不在这一屏了，说清楚而不是假装没选过 -->
            <p class="chat__empty-title">这条会话不在当前筛选结果里</p>
            <p class="muted">状态可能已经变了，把筛选改回「全部」就能看到它。</p>
          </template>
          <template v-else>
            <p class="chat__empty-title">从左边选一条会话开始回复</p>
            <p class="muted">未读角标每 {{ POLL_MS / 1000 }} 秒刷新一次，不必手动点刷新。</p>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.service-desk {
  gap: var(--space-3);
}

.desk-note {
  margin: 0;
  font-size: 12.5px;

  &--warn {
    color: var(--warning-500);
  }

  &--danger {
    color: var(--danger-500);
  }
}

.desk {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  height: calc(100vh - 240px);
  min-height: 520px;
  overflow: hidden;

  &__list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border-right: 1px solid var(--neutral-100);
    min-width: 0;
  }

  &__filters {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__count {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__sessions {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  &__chat {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
}

.session {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: var(--space-3);
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background-color: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);

  &:hover {
    background-color: var(--neutral-25);
  }

  &.is-active {
    border-color: var(--brand-300);
    background-color: var(--brand-50);
  }

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  /* 未读高亮：靠角标 + 标题加粗，不用整块底色吓人 */
  &__badge {
    min-width: 20px;
    padding: 0 6px;
    border-radius: var(--radius-full);
    background-color: var(--danger-500);
    color: #fff;
    font-size: 11.5px;
    line-height: 18px;
    text-align: center;
  }

  &__preview {
    font-size: 12.5px;
    color: var(--text-regular);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__time {
    font-size: 11.5px;
    color: var(--text-placeholder);
  }
}

.chat {
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--neutral-100);
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__phone {
    margin-left: var(--space-2);
    font-size: 12px;
    font-weight: 400;
    color: var(--text-secondary);
  }

  &__meta {
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__head-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: var(--space-5);
    background-color: var(--neutral-25);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  &__foot {
    padding: var(--space-3) var(--space-5) var(--space-4);
    border-top: 1px solid var(--neutral-100);
    background-color: var(--surface);
  }

  &__foot-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  &__closed {
    margin: 0;
    font-size: 12.5px;
    color: var(--text-secondary);
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: 100%;
    padding: var(--space-8);

    &-icon {
      font-size: 34px;
      color: var(--brand-300);
    }

    &-title {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-regular);
    }
  }
}

.bubble {
  max-width: 62%;

  &__meta {
    margin: 0 0 4px;
    font-size: 11.5px;
    color: var(--text-placeholder);
  }

  &__order {
    margin-left: var(--space-2);
    color: var(--brand-600);
  }

  &__text {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--text-primary);
    background-color: var(--surface);
    border: 1px solid var(--border-color);
    white-space: pre-wrap;
    word-break: break-word;
  }

  &--customer {
    align-self: flex-start;
  }

  &--staff {
    align-self: flex-end;
    text-align: right;

    .bubble__text {
      background-color: var(--brand-50);
      border-color: var(--brand-200);
    }
  }
}
</style>
