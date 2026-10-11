<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { cancelOrder, fetchOrder } from '@/api/public';
import { cancelMyOrder, ensureSession, fetchOrders } from '@/api/customer';
import { useAppStore } from '@/store/app';
import { useCustomerStore } from '@/store/customer';
import { useOrderStore } from '@/store/order';
import { Status } from '@/types/order-status';
import { takeOrdersBucket } from '@/utils/nav';
import { dayClock, yuan } from '@/utils/format';
import type { CustomerOrder, OrderBucket } from '@/types/customer';

/** 页签与「我的」页四桶同一口径 —— 两处数字对不上，角标点进去就会是空的 */
type TabKey = 'all' | OrderBucket;

const TABS: { key: TabKey; text: string }[] = [
  { key: 'all', text: '全部' },
  { key: 'unpaid', text: '待付款' },
  { key: 'processing', text: '待使用' },
  { key: 'review', text: '待评价' },
  { key: 'refund', text: '退款售后' },
];

/** 列表行：服务端行与本机兜底行都归一到这个形状，模板只写一遍 */
interface Row {
  key: string;
  id: number;
  orderNo: string;
  /** 取餐码：仅服务端给的自提单有，本机兜底行拿不到就留空 */
  pickupCode: string;
  storeName: string;
  statusLabel: string;
  tone: 'unpaid' | 'living' | 'done' | 'muted';
  amount: number;
  discount: number;
  preview: string;
  time: string;
  canPay: boolean;
  canCancel: boolean;
  canReview: boolean;
  fromServer: boolean;
}

function toneOf(status: number): Row['tone'] {
  if (status === Status.PENDING) return 'unpaid';
  if (status === Status.CANCELLED) return 'muted';
  if (status === Status.COMPLETED) return 'done';
  return 'living';
}

function fromServer(order: CustomerOrder): Row {
  const preview = order.items
    .slice(0, 2)
    .map((item) => `${item.dishName}×${item.quantity}`)
    .join('  ');
  return {
    key: `s${order.id}`,
    id: order.id,
    orderNo: order.orderNo,
    pickupCode: order.diningType === 1 ? order.pickupCode ?? '' : '',
    storeName: order.storeName,
    statusLabel: order.statusLabel,
    tone: toneOf(order.status),
    amount: order.payableAmount,
    discount: order.discountAmount,
    preview: order.items.length > 2 ? `${preview} 等 ${order.items.length} 项` : preview,
    time: dayClock(order.createdAt),
    canPay: order.status === Status.PENDING,
    canCancel: order.status === Status.PENDING,
    canReview: order.canReview,
    fromServer: true,
  };
}

/**
 * 订单列表（Tab 第二项）。
 *
 * 数据源是**服务端按账号归属的列表**：本机那份缓存最多留 10 条，换设备或清过数据就全没了，
 * 而「我的」页的四桶角标读的是服务端 —— 两边不是同一份数据时，角标显示 3 条点进去只有 1 条。
 *
 * 只有请求失败（离线）才退回本机缓存，并在页脚明说这是本机记录，
 * 不让人误以为看到的是全部历史。
 */
