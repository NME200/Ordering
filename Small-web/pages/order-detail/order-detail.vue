<script lang="ts">
import { defineComponent, computed, onUnmounted, ref } from 'vue';
import { cancelOrder, fetchOrder } from '@/api/public';
import { cancelMyOrder, fetchCustomerOrder } from '@/api/customer';
import { useAppStore } from '@/store/app';
import { useOrderStore, type OrderRef } from '@/store/order';
import { ErrorCode } from '@/types/error-codes';
import { Status, isLive, timeline } from '@/types/order-status';
import { dayClock, yuan } from '@/utils/format';
import { DINING_TYPE_LABEL } from '@/store/app';
import LineIcon from '@/components/LineIcon.vue';
import type { PublicOrder } from '@/types/api';
import type { CustomerOrder } from '@/types/customer';

/** 查单接口 10 次/分，轮询间隔必须 >= 6 秒；这里取 8 秒留余量 */
const POLL_MS = 8000;

/**
 * 本页统一吃的订单形状。
 *
 * `addressSnapshot` 只有账号归属那条路给：公开查单接口刻意不回手机号相关字段
 * （拿到 orderNo + payToken 就能读收货人手机号，等于把地址暴露给任何enumerable 的票据持有者）。
 */
interface DetailOrder extends PublicOrder {
  addressSnapshot: string | null;
}

/**
 * 服务端「我的订单」行 → 本页用的订单结构。
 *
 * 详情有两种来源：本机有 payToken 的走公开双因子接口，换设备 / 清过缓存的走
 * `GET /customer/orders/:id`（按账号归属）。两条路都要能喂给同一个版式，
 * 所以在这里补齐公开接口独有的字段（出餐时间）。
 */
