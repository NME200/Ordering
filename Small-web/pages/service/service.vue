<script lang="ts">
import { defineComponent, computed, nextTick, ref } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import {
  ensureSession,
  fetchCustomerOrder,
  fetchOrders,
  openServiceSession,
  pollServiceMessages,
  sendServiceMessage,
} from '@/api/customer';
import { useAppStore } from '@/store/app';
import { getLastMerchantId } from '@/utils/auth';
import type { CustomerOrder, ServiceMessage, ServiceSession } from '@/types/customer';
import { clock, dayClock, yuan } from '@/utils/format';

/** 与后端 SERVICE_MESSAGE_MAX_LENGTH 一致：超长度后端整条拒掉，前端先把住 */
const CONTENT_MAX = 500;

/**
 * 4 秒一次轮询。
 *
 * poll 接口按 IP 限流 120 次/分，客服是在商户后台手动回复的工单模式，
 * 再密的间隔只是空转 —— 页面一隐藏就必须把定时器关掉（onHide / onUnload），
 * 否则顾客切到别的功能页，这里还在后台一分钟打 15 次，把限流额度吃光。
 */
const POLL_INTERVAL = 4000;

/** 快捷提问：点了只填进输入框，顾客自己决定发不发（自动发会凭空造出一堆工单） */
const QUICK_ASKS = [
  '这一单大概还要多久？',
  '可以少放辣或者去掉某样配料吗？',
  '这一单想退款怎么操作？',
  '配送地址填错了能改吗？',
];

export default defineComponent({
  components: { LineIcon },

  setup() {
    const app = useAppStore();

    const session = ref<ServiceSession | null>(null);
    const messages = ref<ServiceMessage[]>([]);
    const lastId = ref(0);
    /** 会话是否已经建好：区分「还没打开」和「打开了但没有消息」，后者不能摆假数据 */
    const opened = ref(false);
    const booting = ref(false);
    const error = ref('');

    const draft = ref('');
    const sending = ref(false);

    const orderId = ref(0);
    const order = ref<CustomerOrder | null>(null);
    const recent = ref<CustomerOrder[]>([]);
    /** 下一条消息要带的订单：进页面或换单时置上，发完即清（首条带单号就够客服定位了） */
    const pendingOrderId = ref(0);
    const sheet = ref('');
    const scrollInto = ref('');

    let timer: number | null = null;
    let polling = false;

    /** 会话按「顾客 × 商户」唯一，没进过店时连 merchantId 都没有，只能引导去选门店 */
    const merchantId = computed(() => app.store?.merchantId ?? getLastMerchantId());
    const storeId = computed(() => app.store?.id ?? 0);
    const canChat = computed(() => merchantId.value > 0);

    function appendRows(rows: ServiceMessage[]): void {
      const seen = new Set(messages.value.map((item) => item.id));
      const fresh = rows.filter((item) => !seen.has(item.id));
      if (!fresh.length) return;
      // 发送与轮询可能同时拿到同一条：按 id 去重后重排，保证顺序只由服务端游标决定
      messages.value = [...messages.value, ...fresh].sort((a, b) => a.id - b.id);
      lastId.value = messages.value[messages.value.length - 1].id;
      void nextTick(() => {
        scrollInto.value = 'flow-end';
      });
    }

    async function pull(): Promise<void> {
      const current = session.value;
      // 上一条还没回就不叠加请求：弱网下 4 秒一发会把同一批消息拉回来好几次
      if (!current || polling) return;
      polling = true;
      try {
        const res = await pollServiceMessages(current.id, lastId.value);
        // afterId=0 时后端返回整条会话历史，首屏「已发未回」的消息就是靠这一次补回来的
        appendRows(res.messages);
        session.value = res.session;
      } catch {
        // 轮询失败静默：4 秒后自然会再来一次，弹 toast 只会把顾客吓跑
      } finally {
        polling = false;
      }
    }

    async function loadOrder(): Promise<void> {
      if (!orderId.value) {
        order.value = null;
        return;
      }
      try {
        order.value = await fetchCustomerOrder(orderId.value);
      } catch {
        // 单子取不到（不属于本人 / 已清）就不显示上下文卡，聊天本身不受影响
        order.value = null;
      }
    }

    async function boot(): Promise<void> {
      if (session.value || booting.value) return;
      if (!canChat.value) {
        opened.value = true;
        return;
      }
      booting.value = true;
      error.value = '';
      try {
        // 客服接口要顾客令牌，冷启动直达这一页时令牌还没生成
        await ensureSession();
        session.value = await openServiceSession(merchantId.value, storeId.value || undefined);
        await pull();
      } catch (cause) {
        error.value = (cause as Error).message || '会话没有打开';
      } finally {
        booting.value = false;
        opened.value = true;
      }
    }

    function startPolling(): void {
      if (timer !== null || !session.value) return;
      timer = setInterval(() => void pull(), POLL_INTERVAL);
    }

    function stopPolling(): void {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    }

    async function send(): Promise<void> {
      const content = draft.value.trim();
      if (!content || sending.value || !session.value || !canChat.value) return;
      sending.value = true;
      try {
        const row = await sendServiceMessage({
          merchantId: merchantId.value,
          content,
          orderId: pendingOrderId.value || undefined,
          storeId: storeId.value || undefined,
        });
        pendingOrderId.value = 0;
        draft.value = '';
        appendRows([row]);
        // 立刻拉一次：新会话的历史要靠这次回填，等下一个 4 秒会让人以为没发出去
        await pull();
      } catch {
        // 「超长」「令牌失效」等原文由请求层 toast，输入框内容留着让顾客改
      } finally {
        sending.value = false;
      }
    }

    function fillQuick(text: string): void {
      draft.value = text.slice(0, CONTENT_MAX);
    }

    async function openSwitch(): Promise<void> {
      sheet.value = 'switch';
      try {
        const res = await fetchOrders({ page: 1, pageSize: 5 });
        recent.value = res.list;
      } catch {
        recent.value = [];
      }
    }

    async function pickOrder(row: CustomerOrder): Promise<void> {
      orderId.value = row.id;
      pendingOrderId.value = row.id;
      order.value = row;
      sheet.value = '';
      await loadOrder();
    }

    function goStores(): void {
      uni.navigateTo({ url: '/pages/stores/stores' });
    }

    return {
      app,
      CONTENT_MAX,
      QUICK_ASKS,
      session,
      messages,
      opened,
      booting,
      error,
      draft,
      sending,
      orderId,
      order,
      recent,
      pendingOrderId,
      sheet,
      scrollInto,
      merchantId,
      storeId,
      canChat,
      boot,
      pull,
      loadOrder,
      startPolling,
      stopPolling,
      send,
      fillQuick,
      openSwitch,
      pickOrder,
      goStores,
      clock,
      dayClock,
      yuan,
    };
  },

  onLoad(query) {
    void this.app.loadConfig();
    // 订单详情 / 订单列表的客服入口会把 orderId 带过来，会话本身仍按商户归并
    const id = Number(query?.orderId ?? 0);
    if (id > 0) {
      this.orderId = id;
      this.pendingOrderId = id;
      void this.loadOrder();
    } else {
      this.orderId = 0;
    }
  },

  async onShow() {
    await this.boot();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },
});
</script>