export default defineComponent({
  setup() {
    const app = useAppStore();
    const orders = useOrderStore();
    const customer = useCustomerStore();

    const tab = ref<TabKey>('all');
    const rows = ref<Row[]>([]);
    const total = ref(0);
    const loading = ref(false);
    const localOnly = ref(false);
    const page = ref(1);
    const PAGE_SIZE = 10;

    const badgeOf = computed(() => (key: TabKey) => (key === 'all' ? 0 : customer.buckets[key] ?? 0));

    /** 本机缓存只能按状态粗分，退款与待评价分不出来 —— 所以兜底是降级而不是等价替代 */
    function bucketOfLocal(status?: number): OrderBucket {
      if (status === undefined || status === Status.PENDING) return 'unpaid';
      if (status === Status.COMPLETED) return 'review';
      if (status === Status.CANCELLED) return 'refund';
      return 'processing';
    }

    function fromLocal(): Row[] {
      return orders.refs
        .filter((row) => tab.value === 'all' || bucketOfLocal(row.lastStatus) === tab.value)
        .map((row) => ({
          key: `l${row.orderNo}`,
          id: row.orderId,
          orderNo: row.orderNo,
          pickupCode: '',
          storeName: row.storeName,
          statusLabel: row.lastStatusLabel || '点击查看状态',
          tone: toneOf(row.lastStatus ?? Status.PENDING),
          amount: row.payableAmount,
          discount: 0,
          preview: '',
          time: dayClock(row.createdAt),
          canPay: row.lastStatus === undefined || row.lastStatus === Status.PENDING,
          canCancel: row.lastStatus === undefined || row.lastStatus === Status.PENDING,
          canReview: false,
          fromServer: false,
        }));
    }

    async function load(): Promise<void> {
      if (loading.value) return;
      loading.value = true;
      try {
        await ensureSession();
        const res = await fetchOrders({
          bucket: tab.value === 'all' ? undefined : tab.value,
          page: page.value,
          pageSize: PAGE_SIZE,
        });
        localOnly.value = false;
        rows.value = res.list.map(fromServer);
        total.value = res.total;
      } catch {
        localOnly.value = true;
        rows.value = fromLocal();
        total.value = rows.value.length;
      } finally {
        loading.value = false;
      }
    }

    /**
     * 兜底模式下拉刷新才逐条查单。
     *
     * 查单接口按 IP 限流 10 次/分，所以只刷最近 5 条，且正常路径上一次都不打它 ——
     * 服务端列表本身就是最新的。
     */
    async function refreshLocal(): Promise<void> {
      for (const row of orders.refs.slice(0, 5)) {
        try {
          const order = await fetchOrder(row.orderNo, row.payToken);
          orders.updateStatus(row.orderNo, order.status, order.statusLabel);
        } catch {
          // 单条失败不影响其他条，点开详情会再试
        }
      }
    }

    function switchTab(key: TabKey): void {
      if (tab.value === key) return;
      tab.value = key;
      page.value = 1;
      void load();
    }

    function more(): void {
      page.value += 1;
      void load();
    }

    /** 服务端行没有 payToken，走按账号归属的详情；本机行仍走 orderNo + 票据双因子 */
    function open(row: Row): void {
      const query = row.fromServer ? `id=${row.id}` : `orderNo=${row.orderNo}`;
      uni.navigateTo({ url: `/pages/order-detail/order-detail?${query}` });
    }

    function pay(row: Row): void {
      const query = row.fromServer ? `id=${row.id}` : `orderNo=${row.orderNo}`;
      uni.navigateTo({ url: `/pages/pay/pay?${query}` });
    }

    function review(row: Row): void {
      uni.navigateTo({ url: `/pages/review/review?orderId=${row.id}` });
    }

    function cancel(row: Row): void {
      uni.showModal({
        title: '取消订单',
        content: `确定取消 ${row.orderNo} 吗？用掉的优惠券会退回来。`,
        confirmText: '取消订单',
        confirmColor: '#c8752b',
        success: async (res) => {
          if (!res.confirm) return;
          if (!row.fromServer) {
            const ref_ = orders.refs.find((item) => item.orderNo === row.orderNo);
            if (!ref_) return;
            try {
              const order = await cancelOrder(ref_.orderNo, ref_.payToken);
              orders.updateStatus(ref_.orderNo, order.status, order.statusLabel);
              await load();
            } catch {
              // 失败原因由请求层 toast
            }
            return;
          }
          try {
            await cancelMyOrder(row.id);
            uni.showToast({ title: '已取消', icon: 'none' });
            await Promise.all([load(), customer.refreshBuckets()]);
          } catch {
            // 已支付的单会被后端拒（退款要走门店），文案由请求层透出
          }
        },
      });
    }

    function goStores(): void {
      uni.navigateTo({ url: '/pages/stores/stores' });
    }

    return {
      app,
      customer,
      tab,
      TABS,
      rows,
      total,
      loading,
      localOnly,
      badgeOf,
      load,
      refreshLocal,
      switchTab,
      more,
      open,
      pay,
      review,
      cancel,
      goStores,
      yuan,
    };
  },

  onShow() {
    const focus = takeOrdersBucket() as TabKey | '';
    if (focus && TABS.some((item) => item.key === focus)) this.tab = focus;
    void this.load();
    void this.customer.refreshBuckets();
  },

  onPullDownRefresh() {
    const tasks: Promise<unknown>[] = [this.load()];
    if (this.localOnly) tasks.push(this.refreshLocal());
    void Promise.all(tasks).finally(() => uni.stopPullDownRefresh());
  },
});
</script>

