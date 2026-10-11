<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import {
  cancelQueue,
  ensureSession,
  fetchMyQueue,
  fetchQueueBoard,
  takeQueue,
} from '@/api/customer';
import { useAppStore } from '@/store/app';
import type { QueueBoard, QueueRow } from '@/types/customer';
import { dayClock } from '@/utils/format';

/**
 * 桌型语义与后端 QUEUE_TABLE_TYPES 一一对应（key 必须原样发给后端），
 * 这里只重复一次 label，是为了把「几到几人」写进胶囊，顾客不用点进去才知道。
 */
const TABLE_TYPES = [
  { key: 'small', label: '小桌', range: '1-2 人', min: 1, max: 2 },
  { key: 'medium', label: '中桌', range: '3-6 人', min: 3, max: 6 },
  { key: 'large', label: '大桌', range: '7-20 人', min: 7, max: 20 },
] as const;

/** 后端 QUEUE_MAX_PARTY_SIZE：人数步进器的硬边界，桌型自己的范围只用来判定能不能取号 */
const PARTY_LIMIT = 20;

export default defineComponent({
  components: { LineIcon },

  setup() {
    const app = useAppStore();

    const board = ref<QueueBoard | null>(null);
    const boardStoreId = ref(0);
    const boardLoading = ref(false);
    const boardError = ref('');

    const mine = ref<QueueRow | null>(null);
    const mineLoading = ref(false);

    const tableType = ref<'small' | 'medium' | 'large'>('small');
    const partySize = ref(2);
    const taking = ref(false);

    const current = computed(() => TABLE_TYPES.find((item) => item.key === tableType.value) ?? TABLE_TYPES[0]);

    /**
     * 取号被挡住的真实原因。
     *
     * 换桌型时故意不把人数钳回范围内 —— 顾客从大桌切到小桌时，
     * 悄悄把 8 人改成 2 人是最容易被忽略的错，宁可禁用按钮把话说清楚。
     */
    const blockReason = computed(() => {
      const type = current.value;
      if (partySize.value < type.min) return `${type.label}最少 ${type.min} 人，现在是 ${partySize.value} 人`;
      if (partySize.value > type.max) return `${type.label}最多 ${type.max} 人，现在是 ${partySize.value} 人`;
      if (!app.store) return '先选择门店';
      return '';
    });

    async function loadBoard(): Promise<void> {
      const storeId = app.store?.id ?? 0;
      if (!storeId || boardLoading.value) return;
      boardLoading.value = true;
      boardError.value = '';
      try {
        board.value = await fetchQueueBoard(storeId);
        boardStoreId.value = storeId;
      } catch (cause) {
        // 看板是公开接口（限流 60 次/分），失败就如实说明，不拿 0 桌冒充结果
        board.value = null;
        boardError.value = (cause as Error).message || '队列没拉到';
      } finally {
        boardLoading.value = false;
      }
    }

    /** 进页面先认「我是不是已经在排队」，有的话不再给取号入口（后端同规则会拒） */
    async function loadMine(): Promise<void> {
      mineLoading.value = true;
      try {
        await ensureSession();
        mine.value = await fetchMyQueue();
      } catch {
        // 静默接口：拿不到就停在取号表单上，真取重了后端会给原文提示
        mine.value = null;
      } finally {
        mineLoading.value = false;
      }
    }

    function pickType(key: 'small' | 'medium' | 'large'): void {
      tableType.value = key;
    }

    function step(delta: number): void {
      const next = partySize.value + delta;
      if (next < 1 || next > PARTY_LIMIT) return;
      partySize.value = next;
    }

    async function take(): Promise<void> {
      const storeId = app.store?.id ?? 0;
      if (!storeId || taking.value || blockReason.value) return;
      taking.value = true;
      try {
        mine.value = await takeQueue({
          storeId,
          tableType: tableType.value,
          partySize: partySize.value,
        });
        uni.showToast({ title: '取号成功', icon: 'none' });
        void loadBoard();
      } catch {
        // 「已经在 xx 店排了 A012 号」这类原因由请求层原文 toast
      } finally {
        taking.value = false;
      }
    }

    function askCancel(): void {
      const row = mine.value;
      if (!row) return;
      uni.showModal({
        title: '取消取号',
        content: `确定取消 ${row.queueNo} 号吗？取消后要重新排队，会重新拿一个新号。`,
        confirmText: '取消取号',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await cancelQueue(row.id);
            mine.value = null;
            uni.showToast({ title: '已取消取号', icon: 'none' });
            void loadBoard();
          } catch {
            // 「已入座的号不能取消」等原文由请求层 toast，界面保持原状态
          }
        },
      });
    }

    /** 状态文案只讲后端确认给的信息，不编「预计还要 N 分钟」—— 后端没有这个数据 */
    const myStatusText = computed(() => {
      const row = mine.value;
      if (!row) return '';
      if (row.status === 'called') return '已叫到你的号，请尽快到店入座';
      if (row.status === 'seated') return '已入座';
      if (row.status === 'cancelled') return '已取消';
      return `前面还有 ${row.ahead} 桌在排队，请留意叫号`;
    });

    function goStores(): void {
      uni.navigateTo({ url: '/pages/stores/stores' });
    }

    return {
      app,
      TABLE_TYPES,
      PARTY_LIMIT,
      board,
      boardStoreId,
      boardLoading,
      boardError,
      mine,
      mineLoading,
      tableType,
      partySize,
      taking,
      current,
      blockReason,
      myStatusText,
      loadBoard,
      loadMine,
      pickType,
      step,
      take,
      askCancel,
      goStores,
      dayClock,
    };
  },

  async onShow() {
    void this.app.loadConfig();
    const storeId = this.app.store?.id ?? 0;
    if (!storeId) return;
    await this.loadMine();
    // 看板不自动轮询：公开接口 60 次/分，靠「刷新」按钮按需取
    if (!this.board || this.boardStoreId !== storeId) void this.loadBoard();
  },

  onPullDownRefresh() {
    void Promise.all([this.loadMine(), this.loadBoard()]).finally(() => uni.stopPullDownRefresh());
  },
});
</script>

