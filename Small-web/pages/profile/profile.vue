<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import WechatLoginSheet from '@/components/WechatLoginSheet.vue';
import DiyAssetBar from '@/components/diy/DiyAssetBar.vue';
import DiyOrderEntry from '@/components/diy/DiyOrderEntry.vue';
import DiyServiceGrid from '@/components/diy/DiyServiceGrid.vue';
import DiyUserHeader from '@/components/diy/DiyUserHeader.vue';
import { useAppStore } from '@/store/app';
import { useCustomerStore } from '@/store/customer';
import { useMenuStore } from '@/store/menu';
import { getLastMerchantId, setLastMerchantId } from '@/utils/auth';
import { openLink, rememberOrdersBucket } from '@/utils/nav';
import { isWeixinMp } from '@/utils/wx';
import type { IconItem } from '@/types/api';
import type { OrderBucket } from '@/types/customer';

/** 这一版小程序认识的「我的」组件；白名单外的 key 跳过（装修端可能下发更新的组件） */
const KNOWN_KEYS = ['userHeader', 'assetBar', 'orderEntry', 'serviceGrid'] as const;

/**
 * 服务宫格的键 → 页面。
 *
 * 键是闭合枚举（后端 `SECTION_SCHEMAS` 卡死），所以这里能给出**完整**映射：
 * 配置里没填 link 时也照样跳得过去，不会出现「点了说功能开发中」。
 * 配置了 link 时以 link 为准，让平台能把入口改指向别的页面（如活动页）。
 */
const SERVICE_ROUTES: Record<string, string> = {
  address: '/pages/address/address',
  couponCenter: '/pages/coupon/coupon?tab=center',
  couponMine: '/pages/coupon/coupon?tab=mine',
  memberCard: '/pages/card/card',
  invoice: '/pages/invoice/invoice',
  service: '/pages/service/service',
  queue: '/pages/queue/queue',
  setting: '/pages/settings/settings',
  newcomer: '/pages/coupon/coupon?tab=newcomer',
  birthday: '/pages/coupon/coupon?tab=birthday',
  stores: '/pages/stores/stores',
};

/**
 * 个人中心（Tab 第三项）。
 *
 * 结构仍由平台装修配置驱动，但**数据是真的**：账号、积分、券数、订单角标
 * 全部来自 `/customer/*`。资产是按商户的，所以没进过任何一家店时
 * 资产栏画「进店后可见」而不是 0 —— 上一版这里画 `—` 是因为后端确实没有账号体系。
 */
export default defineComponent({
  components: { LineIcon, WechatLoginSheet, DiyAssetBar, DiyOrderEntry, DiyServiceGrid, DiyUserHeader },

  setup() {
    const app = useAppStore();
    const menu = useMenuStore();
    const customer = useCustomerStore();

    const loginOpen = ref(false);

    /**
     * 「微信一键登录」入口的显示条件：跑在小程序里，且昵称或头像还没落地。
     *
     * 顾客没填之前一直提示，填完就永久消失 —— 微信的昵称头像不是一次性授权，
     * 是「顾客自己点两下确认」，所以催得太紧反而像故障。
     */
    const needWxProfile = computed(() => {
      if (!isWeixinMp()) return false;
      const profile = customer.profile;
      return Boolean(profile) && (!profile?.nickname || !profile?.avatar);
    });

    const sections = computed(() =>
      app.sectionsOf('member').filter((item) => (KNOWN_KEYS as readonly string[]).includes(item.key)),
    );

    /** 当前商户：优先店内，其次最近一次进店记下的，都没有就是「未进店」 */
    const merchantId = computed(() => menu.store?.merchantId ?? getLastMerchantId() ?? 0);

    /** 资产栏的值。没档案时给空串，渲染层画占位而不是 0 */
    const assetValues = computed<Record<string, string>>(() => {
      const result: Record<string, string> = {};
      for (const item of customer.assets) {
        if (item.value !== null) result[item.key] = item.value;
      }
      return result;
    });

    const counts = computed<Record<string, number>>(() => ({ ...customer.buckets }));

    /** 宫格角标：券张数与待评价数最有提示价值 */
    const badges = computed<Record<string, number>>(() => ({
      couponMine: customer.member?.couponCount ?? 0,
      review: customer.buckets.review ?? 0,
    }));

    function go(url: string): void {
      const path = url.split('?')[0];
      if (path === '/pages/profile/profile' || path === '/pages/home/home' || path === '/pages/orders/orders') {
        uni.switchTab({ url: path });
        return;
      }
      uni.navigateTo({ url, fail: () => uni.showToast({ title: '这个功能正在开发中', icon: 'none' }) });
    }

    /** 订单页是 Tab 页，switchTab 带不了 query，交接口径见 utils/nav 的 rememberOrdersBucket */
    function openOrders(bucket?: string): void {
      if (bucket) rememberOrdersBucket(bucket);
      uni.switchTab({ url: '/pages/orders/orders' });
    }

    function onOrderTap(item: IconItem & { key?: string }): void {
      openOrders((item.key || '') as OrderBucket);
    }

    /** 宫格里的「设置」直接进设置页：就餐方式等偏好都在那里改，不再在「我的」底部留入口 */
    function onServiceTap(item: IconItem & { key?: string }): void {
      if (item.link) {
        openLink(item.link, {});
        return;
      }
      const route = SERVICE_ROUTES[item.key || ''];
      if (route) go(route);
      else openLink(item.link, {});
    }

    function onAssetTap(key: string): void {
      if (key === 'coupon') {
        go('/pages/coupon/coupon?tab=mine');
        return;
      }
      if (key === 'point' || key === 'balance') {
        go('/pages/card/card');
        return;
      }
      uni.showToast({ title: '这一项还没有可看的明细', icon: 'none' });
    }

    /** 绑定手机号是账号动作，表单在设置页，这里只把人送过去 */
    function bindPhone(): void {
      go('/pages/settings/settings');
    }

    return {
      app,
      menu,
      customer,
      merchantId,
      sections,
      assetValues,
      counts,
      badges,
      loginOpen,
      needWxProfile,
      openOrders,
      onOrderTap,
      onServiceTap,
      onAssetTap,
      bindPhone,
      go,
    };
  },

  async onShow() {
    void this.app.loadConfig();
    // 冷启动直接进「我的」时菜单还没加载，商户上下文要靠本地记录兜底。
    // 必须先 await 进店再刷资产：否则 merchantId 还是 0，
    // 后端按「未指定商户」返回 member=null，资产栏就永远是一排占位符。
    if (!this.menu.storeId) {
      const saved = Number(uni.getStorageSync('last-store-id-v1') || 0);
      if (saved) await this.menu.enter(saved, false);
    }
    if (this.merchantId) setLastMerchantId(this.merchantId);
    await this.customer.refresh(this.merchantId || undefined);
  },
});
</script>

