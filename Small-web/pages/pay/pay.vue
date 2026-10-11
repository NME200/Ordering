<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { cancelOrder, createPayment, fetchOrder, fetchPaymentChannels, mockChannelPay } from '@/api/public';
import { cancelMyOrder, fetchCustomerOrder, payMyOrder } from '@/api/customer';
import { DINING_TYPE_LABEL, useAppStore } from '@/store/app';
import { useOrderStore, type OrderRef } from '@/store/order';
import { Status } from '@/types/order-status';
import { splitYuan, yuan } from '@/utils/format';
import type { OrderItem, PublicOrder } from '@/types/api';
import type { CustomerOrder, CustomerOrderItem } from '@/types/customer';

const DINING_BY_VALUE: Record<number, string> = {
  0: DINING_TYPE_LABEL.dineIn,
  1: DINING_TYPE_LABEL.pickup,
  2: DINING_TYPE_LABEL.delivery,
};

/**
 * 收银台上的一行菜品。
 *
 * 两条读路径的明细字段名不一样（公开接口没有菜品图，账号接口有），
 * 先归一成一个形状，模板里就不用写 `isOwner ? ... : ...`。
 */
interface PayLine {
  key: string;
  dishName: string;
  specSummary: string;
  imageUrl: string | null;
  quantity: number;
  subtotal: number;
}

/**
 * 收银台要付的那一单。
 *
 * `payToken` 可能为空 —— 换设备或清过缓存的顾客手里没有这张一次性票据，
 * 但订单是登录账号下的，所以走 `POST /customer/orders/:id/pay` 按归属发起支付。
 * 没有它就不能把「付不了」误报成「订单不存在」。
 *
 * `detailed` 表示明细与费用已经从服务端取到了。取不到时只画得准「应付」
 * （下单响应给过这个数），明细与优惠就整块不摆 —— 猜出来的钱不能给顾客看。
 */
interface PayTarget {
  orderId: number;
  orderNo: string;
  storeName: string;
  diningType: number;
  payToken: string | null;
  totalAmount: number;
  discountAmount: number;
  payableAmount: number;
  lines: PayLine[];
  detailed: boolean;
}

function publicLines(items: OrderItem[]): PayLine[] {
  return items.map((item, index) => ({
    key: String(index),
    dishName: item.dishName,
    specSummary: item.specSummary,
    imageUrl: item.dishImageUrl,
    quantity: item.quantity,
    subtotal: item.subtotal,
  }));
}

function ownerLines(items: CustomerOrderItem[]): PayLine[] {
  return items.map((item, index) => ({
    key: String(index),
    dishName: item.dishName,
    specSummary: item.specSummary,
    imageUrl: item.dishImageUrl,
    quantity: item.quantity,
    subtotal: item.subtotal,
  }));
}

function fromOwner(order: CustomerOrder): PayTarget {
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    storeName: order.storeName,
    diningType: order.diningType,
    payToken: null,
    totalAmount: order.totalAmount,
    discountAmount: order.discountAmount,
    payableAmount: order.payableAmount,
    lines: ownerLines(order.items),
    detailed: true,
  };
}

/** 公开查单不给订单 ID，而发起支付要它，所以从本机缓存那一条补 */
function fromPublic(order: PublicOrder, row: OrderRef): PayTarget {
  return {
    orderId: row.orderId,
    orderNo: order.orderNo,
    storeName: order.storeName,
    diningType: order.diningType,
    payToken: row.payToken,
    totalAmount: order.totalAmount,
    discountAmount: order.discountAmount,
    payableAmount: order.payableAmount,
    lines: publicLines(order.items),
    detailed: true,
  };
}

function fromLocal(row: OrderRef): PayTarget {
  return {
    orderId: row.orderId,
    orderNo: row.orderNo,
    storeName: row.storeName,
    diningType: row.diningType,
    payToken: row.payToken,
    totalAmount: 0,
    discountAmount: 0,
    payableAmount: row.payableAmount,
    lines: [],
    detailed: false,
  };
}