<template>
  <view class="queue" :style="app.cssVars">
    <view v-if="!app.store" class="gate">
      <text class="gate__title">请先从门店页选择要排队的门店</text>
      <text class="gate__line">排队是按门店编号的，没进店就不知道该排进哪一条队列。</text>
      <view class="btn-main gate__btn" @click="goStores">去选门店</view>
    </view>

    <template v-else>
      <view class="head">
        <view class="head__left">
          <LineIcon name="queue" :size="16" tone="sub" />
          <text class="head__store">{{ app.store.name }}</text>
        </view>
        <text class="head__refresh" @click="loadBoard">{{ boardLoading ? '刷新中…' : '刷新' }}</text>
      </view>

      <!-- 队列看板 -->
      <view class="card board">
        <view class="board__top">
          <view class="board__calling">
            <text class="board__label">正在叫号</text>
            <text class="board__no num" :class="{ 'is-none': !board }">
              {{ board ? board.callingNo || '暂无叫号' : '—' }}
            </text>
          </view>
          <view class="board__waiting">
            <text class="board__label">当前等待</text>
            <text class="board__count num">{{ board ? `${board.waiting} 桌` : '—' }}</text>
          </view>
        </view>

        <view v-if="board" class="board__rows">
          <view v-for="item in board.byTableType" :key="item.tableType" class="brow">
            <text class="brow__label">{{ item.label }}</text>
            <text class="brow__value num">{{ item.waiting }} 桌</text>
          </view>
        </view>
        <view v-else class="board__rows board__rows--none">
          <text class="board__err">{{ boardError || '队列还没拉到' }}</text>
        </view>
      </view>

      <!-- 我的号：有进行中的号时只给这一个状态，不再出现第二个取号入口 -->
      <view v-if="mine" class="card mine">
        <text class="mine__label">{{ mine.tableTypeLabel }} · {{ mine.partySize }} 人</text>
        <text class="mine__no num">{{ mine.queueNo }}</text>
        <text class="mine__status">{{ myStatusText }}</text>
        <text class="mine__meta num">取号时间 {{ dayClock(mine.createdAt) }}</text>
        <view class="mine__actions">
          <text class="btn-ghost mine__btn" @click="askCancel">取消取号</text>
          <text class="btn-main mine__btn mine__btn--on" @click="loadMine">刷新状态</text>
        </view>
        <text class="mine__note">
          号由门店人工叫，过号请到前台说明；同一时间名下只能有一个进行中的号。
        </text>
      </view>

      <template v-else>
        <!-- 取号表单 -->
        <view class="card form">
          <text class="form__title">取号</text>

          <text class="form__sub">桌型</text>
          <view class="chips">
            <view
              v-for="item in TABLE_TYPES"
              :key="item.key"
              class="chip chips__item"
              :class="{ 'is-on': tableType === item.key }"
              @click="pickType(item.key)"
            >
              <text>{{ item.label }} {{ item.range }}</text>
            </view>
          </view>

          <view class="stepper">
            <text class="stepper__label">用餐人数</text>
            <view class="stepper__box">
              <view class="stepper__btn" :class="{ 'is-off': partySize <= 1 }" @click="step(-1)">
                <LineIcon name="minus" :size="16" tone="sub" />
              </view>
              <text class="stepper__value num">{{ partySize }}</text>
              <view
                class="stepper__btn"
                :class="{ 'is-off': partySize >= PARTY_LIMIT }"
                @click="step(1)"
              >
                <LineIcon name="plus" :size="16" tone="sub" />
              </view>
            </view>
            <text class="stepper__hint">{{ current.label }}：{{ current.range }}</text>
          </view>

          <text v-if="blockReason" class="form__warn">{{ blockReason }}</text>

          <view class="btn-main form__submit" :class="{ 'is-off': !!blockReason || taking }" @click="take">
            {{ taking ? '正在取号…' : '立即取号' }}
          </view>
          <text class="form__tip">
            取号后请留意叫号；门店打烊或队列异常时，后端会直接说明原因。
          </text>
        </view>
      </template>
    </template>
  </view>