<template>
  <view class="profile" :style="app.cssVars">
    <block v-for="item in sections" :key="item.id">
      <block v-if="item.key === 'userHeader'">
        <DiyUserHeader
          :config="item.props"
          :nickname="customer.displayName"
          :customer-id="customer.profile ? String(customer.profile.id) : ''"
          :phone="customer.profile?.phone || ''"
          :avatar="customer.profile?.avatar || ''"
          @bind="bindPhone"
          @setting="go('/pages/settings/settings')"
        />
        <view v-if="needWxProfile" class="login-entry" @click="loginOpen = true">
          <text class="login-entry__main">微信一键登录</text>
          <text class="login-entry__sub">点两下把微信头像和昵称带进来</text>
          <LineIcon name="right" :size="14" tone="sub" />
        </view>
      </block>
      <view v-else class="profile__block">
        <DiyAssetBar
          v-if="item.key === 'assetBar'"
          :config="item.props"
          :values="assetValues"
          @pick="onAssetTap"
        />
        <DiyOrderEntry
          v-else-if="item.key === 'orderEntry'"
          :config="item.props"
          :counts="counts"
          @pick="onOrderTap"
        />
        <DiyServiceGrid
          v-else-if="item.key === 'serviceGrid'"
          :config="item.props"
          :badges="badges"
          @pick="onServiceTap"
        />
      </view>
    </block>

    <!-- 一个组件都没配时的兜底：至少让人能找到订单和门店 -->
    <view v-if="!sections.length" class="fallback card">
      <text class="fallback__title">{{ menu.store?.name || '还没进店' }}</text>
      <view class="btn-main fallback__btn" @click="openOrders()">我的订单</view>
      <view class="btn-ghost fallback__btn" @click="onServiceTap({ key: 'stores', text: '查看门店', icon: 'store' })">
        查看门店
      </view>
    </view>

    <WechatLoginSheet :visible="loginOpen" :profile="customer.profile" @close="loginOpen = false" />
  </view>
</template>

<style scoped lang="scss">
.profile {
  min-height: 100vh;
  padding-bottom: 60rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

/* 头部通栏，其余块沿用页边距与卡片间距 */
.profile__block {
  padding: var(--card-gap, 8px) var(--page-margin, 16px) 0;
}

/* 头部下面压一条入口：只在小程序、且昵称头像没落地时出现 */
.login-entry {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: -32rpx var(--page-margin, 16px) 0;
  padding: 24rpx 28rpx;
  border-radius: var(--radius, 16px);
  background-color: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(20px);

  &__main {
    flex: none;
    font-size: 28rpx;
    font-weight: 700;
    color: var(--brand, #c8752b);
  }

  &__sub {
    flex: 1;
    min-width: 0;
    font-size: 22rpx;
    color: var(--ink-2, #{$n-400});
  }
}

.fallback {
  margin: var(--page-margin, 16px);
  padding: 48rpx 40rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  align-items: stretch;

  &__title {
    font-size: 32rpx;
    font-weight: 700;
    text-align: center;
    margin-bottom: 12rpx;
  }
}
</style>
