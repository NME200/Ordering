<script lang="ts">
import { defineComponent, computed, onUnmounted, ref } from 'vue';
import { cancelOrder, fetchOrder } from '@/api/public';
import { useAppStore } from '@/store/app';
import { useOrderStore, type OrderRef } from '@/store/order';
import { ErrorCode } from '@/types/error-codes';
import { Status, isLive, timeline } from '@/types/order-status';
import { clock, dayClock, yuan } from '@/utils/format';
import type { PublicOrder } from '@/types/api';

/** 查单接口限流 10 次 / 分，轮询间隔必须 >= 6 秒；这里取 8 秒留余量 */
const POLL_MS = 8000;

export default defineComponent({
  setup() {
    const app = useAppStore();
    const orders = useOrderStore();

    const target = ref<OrderRef | null>(null);
    const order = ref<PublicOrder | null>(null);
    const errorText = ref('');
    const retryIn = ref(0);
    let poll: ReturnType<typeof setInterval> | null = null;
    let backoff: ReturnType<typeof setInterval> | null = null;

    const steps = computed(() => (order.value ? timeline(order.value) : []));
    const canCancel = computed(() => order.value?.status === Status.PENDING);
    const statusTone = computed(() => {
      const status = order.value?.status ?? 0;
      if (status === Status.CANCELLED) return 'muted';
      if (status === Status.COMPLETED) return 'done';
      return 'live';
    });

    function stop(): void {
      if (poll) clearInterval(poll);
      if (backoff) clearInterval(backoff);
      poll = null;
      backoff = null;
    }

    async function load(silent = false): Promise<void> {
      const ref_ = target.value;
      if (!ref_) return;
      try {
        const result = await fetchOrder(ref_.orderNo, ref_.payToken);
        order.value = result;
        errorText.value = '';
        if (!isLive(result.status)) stop();
        else if (!poll) poll = setInterval(() => void load(true), POLL_MS);
      } catch (error) {
        const code = (error as { code?: number }).code ?? 0;
        if (code === ErrorCode.TOO_MANY_REQUESTS) {
          // 被限流就彻底停手并倒计时，继续重试只会把窗口一直占满
          stop();
          errorText.value = '请求太频繁，已暂停刷新';
          startBackoff();
        } else if (code === ErrorCode.ORDER_NOT_FOUND) {
          errorText.value = '查不到这一单：订单号或支付凭据不对，请从下单页面重新进入';
          stop();
        } else if (!silent) {
          errorText.value = (error as Error).message;
        }
      }
    }

    function startBackoff(): void {
      retryIn.value = 30;
      if (backoff) clearInterval(backoff);
      backoff = setInterval(() => {
        retryIn.value -= 1;
        if (retryIn.value <= 0) {
          if (backoff) clearInterval(backoff);
          backoff = null;
          errorText.value = '';
          void load();
        }
      }, 1000);
    }

    async function boot(orderNo: string): Promise<void> {
      const found = orderNo ? orders.find(orderNo) : orders.current;
      if (!found) {
        uni.redirectTo({ url: '/pages/index/index' });
        return;
      }
      target.value = found;
      await load();
    }

    function cancel(): void {
      const ref_ = target.value;
      if (!ref_) return;
      uni.showModal({
        title: '取消订单',
        content: '取消后需要重新点单，确定吗？',
        confirmText: '确认取消',
        confirmColor: '#c0453c',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            order.value = await cancelOrder(ref_.orderNo, ref_.payToken);
            uni.showToast({ title: '订单已取消', icon: 'none' });
          } catch (error) {
            errorText.value = (error as Error).message;
          }
        },
      });
    }

    function copyNo(): void {
      if (!order.value) return;
      uni.setClipboardData({ data: order.value.orderNo });
    }

    onUnmounted(stop);

    return {
      app,
      order,
      steps,
      canCancel,
      statusTone,
      errorText,
      retryIn,
      boot,
      load,
      cancel,
      copyNo,
      clock,
      dayClock,
      yuan,
    };
  },

  onLoad(query) {
    void this.boot(query?.orderNo ?? '');
  },

  onUnload() {
    this.order = null;
  },
});
</script>