export default defineComponent({
  setup() {
    const app = useAppStore();
    const orders = useOrderStore();

    const target = ref<PayTarget | null>(null);
    const channels = ref<{ channel: string; label: string }[]>([]);
    const chosen = ref('');
    const paying = ref(false);
    const errorText = ref('');
    const statusTip = ref('');

    const amount = computed(() => splitYuan(target.value?.payableAmount ?? 0));
    const pieceCount = computed(() => (target.value?.lines ?? []).reduce((sum, line) => sum + line.quantity, 0));
    /** 只有 mock 渠道在后端真的能走完回调，其余渠道要等真实商户号接入 */
    const isMock = computed(() => chosen.value === 'mock');
    const diningLabel = computed(() => DINING_BY_VALUE[target.value?.diningType ?? 0] ?? '');

    /** 回到订单详情：本机有票据走 orderNo，没有票据走账号归属的 id */
    function backToDetail(query: { orderNo: string; id: number; payToken: string | null }): void {
      uni.redirectTo({ url: `/pages/order-detail/order-detail?${query.payToken ? `orderNo=${query.orderNo}` : `id=${query.id}`}` });
    }

    async function boot(query: { orderNo?: string; id?: string }): Promise<void> {
      const id = Number(query?.id ?? 0);
      if (id > 0) {
        try {
          const order = await fetchCustomerOrder(id);
          if (order.status !== Status.PENDING) {
            // 已经付过或被取消的单不该停在收银台，直接看结果
            backToDetail({ orderNo: order.orderNo, id: order.id, payToken: null });
            return;
          }
          target.value = fromOwner(order);
        } catch {
          uni.switchTab({ url: '/pages/orders/orders' });
          return;
        }
      } else {
        const orderNo = query?.orderNo ?? '';
        const found = orderNo ? orders.find(orderNo) : orders.current;
        if (!found) {
          uni.switchTab({ url: '/pages/home/home' });
          return;
        }
        target.value = fromLocal(found);
        try {
          const order = await fetchOrder(found.orderNo, found.payToken);
          if (order.status !== Status.PENDING) {
            backToDetail({ orderNo: order.orderNo, id: found.orderId, payToken: found.payToken });
            return;
          }
          target.value = fromPublic(order, found);
        } catch {
          // 明细拉不到就沿用本机缓存的应付，收款本身仍可进行
        }
      }

      const list = await fetchPaymentChannels().catch(() => []);
      channels.value = list.filter((item) => item.online).map((item) => ({ channel: item.channel, label: item.label }));
      chosen.value = channels.value[0]?.channel ?? '';
    }

    /** 支付结果由后端回调推进，前端只能轮询确认；查单 10 次/分，所以最多探 6 次 */
    async function waitPaid(order: PayTarget): Promise<void> {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const result = order.payToken
          ? await fetchOrder(order.orderNo, order.payToken).catch(() => null)
          : await fetchCustomerOrder(order.orderId)
              .then((row) => ({ status: row.status }))
              .catch(() => null);
        if (result && result.status !== Status.PENDING) return;
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
      statusTip.value = '支付结果确认中，稍后可在订单里查看';
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
        const prepay = order.payToken
          ? await createPayment(order.orderId, order.payToken, chosen.value)
          : await payMyOrder(order.orderId, chosen.value);
        const paymentNo = (prepay as { paymentNo?: string }).paymentNo;
        if (paymentNo) await mockChannelPay(paymentNo, chosen.value);
        await waitPaid(order);
        backToDetail({ orderNo: order.orderNo, id: order.orderId, payToken: order.payToken });
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
        content: '取消后需要重新点单，确定吗？用掉的优惠券会退回来。',
        confirmText: '确认取消',
        confirmColor: '#c0453c',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            if (order.payToken) {
              await cancelOrder(order.orderNo, order.payToken);
              orders.updateStatus(order.orderNo, Status.CANCELLED, '已取消');
            } else {
              await cancelMyOrder(order.orderId);
            }
            backToDetail({ orderNo: order.orderNo, id: order.orderId, payToken: order.payToken });
          } catch (error) {
            errorText.value = (error as Error).message;
          }
        },
      });
    }

    return {
      app,
      target,
      channels,
      chosen,
      paying,
      errorText,
      statusTip,
      amount,
      pieceCount,
      isMock,
      diningLabel,
      pay,
      cancel,
      boot,
      yuan,
    };
  },

  onLoad(query) {
    void this.boot((query ?? {}) as { orderNo?: string; id?: string });
  },
});
</script>