<template>
  <view class="chat" :style="app.cssVars">
    <!-- 门店没选时不硬撑：会话是「顾客 × 商户」的，连 merchantId 都没有就如实说明 -->
    <view v-if="opened && !canChat" class="gate">
      <text class="gate__title">还没有可咨询的门店</text>
      <text class="gate__line">客服是按商户接待的，先选一家门店再回来发消息。</text>
      <view class="btn-main gate__btn" @click="goStores">去门店页</view>
    </view>

    <template v-else>
      <view v-if="order" class="card ctx">
        <view class="ctx__head">
          <text class="ctx__label">正在咨询的订单</text>
          <text class="ctx__switch" @click="openSwitch">换个订单</text>
        </view>
        <view class="ctx__main">
          <text class="ctx__no num">{{ order.orderNo }}</text>
          <text class="ctx__money num">¥{{ yuan(order.payableAmount) }}</text>
        </view>
        <view class="ctx__foot">
          <text class="ctx__store">{{ order.storeName }}</text>
          <text class="ctx__status">{{ order.statusLabel }}</text>
          <text class="ctx__time num">{{ dayClock(order.createdAt) }}</text>
        </view>
      </view>

      <view v-else-if="canChat && !orderId" class="ctxbar">
        <text class="ctxbar__text">问题涉及某一单时，带上订单会更快被定位</text>
        <text class="ctxbar__link" @click="openSwitch">选一笔</text>
      </view>

      <!-- 工单式客服的真实说明：写「秒回」就是对顾客假承诺 -->
      <view class="notice">
        <LineIcon name="service" :size="14" tone="sub" />
        <text class="notice__text">
          消息会送到门店后台，由客服看到后回复，不是即时聊天；打烊后通常等到次日营业才有人处理。
        </text>
      </view>

      <scroll-view class="flow" scroll-y :scroll-into-view="scrollInto" scroll-with-animation>
        <view v-if="error" class="flow__tip">
          <text>{{ error }}</text>
          <text class="flow__retry" @click="boot">重试</text>
        </view>
        <view v-else-if="!session" class="flow__tip">正在打开会话…</view>

        <view v-else-if="!messages.length" class="flow__tip">
          <text class="flow__empty">这条会话还没有消息</text>
          <text class="flow__sub">用下面的输入框或快捷提问，把问题说清楚一点会更省事。</text>
        </view>

        <view
          v-for="item in messages"
          :id="`m-${item.id}`"
          :key="item.id"
          class="msg"
          :class="item.sender === 'customer' ? 'msg--me' : 'msg--staff'"
        >
          <view class="msg__bubble" :class="item.sender === 'customer' ? 'msg__bubble--me' : 'msg__bubble--staff'">
            <text v-if="item.sender === 'staff'" class="msg__name">{{ item.senderName }} · 客服</text>
            <text class="msg__text">{{ item.content }}</text>
            <text v-if="item.orderNo" class="msg__order num">关联订单 {{ item.orderNo }}</text>
            <text class="msg__time num" :class="{ 'msg__time--me': item.sender === 'customer' }">
              {{ clock(item.createdAt) }}
            </text>
          </view>
        </view>

        <view id="flow-end" class="flow__end" />
      </scroll-view>

      <view class="composer">
        <scroll-view class="composer__quick" scroll-x>
          <view class="quick">
            <view v-for="text in QUICK_ASKS" :key="text" class="chip quick__item" @click="fillQuick(text)">
              <text>{{ text }}</text>
            </view>
          </view>
        </scroll-view>

        <view class="bar">
          <textarea
            v-model="draft"
            class="bar__input"
            :maxlength="CONTENT_MAX"
            placeholder="描述你的问题…"
            placeholder-class="bar__ph"
            :auto-height="true"
            confirm-type="send"
          />
          <view
            class="bar__send"
            :class="{ 'is-off': !draft.trim() || sending || !session }"
            @click="send"
          >
            <text>{{ sending ? '发送中' : '发送' }}</text>
          </view>
        </view>
        <text v-if="draft.length >= CONTENT_MAX" class="bar__count num">
          {{ draft.length }}/{{ CONTENT_MAX }}
        </text>
      </view>
    </template>

    <view v-if="sheet" class="sheet-mask" @click="sheet = ''">
      <view class="sheet" @click.stop>
        <view class="sheet__handle" />
        <view class="sheet__head">
          <text class="sheet__title">换个订单</text>
          <text class="sheet__sub">最近 5 单</text>
        </view>
        <scroll-view class="sheet__body" scroll-y>
          <view v-for="row in recent" :key="row.id" class="prow" @click="pickOrder(row)">
            <view class="prow__main">
              <view class="prow__line">
                <text class="prow__store">{{ row.storeName }}</text>
                <text class="prow__status">{{ row.statusLabel }}</text>
              </view>
              <text class="prow__no num">{{ row.orderNo }} · {{ dayClock(row.createdAt) }}</text>
            </view>
            <text class="prow__money num">¥{{ yuan(row.payableAmount) }}</text>
            <LineIcon name="right" :size="16" tone="sub" />
          </view>
          <view v-if="!recent.length" class="prow prow--empty">
            <text class="prow__tip">还没有订单记录</text>
          </view>
        </scroll-view>
        <view class="sheet__foot">
          <view class="btn-ghost" @click="sheet = ''">先不选</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 聊天是内容型页面：消息流不套卡片，气泡自己就是形状（ui.md 第 17 节） */
