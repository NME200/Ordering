<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { cancelOrder, createPayment, fetchOrder, fetchPaymentChannels, mockChannelPay } from '@/api/public';
import { useAppStore } from '@/store/app';
import { useOrderStore, type OrderRef } from '@/store/order';
import { Status } from '@/types/order-status';
import { splitYuan, yuan } from '@/utils/format';

export default defineComponent({
  setup() {
    const app = useAppStore();
    const orders = useOrderStore();

    const target = ref<OrderRef | null>(null);
    const channels = ref<{ channel: string; label: string }[]>([]);
    const chosen = ref('');
    const paying = ref(false);
    const errorText = ref('');
    const statusTip = ref('');

    const amount = computed(() => splitYuan(target.value?.payableAmount ?? 0));
    /** 只有 mock 渠道在后端真的能走完回调，其余渠道要等真实商户号接入 */
    const isMock = computed(() => chosen.value === 'mock');

    async function boot(orderNo: string): Promise<void> {
      const found = orderNo ? orders.find(orderNo) : orders.current;
      if (!found) {
        uni.redirectTo({ url: '/pages/index/index' });
        return;
      }
      target.value = found;
      const list = await fetchPaymentChannels().catch(() => []);
      channels.value = list.filter((item) => item.online).map((item) => ({ channel: item.channel, label: item.label }));
      chosen.value = channels.value[0]?.channel ?? '';
    }

    /** 支付结果由后端回调推进，前端只能轮询确认；限流 10 次/分，所以最多探 6 次 */
    async function waitPaid(order: OrderRef): Promise<void> {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const result = await fetchOrder(order.orderNo, order.payToken).catch(() => null);
        if (result && result.status !== Status.PENDING) return;
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
      statusTip.value = '支付结果确认中，稍后可在订单详情查看';
    }

    async function pay(): Promise<void> {
      const order = target.value;
      if (!order || paying.value || !chosen.value) return;
      if (!isMock.value) {
        errorText.value = '该渠道尚未接入小程序，请让店员在收银台为你收款';
        return;
      }
      paying.value = true;
      errorText.value = '';
      try {
        const prepay = await createPayment(order.orderId, order.payToken, chosen.value);
        await mockChannelPay(prepay.paymentNo, chosen.value);
        await waitPaid(order);
        uni.redirectTo({ url: `/pages/order/order?orderNo=${order.orderNo}` });
      } catch (error) {
        errorText.value = (error as Error).message || '支付没有走通，请重试或让店员收款';
      } finally {
        paying.value = false;
      }
    }

    function cancel(): void {
      const order = target.value;
      if (!order) return;
      uni.showModal({
        title: '取消订单',
        content: '取消后需要重新点单，确定吗？',
        confirmText: '确认取消',
        confirmColor: '#c0453c',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await cancelOrder(order.orderNo, order.payToken);
            uni.redirectTo({ url: `/pages/order/order?orderNo=${order.orderNo}` });
          } catch (error) {
            errorText.value = (error as Error).message;
          }
        },
      });
    }

    return { app, target, channels, chosen, paying, errorText, statusTip, amount, isMock, pay, cancel, boot, yuan };
  },

  onLoad(query) {
    void this.boot(query?.orderNo ?? '');
  },
});
</script>

<template>
  <view class="pay" :style="app.cssVars">
    <view class="hero">
      <text class="hero__label">{{ target?.orderNo ? `订单 ${target.orderNo}` : '收银台' }}</text>
      <view class="hero__amount">
        <text class="hero__cny">¥</text>
        <text class="hero__int num">{{ amount.int }}</text>
        <text class="hero__dec num">{{ amount.dec }}</text>
      </view>
      <text class="hero__hint">未支付，可随时取消；支付成功后商家即收到这一单</text>
    </view>

    <view class="gap" />

    <view class="channels">
      <text class="channels__title">支付方式</text>
      <view v-if="!channels.length" class="channels__empty">
        当前没有可用支付渠道，请到前台付款
      </view>
      <view
        v-for="item in channels"
        :key="item.channel"
        class="channel"
        :class="{ 'is-on': item.channel === chosen }"
        @click="chosen = item.channel"
      >
        <text class="channel__dot" />
        <text class="channel__label">{{ item.label }}</text>
        <text v-if="item.channel === 'mock'" class="channel__tag">联调渠道</text>
      </view>
    </view>

    <text v-if="statusTip" class="tip">{{ statusTip }}</text>
    <text v-if="errorText" class="error">{{ errorText }}</text>

    <view class="foot">
      <view class="foot__pay" :class="{ 'is-off': paying || !chosen }" @click="pay">
        {{ paying ? '支付中…' : `确认支付 ¥${yuan(target ? target.payableAmount : 0)}` }}
      </view>
      <text class="foot__cancel" @click="cancel">取消订单</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.pay {
  min-height: 100vh;
  padding-bottom: 260rpx;
  background-color: var(--page-bg, #fff);
  color: var(--ink, #{$n-900});
}

.hero {
  padding: 60rpx 32rpx 48rpx;
  text-align: center;

  &__label {
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__amount {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4rpx;
    margin-top: 24rpx;
    color: $n-900;
  }

  &__cny {
    font-size: 32rpx;
  }

  &__int {
    font-size: 96rpx;
    font-weight: 700;
    letter-spacing: -2rpx;
  }

  &__dec {
    font-size: 40rpx;
    font-weight: 600;
  }

  &__hint {
    display: block;
    margin-top: 20rpx;
    font-size: 22rpx;
    color: $n-400;
  }
}

.channels {
  padding: 8rpx 32rpx 0;

  &__title {
    display: block;
    padding: 24rpx 0 4rpx;
    font-size: 26rpx;
    font-weight: 600;
  }

  &__empty {
    padding: 32rpx 0;
    font-size: 24rpx;
    color: $n-400;
  }
}

.channel {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 28rpx 0;
  border-bottom: 1rpx solid $hair;

  &__dot {
    width: 28rpx;
    height: 28rpx;
    border: 2rpx solid $n-300;
    border-radius: 50%;
    flex: none;
  }

  &.is-on &__dot {
    border-color: var(--brand, #{$brand-500});
    background-color: var(--brand, #{$brand-500});
    box-shadow: inset 0 0 0 4rpx #fff;
  }

  &__label {
    flex: 1;
    font-size: 28rpx;
  }

  &__tag {
    font-size: 20rpx;
    color: $warn;
  }
}

.tip {
  display: block;
  margin: 24rpx 32rpx 0;
  font-size: 24rpx;
  color: $n-500;
}

.error {
  display: block;
  margin: 24rpx 32rpx 0;
  font-size: 24rpx;
  line-height: 1.6;
  color: $err;
}

.foot {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 32rpx calc(28rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid $hair;
  background-color: #fff;

  &__pay {
    height: 92rpx;
    line-height: 92rpx;
    text-align: center;
    border-radius: 999rpx;
    background-color: var(--brand, #{$brand-500});
    color: #fff;
    font-size: 30rpx;
    font-weight: 600;

    &.is-off {
      background-color: $n-200;
      color: $n-400;
    }
  }

  &__cancel {
    display: block;
    margin-top: 20rpx;
    text-align: center;
    font-size: 26rpx;
    color: $n-400;
  }
}
</style>