<template>
  <view class="pay" :style="app.cssVars">
    <block v-if="target">
      <!-- 状态区：待付款 + 大字金额。后端没有超时任务，所以不摆倒计时 -->
      <view class="state">
        <view class="state__top">
          <text class="state__badge">待支付</text>
          <text class="state__store">{{ target.storeName }} · {{ diningLabel }}</text>
        </view>
        <view class="state__amount">
          <text class="state__cny num">¥</text>
          <text class="state__int num">{{ amount.int }}</text>
          <text class="state__dec num">{{ amount.dec }}</text>
        </view>
        <text class="state__hint">付完商家立刻收到这一单；未支付可以随时取消，用掉的优惠券会退回来。</text>
      </view>

      <view v-if="target.detailed" class="lines">
        <view v-for="line in target.lines" :key="line.key" class="line">
          <image v-if="line.imageUrl" class="line__img" :src="line.imageUrl" mode="aspectFill" />
          <view v-else class="line__img line__img--text">
            <text>{{ line.dishName.slice(0, 1) }}</text>
          </view>
          <view class="line__main">
            <text class="line__name">{{ line.dishName }}</text>
            <text class="line__spec">{{ line.specSummary || '份' }}</text>
          </view>
          <text class="line__qty num">×{{ line.quantity }}</text>
          <text class="line__money num">¥{{ yuan(line.subtotal) }}</text>
        </view>
      </view>

      <!-- 费用明细只有小计与优惠：后端没有配送费、包装费模型，算不出来的数不摆 -->
      <view class="fees">
        <view v-if="target.detailed" class="fee">
          <text class="fee__label">商品小计<text class="fee__sub">（{{ pieceCount }} 件）</text></text>
          <text class="fee__value num">¥{{ yuan(target.totalAmount) }}</text>
        </view>
        <view v-if="target.detailed && target.discountAmount" class="fee">
          <text class="fee__label">优惠券抵扣</text>
          <text class="fee__value num">-¥{{ yuan(target.discountAmount) }}</text>
        </view>
        <view class="fee fee--due">
          <text class="fee__label">应付</text>
          <text class="fee__value num">¥{{ yuan(target.payableAmount) }}</text>
        </view>
        <text v-if="!target.detailed" class="fees__note">
          这一单的明细没有取到，金额按下单时服务端返回的应付显示。
        </text>
      </view>

      <view class="section">
        <text class="section__title">支付方式</text>
        <view v-if="!channels.length" class="section__empty">当前没有可用支付渠道，请到前台付款</view>
        <view
          v-for="item in channels"
          :key="item.channel"
          class="channel"
          :class="{ 'is-on': item.channel === chosen }"
          @click="chosen = item.channel"
        >
          <view class="channel__radio" :class="{ 'is-on': item.channel === chosen }" />
          <text class="channel__label">{{ item.label }}</text>
          <text v-if="item.channel === 'mock'" class="channel__tag">联调渠道</text>
          <text v-else class="channel__tag is-warn">暂未接入</text>
        </view>
      </view>

      <text v-if="statusTip" class="tip">{{ statusTip }}</text>
      <text v-if="errorText" class="error">{{ errorText }}</text>

      <view class="bar">
        <view class="bar__sum">
          <text class="bar__label">合计</text>
          <text class="bar__amount num">¥{{ yuan(target.payableAmount) }}</text>
        </view>
        <view class="bar__cancel" @click="cancel">取消</view>
        <view class="bar__pay" :class="{ 'is-off': paying || !chosen }" @click="pay">
          {{ paying ? '支付中…' : '确认支付' }}
        </view>
      </view>
    </block>
  </view>
</template>