function toDetail(order: CustomerOrder): DetailOrder {
  return {
    orderNo: order.orderNo,
    storeName: order.storeName,
    status: order.status as PublicOrder['status'],
    statusLabel: order.statusLabel,
    tableNo: order.tableNo,
    pickupCode: order.pickupCode,
    diningType: order.diningType,
    diningTypeLabel: DINING_TYPE_LABEL[
      (['dineIn', 'pickup', 'delivery'] as const)[order.diningType] ?? 'dineIn'
    ],
    itemCount: order.itemCount,
    totalAmount: order.totalAmount,
    discountAmount: order.discountAmount,
    payableAmount: order.payableAmount,
    paidAmount: order.paidAmount,
    paidChannelLabel: order.paidChannelLabel,
    remark: order.remark,
    cancelReason: order.cancelReason,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    readyAt: null,
    completedAt: order.completedAt,
    addressSnapshot: order.addressSnapshot,
    items: order.items.map((item) => ({
      dishName: item.dishName,
      specSummary: item.specSummary,
      dishImageUrl: item.dishImageUrl,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
  };
}

/**
 * 自提单的取餐码，非自提返回空串。
 *
 * 取餐码上线之前下的老订单这一列是 NULL，界面要能退回「报订单号」而不是显示空白。
 */
function pickupOf(row: DetailOrder): string {
  return row.diningType === 1 ? row.pickupCode ?? '' : '';
}

export default defineComponent({
  components: { LineIcon },

  setup() {
    const app = useAppStore();
    const orders = useOrderStore();

    const target = ref<OrderRef | null>(null);
    /** > 0 表示走「按账号归属」的读路径（本机没有 payToken 时唯一可行的路） */
    const ownerId = ref(0);
    const canReview = ref(false);
    const order = ref<DetailOrder | null>(null);
    const errorText = ref('');
    const retryIn = ref(0);
    /** 订单进度面板：状态由既有的 8 秒轮询推进，面板开着就是实时的 */
    const flowOpen = ref(false);
    let poll: ReturnType<typeof setInterval> | null = null;
    let backoff: ReturnType<typeof setInterval> | null = null;

    const steps = computed(() => (order.value ? timeline(order.value) : []));
    const canCancel = computed(() => order.value?.status === Status.PENDING);
    const canPay = computed(() => order.value?.status === Status.PENDING);
    /** 客服会话要按订单定位商户，而订单 ID 只有归属读路径给得出 */
    const canService = computed(() => ownerId.value > 0);
    /** 进度从「已支付」起才有内容：待付款后面全是没发生的步骤，已取消不走这条流程 */
    const hasFlow = computed(() => {
      const status = order.value?.status;
      return !!status && status !== Status.PENDING && status !== Status.CANCELLED;
    });
    /** 还在流程中的单：面板要说明「会自动刷新」，走完的单只说结论 */
    const isRunning = computed(() => !!order.value && isLive(order.value.status));
    const statusTone = computed(() => {
      const status = order.value?.status ?? 0;
      if (status === Status.CANCELLED) return 'muted';
      if (status === Status.COMPLETED) return 'done';
      return 'live';
    });

    /** 状态区那句灰字：只说后端真的能保证的事（没有超时任务，所以不编倒计时） */
    const statusHint = computed(() => {
      const row = order.value;
      if (!row) return '';
      if (row.status === Status.PENDING) return '还没有支付。付完商家才会收到这一单，未支付随时可以取消。';
      if (row.status === Status.PAID) return '款项已收到，正在等商家接单。';
      if (row.status === Status.PREPARING) return '商家已接单，正在准备。';
      if (row.status === Status.READY) {
        if (row.diningType !== 1) return '已出餐，店员会送到你的桌。';
        const code = pickupOf(row);
        return code ? `已出餐，到店报取餐码 ${code} 即可。` : '已出餐，请到门店取餐，报订单号即可。';
      }
      if (row.status === Status.COMPLETED) {
        return canReview.value ? '已完成。这一单可以评价。' : '已完成。';
      }
      return '这一单已取消，用掉的优惠券已退回。';
    });

    /** 收货 / 取餐 / 就餐三选一，标题跟着就餐方式走 */
    const placeTitle = computed(() => {
      const type = order.value?.diningType ?? 0;
      return type === 2 ? '收货信息' : type === 1 ? '取餐信息' : '就餐信息';
    });

    const placeMain = computed(() => {
      const row = order.value;
      if (!row) return '';
      if (row.diningType === 2) return row.addressSnapshot || '这单没有留下收货信息，可联系门店补充';
      if (row.diningType === 1) return `${row.storeName} · 到店自提`;
      return row.tableNo ? `堂食 · ${row.tableNo} 桌` : '堂食 · 桌号还没填';
    });

    const placeSub = computed(() => {
      const row = order.value;
      if (!row) return '';
      if (row.diningType === 2) return '配送由门店自行安排，送达时间可直接问门店。';
      if (row.diningType === 1) {
        const code = pickupOf(row);
        return code ? `做好后你来拿，报取餐码 ${code} 就行。` : `做好后你来拿，报订单号 ${row.orderNo}。`;
      }
      return row.tableNo ? '做好后店员送到桌。' : '回点餐页的桌位卡补填桌号。';
    });

    /** 取餐码只在自提单的那一行右侧出现；老订单没这个字段就不显示，不空占一位 */
    const pickupCode = computed(() => (order.value ? pickupOf(order.value) : ''));

    /** 待付款显示「应付」，付过才显示「实付」 */
    const dueLabel = computed(() => (order.value?.paidAmount === null || order.value?.paidAmount === undefined ? '应付' : '实付'));

    function stop(): void {
      if (poll) clearInterval(poll);
      if (backoff) clearInterval(backoff);
      poll = null;
      backoff = null;
    }

    async function load(silent = false): Promise<void> {
      if (ownerId.value) {
        try {
          const result = await fetchCustomerOrder(ownerId.value);
          canReview.value = result.canReview;
          order.value = toDetail(result);
          errorText.value = '';
          if (!isLive(result.status)) stop();
          else if (!poll) poll = setInterval(() => void load(true), POLL_MS);
        } catch (error) {
          if (!silent) errorText.value = (error as Error).message;
        }
        return;
      }

      const ref_ = target.value;
      if (!ref_) return;
      try {
        const result = await fetchOrder(ref_.orderNo, ref_.payToken);
        order.value = { ...result, addressSnapshot: null };
        errorText.value = '';
        // 回填列表缓存，订单 Tab 才能显示最近一次已知状态
        orders.updateStatus(result.orderNo, result.status, result.statusLabel);
        if (!isLive(result.status)) stop();
        else if (!poll) poll = setInterval(() => void load(true), POLL_MS);
      } catch (error) {
        const code = (error as { code?: number }).code ?? 0;
        if (code === ErrorCode.TOO_MANY_REQUESTS) {
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

    /**
     * 进页面的两条路：
     * `id` 来自服务端列表（按账号归属，不需要 payToken）；
     * `orderNo` 来自本机缓存（用 orderNo + payToken 双因子）。
     * 两个都没有时回订单列表而不是停在空白页。
     */
    async function boot(query: { orderNo?: string; id?: string }): Promise<void> {
      const id = Number(query?.id ?? 0);
      if (id > 0) {
        ownerId.value = id;
        await load();
        return;
      }

      const orderNo = query?.orderNo ?? '';
      const found = orderNo ? orders.find(orderNo) : orders.current;
      if (!found) {
        uni.switchTab({ url: '/pages/orders/orders' });
        return;
      }
      target.value = found;
      await load();
    }

    function pay(): void {
      if (!order.value) return;
      uni.navigateTo({
        url: `/pages/pay/pay?${ownerId.value ? `id=${ownerId.value}` : `orderNo=${order.value.orderNo}`}`,
      });
    }

    function review(): void {
      if (!order.value) return;
      uni.navigateTo({ url: `/pages/review/review?orderId=${ownerId.value}` });
    }

    function service(): void {
      uni.navigateTo({ url: `/pages/service/service?orderId=${ownerId.value}` });
    }

    function cancel(): void {
      const ref_ = target.value;
      if (ownerId.value) {
        uni.showModal({
          title: '取消订单',
          content: '取消后需要重新点单，确定吗？用掉的优惠券会退回来。',
          confirmText: '确认取消',
          confirmColor: '#c0453c',
          success: async (res) => {
            if (!res.confirm) return;
            try {
              const result = await cancelMyOrder(ownerId.value);
              order.value = toDetail(result);
              canReview.value = false;
              uni.showToast({ title: '订单已取消', icon: 'none' });
            } catch (error) {
              errorText.value = (error as Error).message;
            }
          },
        });
        return;
      }
      if (!ref_) return;
      uni.showModal({
        title: '取消订单',
        content: '取消后需要重新点单，确定吗？',
        confirmText: '确认取消',
        confirmColor: '#c0453c',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            const result = await cancelOrder(ref_.orderNo, ref_.payToken);
            order.value = { ...result, addressSnapshot: null };
            orders.updateStatus(result.orderNo, result.status, result.statusLabel);
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

    function goOrders(): void {
      uni.switchTab({ url: '/pages/orders/orders' });
    }

    /** 打开进度面板时先补一次查询：面板要一进去就是最新的，而不是上个页面的残留 */
    function openFlow(): void {
      flowOpen.value = true;
      void load(true);
    }

    onUnmounted(stop);

    return {
      app,
      order,
      steps,
      hasFlow,
      flowOpen,
      isRunning,
      canCancel,
      canPay,
      canReview,
      canService,
      statusTone,
      statusHint,
      placeTitle,
      placeMain,
      placeSub,
      pickupCode,
      dueLabel,
      errorText,
      retryIn,
      boot,
      load,
      pay,
      review,
      service,
      cancel,
      copyNo,
      goOrders,
      openFlow,
      dayClock,
      yuan,
    };
  },

  onLoad(query) {
    void this.boot((query ?? {}) as { orderNo?: string; id?: string });
  },

  onShow() {
    // 从收银台或评价页回来时刷新一次，状态才不会停在离开前的样子
    if (this.order) void this.load(true);
  },

  onUnload() {
    this.order = null;
    this.flowOpen = false;
  },
});
</script>

<template>
  <view class="detail" :style="app.cssVars">
    <block v-if="order">
      <!-- 状态区：大字状态 + 一句真话；右上角是设计稿 §8 的客服入口 -->
      <view class="state">
        <view class="state__top">
          <text class="state__label" :class="`is-${statusTone}`">{{ order.statusLabel }}</text>
          <view v-if="canService" class="state__service" @click="service">
            <LineIcon name="service" :size="15" tone="sub" />
            <text class="state__serviceText">客服</text>
          </view>
        </view>
        <text class="state__hint">{{ statusHint }}</text>
        <view v-if="canPay" class="state__due">
          <text class="state__dueLabel">待支付</text>
          <text class="state__dueValue num">¥{{ yuan(order.payableAmount) }}</text>
          <text class="state__dueGo" @click="pay">去支付 ›</text>
        </view>
      </view>

      <!-- 进度不再常驻页面：状态由底部「实时状态」面板承载，面板跟着 8 秒轮询走 -->
      <view class="sec">
        <view class="sec__head">
          <text class="sec__title">{{ placeTitle }}</text>
          <!-- 自提单把取餐码顶在这一行的右端：柜台前喊的是它，不是 14 位订单号 -->
          <view v-if="pickupCode" class="pickup">
            <text class="pickup__label">取餐码</text>
            <text class="pickup__code num">{{ pickupCode }}</text>
          </view>
        </view>
        <text class="sec__main">{{ placeMain }}</text>
        <text class="sec__sub">{{ placeSub }}</text>
      </view>

      <view class="sec">
        <view class="store">
          <text class="store__name">{{ order.storeName }}</text>
          <text class="store__meta">{{ order.diningTypeLabel }} · {{ order.itemCount }} 件</text>
        </view>
        <view v-for="(item, index) in order.items" :key="index" class="line">
          <image v-if="item.dishImageUrl" class="line__img" :src="item.dishImageUrl" mode="aspectFill" />
          <view v-else class="line__img line__img--text">
            <text>{{ item.dishName.slice(0, 1) }}</text>
          </view>
          <view class="line__main">
            <text class="line__name">{{ item.dishName }}</text>
            <text v-if="item.specSummary" class="line__spec">{{ item.specSummary }}</text>
          </view>
          <text class="line__qty num">×{{ item.quantity }}</text>
          <text class="line__money num">¥{{ yuan(item.subtotal) }}</text>
        </view>

        <!-- 商品小计 / 优惠 / 实付三行；后端没有配送费与包装费模型，那两行不摆 -->
        <view class="fees">
          <view class="fee">
            <text class="fee__label">商品小计</text>
            <text class="fee__value num">¥{{ yuan(order.totalAmount) }}</text>
          </view>
          <view v-if="order.discountAmount" class="fee">
            <text class="fee__label">优惠券抵扣</text>
            <text class="fee__value num">-¥{{ yuan(order.discountAmount) }}</text>
          </view>
          <view class="fee fee--due">
            <text class="fee__label">{{ dueLabel }}</text>
            <text class="fee__value num">¥{{ yuan(order.payableAmount) }}</text>
          </view>
          <view v-if="order.paidAmount !== null && order.paidAmount !== order.payableAmount" class="fee">
            <text class="fee__label">实收</text>
            <text class="fee__value num">¥{{ yuan(order.paidAmount) }}</text>
          </view>
        </view>
      </view>

      <view class="sec">
        <text class="sec__title">订单信息</text>
        <view class="meta">
          <view class="meta__i">
            <text class="meta__k">订单编号</text>
            <text class="meta__v num" @click="copyNo">{{ order.orderNo }} 复制</text>
          </view>
          <view class="meta__i">
            <text class="meta__k">下单时间</text>
            <text class="meta__v num">{{ dayClock(order.createdAt) }}</text>
          </view>
          <view v-if="order.paidAt" class="meta__i">
            <text class="meta__k">支付时间</text>
            <text class="meta__v num">{{ dayClock(order.paidAt) }}</text>
          </view>
          <view class="meta__i">
            <text class="meta__k">支付方式</text>
            <text class="meta__v">{{ order.paidChannelLabel || '未支付' }}</text>
          </view>
          <view v-if="order.remark" class="meta__i">
            <text class="meta__k">备注</text>
            <text class="meta__v">{{ order.remark }}</text>
          </view>
          <view v-if="order.cancelReason" class="meta__i">
            <text class="meta__k">取消原因</text>
            <text class="meta__v">{{ order.cancelReason }}</text>
          </view>
        </view>
      </view>

      <text v-if="errorText" class="error">
        {{ errorText }}<text v-if="retryIn > 0" class="error__sub num">（{{ retryIn }} 秒后自动重试）</text>
      </text>

      <view class="bar">
        <text class="bar__link" @click="goOrders">全部订单</text>
        <view v-if="hasFlow" class="bar__ghost" @click="openFlow">实时状态</view>
        <view v-if="canCancel" class="bar__ghost" @click="cancel">取消订单</view>
        <view v-if="canPay" class="bar__main" @click="pay">立即支付</view>
        <view v-if="canReview" class="bar__ghost" @click="service">找客服</view>
        <view v-if="canReview" class="bar__main" @click="review">去评价</view>
      </view>

      <!-- 实时状态面板：内容就是那条进度时间轴，面板开着时随 8 秒轮询一起刷新 -->
      <view v-if="flowOpen" class="mask" @click="flowOpen = false">
        <view class="panel" @click.stop>
          <view class="panel__head">
            <text class="panel__title">订单进度</text>
            <text class="panel__status" :class="`is-${statusTone}`">{{ order.statusLabel }}</text>
            <text class="panel__close" @click="flowOpen = false">×</text>
          </view>
          <view class="panel__body">
            <view class="flow">
              <view
                v-for="(step, index) in steps"
                :key="step.label"
                class="flow__i"
                :class="{ 'is-done': step.done }"
              >
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
            <text class="panel__note">
              {{ isRunning ? '状态每 8 秒自动查一次，不用退出重进。' : '这一单已经走完，不会再变了。' }}
            </text>
          </view>
        </view>
      </view>
    </block>
  </view>
</template>

<style scoped lang="scss">
/* 内容型页面（ui.md 第 8 节）：分区只用细分割线，不画卡片 */
.detail {
  min-height: 100vh;
  padding: 8rpx var(--content-pad, 28rpx) 220rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.state {
  padding: 36rpx 0 32rpx;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__label {
    font-size: 48rpx;
    font-weight: 700;
    letter-spacing: -1rpx;

    &.is-live {
      color: var(--brand, #c8752b);
    }

    &.is-done {
      color: $ok;
    }

    &.is-muted {
      color: var(--ink-2, #{$n-400});
    }
  }

  &__service {
    display: flex;
    align-items: center;
    gap: 8rpx;
    padding: 10rpx 22rpx;
    border-radius: 999rpx;
    background-color: rgba(255, 255, 255, 0.72);
    border: 1rpx solid var(--divider, #{$n-200});
  }

  &__serviceText {
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__hint {
    display: block;
    margin-top: 12rpx;
    font-size: 24rpx;
    line-height: 1.7;
    color: var(--ink-2, #{$n-500});
  }

  /* 待付款时把金额与入口直接给到状态区，省一次滚动到底部 */
  &__due {
    display: flex;
    align-items: baseline;
    gap: 14rpx;
    margin-top: 24rpx;
  }

  &__dueLabel {
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__dueValue {
    font-size: 44rpx;
    font-weight: 700;
    color: var(--brand, #c8752b);
  }

  &__dueGo {
    margin-left: auto;
    font-size: 26rpx;
    color: var(--brand, #c8752b);
  }
}

/* 进度时间轴只在底部面板里出现，不再参与页面分区，所以不带分割线 */
.flow {
  padding: 8rpx 0 0;

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
    width: 14rpx;
    height: 14rpx;
    border-radius: 50%;
    background-color: var(--divider, #{$n-200});
    flex: none;
  }

  &__line {
    flex: 1;
    width: 1rpx;
    background-color: var(--divider, #{$n-200});
    margin: 6rpx 0;
  }

  &__body {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex: 1;
    min-width: 0;
    padding: 6rpx 0 26rpx;
  }

  &__label {
    font-size: 26rpx;
    color: var(--ink-2, #{$n-400});
  }

  &__time {
    font-size: 22rpx;
    color: var(--ink-2, #{$n-400});
  }

  &__i.is-done &__dot {
    background-color: var(--brand, #c8752b);
  }

  &__i.is-done &__label {
    color: var(--ink, #{$n-900});
    font-weight: 600;
  }
}

.sec {
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16rpx;
    margin-bottom: 12rpx;
  }

  &__title {
    display: block;
    font-size: 26rpx;
    font-weight: 700;
    color: var(--ink-2, #{$n-500});
  }

  &__main {
    display: block;
    font-size: 28rpx;
    line-height: 1.6;
    font-weight: 600;
  }

  &__sub {
    display: block;
    margin-top: 6rpx;
    font-size: 22rpx;
    line-height: 1.6;
    color: var(--ink-2, #{$n-400});
  }
}

/* 取餐码是顾客在柜台前唯一要念的东西，给到全页最大的字号 */
.pickup {
  display: flex;
  align-items: baseline;
  gap: 10rpx;

  &__label {
    font-size: 20rpx;
    color: var(--ink-2, #{$n-400});
  }

  &__code {
    font-size: 44rpx;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 2rpx;
    color: var(--brand, #{$brand});
  }
}

.store {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 16rpx;

  &__name {
    font-size: 30rpx;
    font-weight: 700;
  }

  &__meta {
    font-size: 22rpx;
    color: var(--ink-2, #{$n-500});
  }
}

.line {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  /* 菜品图是下单时的快照：菜单换图或下架都不该让历史订单的图变样 */
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

  /* 明细行自带下划线，费用块不再补第二条，否则交界处会出现双线 */
  & + .fees {
    border-top: none;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: block;
    font-size: 28rpx;
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
    width: 150rpx;
    text-align: right;
    font-size: 28rpx;
    font-weight: 600;
  }
}

.fees {
  padding-top: 20rpx;
  border-top: 1rpx solid var(--divider, #{$n-200});
}

.fee {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 28rpx;

  &__label {
    color: var(--ink-2, #{$n-500});
  }

  &--due {
    padding-top: 14rpx;

    .fee__label {
      color: var(--ink, #{$n-900});
      font-weight: 700;
    }

    .fee__value {
      font-size: 34rpx;
      font-weight: 700;
      color: var(--brand, #c8752b);
    }
  }
}

.meta {
  &__i {
    display: flex;
    align-items: baseline;
    gap: 24rpx;
    padding: 14rpx 0;
  }

  &__k {
    flex: none;
    width: 150rpx;
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__v {
    flex: 1;
    min-width: 0;
    font-size: 26rpx;
    line-height: 1.6;
    word-break: break-all;
  }
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

  &__sub {
    color: var(--ink-2, #{$n-400});
  }
}

/*
 * 底部操作栏：必须 border-box + 100%，H5 下默认 content-box 会把按钮挤出屏幕。
 * 按钮右对齐、左边留「全部订单」，比整行等宽更接近设计稿 §8 的那条 footer。
 */
.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx var(--content-pad, 28rpx) calc(20rpx + env(safe-area-inset-bottom));
  background-color: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  border-top: 1rpx solid var(--divider, #{$n-200});

  &__link {
    flex: 1;
    min-width: 0;
    font-size: 26rpx;
    color: var(--ink-2, #{$n-500});
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__ghost {
    flex: none;
    box-sizing: border-box;
    height: 76rpx;
    line-height: 74rpx;
    padding: 0 34rpx;
    border: 1rpx solid var(--divider, #{$n-300});
    border-radius: 38rpx;
    font-size: 28rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__main {
    flex: none;
    box-sizing: border-box;
    height: 76rpx;
    line-height: 76rpx;
    padding: 0 40rpx;
    border-radius: 38rpx;
    background-color: var(--brand, #c8752b);
    color: #fff;
    font-size: 28rpx;
    font-weight: 600;
  }
}

/* 实时状态面板：压在底部操作栏之上（z-index 60 > bar 20） */
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  background-color: rgba(58, 50, 44, 0.42);
}

.panel {
  /* H5 下默认 content-box，padding 会把面板整块挤出屏幕，必须 border-box + 100% */
  box-sizing: border-box;
  width: 100%;
  max-height: 72vh;
  padding-bottom: env(safe-area-inset-bottom);
  border-radius: 24px 24px 0 0;
  background-color: #fff;

  &__head {
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 30rpx var(--content-pad, 28rpx);
    border-bottom: 1rpx solid var(--divider, #{$n-200});
  }

  &__title {
    font-size: 30rpx;
    font-weight: 700;
  }

  &__status {
    font-size: 26rpx;

    &.is-live {
      color: var(--brand, #c8752b);
    }

    &.is-done {
      color: $ok;
    }

    &.is-muted {
      color: var(--ink-2, #{$n-400});
    }
  }

  &__close {
    margin-left: auto;
    font-size: 40rpx;
    line-height: 1;
    color: var(--ink-2, #{$n-400});
  }

  &__body {
    padding: 12rpx var(--content-pad, 28rpx) 40rpx;
  }

  &__note {
    display: block;
    margin-top: 8rpx;
    font-size: 22rpx;
    line-height: 1.6;
    color: var(--ink-2, #{$n-400});
  }
}
</style>