<template>
  <view class="orders" :style="app.cssVars">
    <view class="tabs">
      <view
        v-for="item in TABS"
        :key="item.key"
        class="tabs__item"
        :class="{ 'is-on': tab === item.key }"
        @click="switchTab(item.key)"
      >
        <text>{{ item.text }}</text>
        <text v-if="badgeOf(item.key) > 0" class="tabs__badge num">{{ badgeOf(item.key) }}</text>
      </view>
    </view>

    <view v-if="!rows.length" class="empty">
      <text class="empty__title">{{ tab === 'all' ? '还没有订单' : '这个状态下没有订单' }}</text>
      <text v-if="tab === 'all'" class="empty__line">点一单之后，这里会留下你在这个账号下的记录。</text>
      <view v-if="tab === 'all'" class="btn-main empty__btn" @click="goStores">查看门店</view>
    </view>

    <template v-else>
      <view v-for="row in rows" :key="row.key" class="item" @click="open(row)">
        <view class="item__head">
          <text class="item__store">{{ row.storeName }}</text>
          <text class="item__arrow">›</text>
          <text class="item__status" :class="`is-${row.tone}`">{{ row.statusLabel }}</text>
        </view>

        <text v-if="row.pickupCode" class="item__pickup num">取餐码 {{ row.pickupCode }}</text>

        <text v-if="row.preview" class="item__preview">{{ row.preview }}</text>

        <view class="item__body">
          <text class="item__no num">{{ row.orderNo }}</text>
          <view class="item__money">
            <text v-if="row.discount" class="item__discount num">已优惠 ¥{{ yuan(row.discount) }}</text>
            <text class="item__amount num">¥{{ yuan(row.amount) }}</text>
          </view>
        </view>

        <text class="item__time num">{{ row.time }}</text>

        <view v-if="row.canPay || row.canReview" class="item__actions">
          <text v-if="row.canCancel" class="btn-ghost item__btn" @click.stop="cancel(row)">取消订单</text>
          <text v-if="row.canReview" class="btn-ghost item__btn" @click.stop="review(row)">去评价</text>
          <text v-if="row.canPay" class="btn-main item__btn item__btn--pay" @click.stop="pay(row)">立即支付</text>
        </view>
      </view>

      <text v-if="rows.length < total" class="note" @click="more">
        还有 {{ total - rows.length }} 单，点这里继续看
      </text>
      <text v-else class="note">已全部加载完成</text>

      <text v-if="localOnly" class="tip">
        现在是本机记录：连不上服务器，只显示这台设备上留下的最近几单，换设备看不到。
      </text>
    </template>
  </view>
</template>

<style scoped lang="scss">
/* 内容型页面：条目铺在背景上，只用细分割线与间隙分区（ui.md 第 7 节） */
.orders {
  min-height: 100vh;
  padding-bottom: 60rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.tabs {
  display: flex;
  gap: 28rpx;
  padding: 24rpx var(--content-pad, 28rpx);
  background-color: rgba(255, 255, 255, 0.6);
  position: sticky;
  top: 0;
  z-index: 10;
  /* 五个页签在窄屏放不下，让它横向滚而不是挤成两行 */
  overflow-x: auto;
  white-space: nowrap;
}

.tabs__item {
  position: relative;
  flex: none;
  font-size: 28rpx;
  color: var(--ink-2, #{$n-500});
  padding-bottom: 10rpx;

  &.is-on {
    color: var(--ink, #{$n-900});
    font-weight: 700;
  }

  &.is-on::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 4rpx;
    border-radius: 999rpx;
    background-color: var(--brand, #c8752b);
  }
}

.tabs__badge {
  position: absolute;
  top: -10rpx;
  right: -24rpx;
  min-width: 28rpx;
  padding: 0 6rpx;
  border-radius: 999rpx;
  background-color: var(--brand, #c8752b);
  color: #fff;
  font-size: 18rpx;
  line-height: 28rpx;
  text-align: center;
}

.item {
  padding: 28rpx var(--content-pad, 28rpx);
  border-bottom: 1rpx solid var(--divider, #{$n-200});
}

.item__head {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.item__store {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item__arrow {
  font-size: 28rpx;
  color: var(--ink-2, #{$n-400});
}

/* 列表里也要看得见取餐码，不然顾客得点进详情才知道报哪个号 */
.item__pickup {
  display: inline-block;
  align-self: flex-start;
  margin-top: 10rpx;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
  font-size: 24rpx;
  font-weight: 700;
  color: var(--brand, #{$brand});
}

.item__status {
  flex: none;
  font-size: 26rpx;
  color: var(--ink-2, #{$n-500});

  &.is-unpaid,
  &.is-living {
    color: var(--brand, #c8752b);
    font-weight: 600;
  }

  &.is-done {
    color: $ok;
  }

  &.is-muted {
    color: var(--ink-2, #{$n-400});
  }
}

.item__preview {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--ink-2, #{$n-500});
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item__body {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 14rpx;
}

.item__no {
  font-size: 22rpx;
  color: var(--ink-2, #{$n-400});
}

.item__money {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.item__discount {
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.item__amount {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--brand, #c8752b);
}

.item__time {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.item__actions {
  display: flex;
  justify-content: flex-end;
  gap: 20rpx;
  margin-top: 22rpx;
}

.item__btn {
  min-width: 180rpx;
  height: 72rpx;
  line-height: 70rpx;
  font-size: 28rpx;
  padding: 0 32rpx;
  text-align: center;
}

.item__btn--pay {
  line-height: 72rpx;
}

.empty {
  padding: 160rpx 40rpx 0;
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
    color: var(--ink-2, #{$n-500});
  }

  &__btn {
    margin: 64rpx auto 0;
    max-width: 460rpx;
  }
}

.note {
  display: block;
  margin-top: 40rpx;
  text-align: center;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-400});
}

.tip {
  display: block;
  padding: 24rpx var(--content-pad, 28rpx) 0;
  font-size: 20rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-400});
}
</style>