<style scoped lang="scss">
/* 内容型页面（ui.md 全局规则）：不画卡片，分区只靠极细分割线 */
.pay {
  min-height: 100vh;
  padding: 8rpx var(--content-pad, 28rpx) 240rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.state {
  padding: 40rpx 0 36rpx;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__top {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }

  &__badge {
    flex: none;
    padding: 6rpx 18rpx;
    border-radius: 999rpx;
    background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
    font-size: 22rpx;
    font-weight: 600;
    color: var(--brand, #c8752b);
  }

  &__store {
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__amount {
    display: flex;
    align-items: baseline;
    gap: 4rpx;
    margin-top: 24rpx;
  }

  &__cny {
    font-size: 36rpx;
    font-weight: 700;
  }

  &__int {
    font-size: 92rpx;
    font-weight: 700;
    letter-spacing: -2rpx;
  }

  &__dec {
    font-size: 40rpx;
    font-weight: 700;
  }

  &__hint {
    display: block;
    margin-top: 12rpx;
    font-size: 22rpx;
    line-height: 1.7;
    color: var(--ink-2, #{$n-400});
  }
}

.lines {
  padding: 8rpx 0;
}

.line {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__img {
    width: 88rpx;
    height: 88rpx;
    flex: none;
    border-radius: var(--radius-tile, 12px);
    background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));

    &--text {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 34rpx;
      color: var(--brand, #c8752b);
    }
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: block;
    font-size: 28rpx;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__spec {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__qty {
    flex: none;
    width: 64rpx;
    text-align: right;
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__money {
    flex: none;
    width: 140rpx;
    text-align: right;
    font-size: 28rpx;
    font-weight: 600;
  }
}

.fees {
  padding: 20rpx 0 8rpx;
  border-bottom: 1rpx solid var(--divider, #{$n-200});
}

.fee {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10rpx 0;
  font-size: 28rpx;

  &__label {
    color: var(--ink-2, #{$n-500});
  }

  &__sub {
    font-size: 22rpx;
    color: var(--ink-2, #{$n-400});
  }

  /* 应付是这一页唯一要顾客做决定的数，加粗并用主色 */
  &--due {
    padding-top: 18rpx;

    .fee__label {
      color: var(--ink, #{$n-900});
      font-weight: 600;
    }

    .fee__value {
      font-size: 34rpx;
      font-weight: 700;
      color: var(--brand, #c8752b);
    }
  }
}

.fees__note {
  display: block;
  padding: 8rpx 0 12rpx;
  font-size: 20rpx;
  line-height: 1.6;
  color: var(--ink-2, #{$n-400});
}

.section {
  padding-top: 8rpx;

  &__title {
    display: block;
    padding: 24rpx 0 4rpx;
    font-size: 28rpx;
    font-weight: 700;
  }

  &__empty {
    padding: 28rpx 0;
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }
}

.channel {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__radio {
    width: 32rpx;
    height: 32rpx;
    border: 2rpx solid $n-300;
    border-radius: 50%;
    flex: none;

    &.is-on {
      border-color: var(--brand, #c8752b);
      background-color: var(--brand, #c8752b);
      box-shadow: inset 0 0 0 5rpx #fff;
    }
  }

  &__label {
    flex: 1;
    min-width: 0;
    font-size: 28rpx;
  }

  &__tag {
    flex: none;
    font-size: 20rpx;
    color: var(--brand, #c8752b);

    &.is-warn {
      color: var(--ink-2, #{$n-400});
    }
  }
}

.tip {
  display: block;
  margin-top: 24rpx;
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}

.error {
  display: block;
  margin-top: 20rpx;
  padding: 20rpx 24rpx;
  border-radius: var(--radius-tile, 12px);
  background-color: rgba(192, 69, 60, 0.08);
  font-size: 26rpx;
  line-height: 1.6;
  color: $err;
}

.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  /* H5 下默认 content-box，padding 会把整条栏挤出屏幕，必须 border-box + 100% */
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx var(--content-pad, 28rpx) calc(20rpx + env(safe-area-inset-bottom));
  background-color: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  border-top: 1rpx solid var(--divider, #{$n-200});

  &__sum {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 10rpx;
  }

  &__label {
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__amount {
    font-size: 42rpx;
    font-weight: 700;
    color: var(--brand, #c8752b);
  }

  &__cancel {
    flex: none;
    box-sizing: border-box;
    height: 80rpx;
    line-height: 78rpx;
    padding: 0 36rpx;
    border: 1rpx solid var(--divider, #{$n-300});
    border-radius: 40rpx;
    font-size: 28rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__pay {
    flex: none;
    box-sizing: border-box;
    height: 80rpx;
    line-height: 80rpx;
    padding: 0 56rpx;
    border-radius: 40rpx;
    background-color: var(--brand, #c8752b);
    color: #fff;
    font-size: 30rpx;
    font-weight: 600;

    &.is-off {
      background-color: var(--divider, #{$n-200});
      color: var(--ink-2, #{$n-400});
    }
  }
}
</style>