</template>

<style scoped lang="scss">
.queue {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 8rpx var(--content-pad, 28rpx) 60rpx;
  background-color: var(--page-bg);
  color: var(--ink);
}

.gate {
  padding: 160rpx 40rpx 0;
  text-align: center;

  &__title {
    display: block;
    font-size: 32rpx;
    font-weight: 700;
  }

  &__line {
    display: block;
    margin-top: 14rpx;
    font-size: 24rpx;
    line-height: 1.6;
    color: var(--ink-2);
  }

  &__btn {
    margin: 56rpx auto 0;
    max-width: 460rpx;
  }
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 0 12rpx;

  &__left {
    display: flex;
    align-items: center;
    gap: 10rpx;
    min-width: 0;
  }

  &__store {
    font-size: 30rpx;
    font-weight: 700;
  }

  &__refresh {
    flex: none;
    font-size: 26rpx;
    color: var(--brand);
  }
}

.board {
  box-sizing: border-box;
  width: 100%;
  padding: 28rpx;

  &__top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24rpx;
  }

  &__label {
    display: block;
    font-size: 22rpx;
    color: var(--ink-2);
  }

  &__calling {
    flex: 1;
    min-width: 0;
  }

  /* 叫到的号用超大字号，和参考稿的「正在呼叫 A08」一致 */
  &__no {
    display: block;
    margin-top: 6rpx;
    font-size: 72rpx;
    line-height: 1.1;
    font-weight: 700;
    color: var(--brand);

    &.is-none {
      font-size: 40rpx;
      color: var(--ink-2);
    }
  }

  &__waiting {
    flex: none;
    text-align: right;
  }

  &__count {
    display: block;
    margin-top: 10rpx;
    font-size: 32rpx;
    font-weight: 700;
  }

  &__rows {
    margin-top: 24rpx;
    padding-top: 20rpx;
    border-top: 1rpx solid var(--divider);

    &--none {
      border-top: none;
      padding-top: 12rpx;
    }
  }

  &__err {
    font-size: 24rpx;
    color: var(--ink-2);
  }
}

.brow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;

  &__label {
    font-size: 26rpx;
    color: var(--ink-2);
  }

  &__value {
    font-size: 26rpx;
    font-weight: 600;
  }
}

.mine {
  box-sizing: border-box;
  width: 100%;
  margin-top: var(--section-gap);
  padding: 32rpx 28rpx;
  text-align: center;

  &__label {
    display: block;
    font-size: 24rpx;
    color: var(--ink-2);
  }

  &__no {
    display: block;
    margin-top: 12rpx;
    font-size: 120rpx;
    line-height: 1.1;
    font-weight: 700;
    color: var(--brand);
  }

  &__status {
    display: block;
    margin-top: 14rpx;
    font-size: 28rpx;
    font-weight: 600;
  }

  &__meta {
    display: block;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: var(--ink-2);
  }

  &__actions {
    display: flex;
    gap: 20rpx;
    margin-top: 32rpx;
  }

  &__btn {
    flex: 1;
    height: 80rpx;
    line-height: 78rpx;
    font-size: 28rpx;
  }

  &__btn--on {
    line-height: 80rpx;
  }

  &__note {
    display: block;
    margin-top: 20rpx;
    font-size: 20rpx;
    line-height: 1.7;
    color: var(--ink-2);
  }
}

.form {
  box-sizing: border-box;
  width: 100%;
  margin-top: var(--section-gap);
  padding: 28rpx;

  &__title {
    display: block;
    font-size: 30rpx;
    font-weight: 700;
  }

  &__sub {
    display: block;
    margin-top: 24rpx;
    font-size: 24rpx;
    color: var(--ink-2);
  }

  &__warn {
    display: block;
    margin-top: 20rpx;
    padding: 16rpx 20rpx;
    border-radius: var(--radius);
    background-color: var(--brand-soft);
    font-size: 22rpx;
    line-height: 1.6;
    color: var(--brand-sub);
  }

  &__submit {
    margin-top: 28rpx;
  }

  &__tip {
    display: block;
    margin-top: 16rpx;
    font-size: 20rpx;
    line-height: 1.7;
    color: var(--ink-2);
  }
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 16rpx;

  &__item {
    font-size: 24rpx;
  }
}

.stepper {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 28rpx;

  &__label {
    font-size: 24rpx;
    color: var(--ink-2);
  }

  &__box {
    display: flex;
    align-items: center;
    gap: 8rpx;
    padding: 6rpx;
    border-radius: 999rpx;
    background-color: var(--chip-bg);
  }

  &__btn {
    box-sizing: border-box;
    width: 56rpx;
    height: 56rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background-color: var(--card-bg);

    &.is-off {
      opacity: 0.4;
    }
  }

  &__value {
    min-width: 72rpx;
    text-align: center;
    font-size: 32rpx;
    font-weight: 700;
  }

  &__hint {
    flex: 1;
    text-align: right;
    font-size: 22rpx;
    color: var(--ink-2);
  }
}
</style>