<template>
  <view class="detail" :style="app.cssVars">
    <view class="head" :class="`head--${statusTone}`">
      <text class="head__status">{{ order?.statusLabel || '加载中' }}</text>
      <text class="head__sub">
        {{ order ? `${order.storeName} · ${order.itemCount} 件` : '' }}
      </text>
    </view>

    <view v-if="order" class="flow">
      <view v-for="(step, index) in steps" :key="step.label" class="flow__i" :class="{ 'is-done': step.done }">
        <view class="flow__rail">
          <view class="flow__dot" />
          <view v-if="index < steps.length - 1" class="flow__line" />
        </view>
        <view class="flow__body">
          <text class="flow__label">{{ step.label }}</text>
          <text class="flow__time num">{{ step.time ? dayClock(step.time) : '—' }}</text>
        </view>
      </view>
    </view>

    <view class="gap" />

    <view v-if="order">
      <view class="rows">
        <view v-for="(item, index) in order.items" :key="index" class="row">
          <view class="row__main">
            <text class="row__name">{{ item.dishName }}</text>
            <text v-if="item.specSummary" class="row__spec">{{ item.specSummary }}</text>
          </view>
          <text class="row__qty num">×{{ item.quantity }}</text>
          <text class="row__money num">¥{{ yuan(item.subtotal) }}</text>
        </view>
        <view class="row row--total">
          <text class="row__name">实付</text>
          <text class="row__money num">¥{{ yuan(order.payableAmount) }}</text>
        </view>
      </view>

      <view class="gap" />

      <view class="meta">
        <view class="meta__i">
          <text class="meta__k">订单号</text>
          <text class="meta__v num" @click="copyNo">{{ order.orderNo }} 复制</text>
        </view>
        <view v-if="order.tableNo" class="meta__i">
          <text class="meta__k">桌号</text>
          <text class="meta__v">{{ order.tableNo }}</text>
        </view>
        <view v-if="order.remark" class="meta__i">
          <text class="meta__k">备注</text>
          <text class="meta__v">{{ order.remark }}</text>
        </view>
        <view class="meta__i">
          <text class="meta__k">下单时间</text>
          <text class="meta__v num">{{ dayClock(order.createdAt) }}</text>
        </view>
        <view v-if="order.paidAt" class="meta__i">
          <text class="meta__k">支付时间</text>
          <text class="meta__v num">{{ clock(order.paidAt) }}</text>
        </view>
        <view v-if="order.cancelReason" class="meta__i">
          <text class="meta__k">取消原因</text>
          <text class="meta__v">{{ order.cancelReason }}</text>
        </view>
      </view>

      <text v-if="canCancel" class="foot__note">未支付，可随时取消</text>
    </view>

    <text v-if="errorText" class="error">
      {{ errorText }}<text v-if="retryIn > 0" class="error__sub num">（{{ retryIn }} 秒后自动重试）</text>
    </text>

    <view v-if="canCancel" class="foot">
      <view class="foot__btn" @click="cancel">取消订单</view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.detail {
  min-height: 100vh;
  padding-bottom: 200rpx;
  background-color: var(--page-bg, #fff);
  color: var(--ink, #{$n-900});
}

.head {
  padding: 40rpx 32rpx 32rpx;

  &__status {
    display: block;
    font-size: 44rpx;
    font-weight: 700;
    letter-spacing: -1rpx;
  }

  &__sub {
    display: block;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &--live &__status {
    color: var(--brand, #{$brand-500});
  }

  &--done &__status {
    color: $ok;
  }

  &--muted &__status {
    color: $n-400;
  }
}

.flow {
  padding: 8rpx 32rpx 24rpx;

  &__i {
    display: flex;
    gap: 20rpx;
  }

  &__rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 24rpx;
    flex: none;
    padding-top: 14rpx;
  }

  &__dot {
    width: 12rpx;
    height: 12rpx;
    border-radius: 50%;
    background-color: $n-200;
    flex: none;
  }

  &__line {
    flex: 1;
    width: 1rpx;
    background-color: $hair;
    margin: 6rpx 0;
  }

  &__body {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 6rpx 0 26rpx;
    flex: 1;
  }

  &__label {
    font-size: 26rpx;
    color: $n-400;
  }

  &__time {
    font-size: 22rpx;
    color: $n-300;
  }

  &__i.is-done &__dot {
    background-color: var(--brand, #{$brand-500});
  }

  &__i.is-done &__label {
    color: var(--ink, #{$n-900});
  }
}

.rows {
  padding: 0 32rpx;
}

.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid $hair;

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: block;
    font-size: 26rpx;
  }

  &__spec {
    display: block;
    margin-top: 4rpx;
    font-size: 20rpx;
    color: $n-400;
  }

  &__qty {
    flex: none;
    width: 72rpx;
    text-align: right;
    font-size: 24rpx;
    color: $n-500;
  }

  &__money {
    flex: none;
    width: 150rpx;
    text-align: right;
    font-size: 26rpx;
  }

  &--total {
    border-bottom: 0;
    padding: 26rpx 0;

    .row__name {
      font-weight: 600;
    }

    .row__money {
      font-size: 30rpx;
      font-weight: 700;
      color: var(--brand, #{$brand-500});
    }
  }
}

.meta {
  padding: 0 32rpx;

  &__i {
    display: flex;
    align-items: baseline;
    gap: 24rpx;
    padding: 20rpx 0;
    border-bottom: 1rpx solid $hair;
  }

  &__k {
    flex: none;
    width: 140rpx;
    font-size: 24rpx;
    color: $n-500;
  }

  &__v {
    flex: 1;
    font-size: 26rpx;
  }
}

.error {
  display: block;
  margin: 24rpx 32rpx 0;
  font-size: 24rpx;
  line-height: 1.6;
  color: $err;

  &__sub {
    color: $n-400;
  }
}

.foot {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 32rpx calc(28rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid $hair;
  background-color: #fff;

  &__note {
    display: block;
    margin: 24rpx 32rpx 0;
    font-size: 22rpx;
    color: $n-400;
  }

  &__btn {
    height: 88rpx;
    line-height: 88rpx;
    text-align: center;
    border: 1rpx solid $n-200;
    border-radius: 999rpx;
    font-size: 28rpx;
    color: $n-600;
  }
}
</style>