.chat {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--page-bg);
  color: var(--ink);
}

.gate {
  flex: 1;
  padding: 160rpx var(--content-pad, 28rpx) 0;
  text-align: center;

  &__title {
    display: block;
    font-size: 34rpx;
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

.ctx {
  flex: none;
  box-sizing: border-box;
  margin: 16rpx var(--content-pad, 28rpx) 0;
  padding: 22rpx 26rpx;
}

.ctx__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ctx__label {
  font-size: 22rpx;
  color: var(--ink-2);
}

.ctx__switch {
  font-size: 24rpx;
  color: var(--brand);
}

.ctx__main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 12rpx;
}

.ctx__no {
  font-size: 26rpx;
  font-weight: 600;
}

.ctx__money {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--brand);
}

.ctx__foot {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: var(--ink-2);
}

.ctxbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx var(--content-pad, 28rpx) 0;

  &__text {
    font-size: 22rpx;
    color: var(--ink-2);
  }

  &__link {
    flex: none;
    font-size: 24rpx;
    color: var(--brand);
  }
}

.notice {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 16rpx var(--content-pad, 28rpx);

  &__text {
    flex: 1;
    min-width: 0;
    font-size: 20rpx;
    line-height: 1.6;
    color: var(--ink-2);
  }
}

.flow {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  width: 100%;
  padding: 8rpx var(--content-pad, 28rpx) 24rpx;

  &__tip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14rpx;
    padding: 100rpx 40rpx;
    text-align: center;
    font-size: 24rpx;
    color: var(--ink-2);
  }

  &__empty {
    font-size: 30rpx;
    font-weight: 700;
    color: var(--ink);
  }

  &__sub {
    font-size: 22rpx;
    line-height: 1.6;
  }

  &__retry {
    font-size: 24rpx;
    color: var(--brand);
  }

  &__end {
    height: 2rpx;
  }
}

.msg {
  display: flex;
  margin-bottom: 22rpx;

  &--me {
    justify-content: flex-end;
  }

  &--staff {
    justify-content: flex-start;
  }

  &__bubble {
    box-sizing: border-box;
    max-width: 78%;
    padding: 18rpx 24rpx;
    border-radius: var(--radius);
  }

  /* 顾客侧主色实底白字，客服侧白卡：两端一眼能分清谁说的 */
  &__bubble--me {
    background-color: var(--brand);
    color: #fff;
    border-bottom-right-radius: 8rpx;
  }

  &__bubble--staff {
    background-color: var(--card-bg);
    backdrop-filter: blur(20px);
    color: var(--ink);
    border-bottom-left-radius: 8rpx;
  }

  &__name {
    display: block;
    margin-bottom: 8rpx;
    font-size: 20rpx;
    color: var(--ink-2);
  }

  &__text {
    display: block;
    font-size: 28rpx;
    line-height: 1.6;
    word-break: break-all;
  }

  &__order {
    display: block;
    margin-top: 10rpx;
    padding-top: 10rpx;
    border-top: 1rpx solid rgba(255, 255, 255, 0.3);
    font-size: 20rpx;
    opacity: 0.85;
  }

  &__time {
    display: block;
    margin-top: 8rpx;
    font-size: 20rpx;
    color: var(--ink-2);
  }

  &__time--me {
    color: #fff;
    opacity: 0.75;
  }
}

/* 固定底栏：content-box 会把 padding 加在 100% 外面，H5 下右侧按钮会被裁掉 */
.composer {
  flex: none;
  box-sizing: border-box;
  width: 100%;
  padding: 12rpx var(--content-pad, 28rpx) calc(16rpx + env(safe-area-inset-bottom));
  background-color: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px);
  border-top: 1rpx solid var(--divider);
}

.quick {
  display: flex;
  gap: 12rpx;
  padding: 6rpx 0 14rpx;
  white-space: nowrap;

  &__item {
    flex: none;
    font-size: 22rpx;
  }
}

.composer__quick {
  box-sizing: border-box;
  width: 100%;
  white-space: nowrap;
}

.bar {
  display: flex;
  align-items: flex-end;
  gap: 16rpx;

  &__input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    max-height: 180rpx;
    min-height: 72rpx;
    padding: 14rpx 22rpx;
    border-radius: var(--radius);
    background-color: var(--chip-bg);
    font-size: 28rpx;
    line-height: 1.6;
  }

  &__ph {
    color: var(--ink-2);
  }

  &__send {
    flex: none;
    box-sizing: border-box;
    height: 72rpx;
    line-height: 72rpx;
    padding: 0 34rpx;
    border-radius: 999rpx;
    background-color: var(--brand);
    color: #fff;
    font-size: 26rpx;
    font-weight: 600;

    &.is-off {
      background-color: var(--divider);
      color: var(--ink-2);
    }
  }

  &__count {
    display: block;
    margin-top: 8rpx;
    text-align: right;
    font-size: 20rpx;
    color: var(--ink-2);
  }
}

.sheet__sub {
  font-size: 22rpx;
  color: var(--ink-2);
}

.prow {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--divider);

  &--empty {
    justify-content: center;
    border-bottom: none;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__line {
    display: flex;
    align-items: baseline;
    gap: 12rpx;
  }

  &__store {
    font-size: 28rpx;
    font-weight: 600;
  }

  &__status {
    font-size: 20rpx;
    color: var(--ink-2);
  }

  &__no {
    display: block;
    margin-top: 6rpx;
    font-size: 22rpx;
    color: var(--ink-2);
  }

  &__money {
    flex: none;
    font-size: 28rpx;
    font-weight: 700;
    color: var(--brand);
  }

  &__tip {
    font-size: 24rpx;
    color: var(--ink-2);
  }
}
</style>
