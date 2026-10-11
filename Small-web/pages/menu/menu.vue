<script lang="ts">
import { defineComponent, computed, nextTick, ref } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import SpecSheet from '@/components/SpecSheet.vue';
import CartSheet from '@/components/CartSheet.vue';
import { useAppStore, DINING_TYPE_LABEL, type DiningChoice } from '@/store/app';
import { useCartStore } from '@/store/cart';
import { useMenuStore } from '@/store/menu';
import { distanceLabel, distanceMeters } from '@/utils/geo';
import { triggerPopup } from '@/utils/popup-manager';
import { applyScanQuery, applyScanResult } from '@/utils/scan';
import type { MenuDish } from '@/types/api';

/** 三种就餐方式与后端 orders.dining_type 一一对应；外卖只做选择与记录，不加配送费 */
const TABS: DiningChoice[] = ['dineIn', 'pickup', 'delivery'];

export default defineComponent({
  components: { LineIcon, SpecSheet, CartSheet },

  setup() {
    const app = useAppStore();
    const cart = useCartStore();
    const menu = useMenuStore();

    const specDish = ref<MenuDish | null>(null);
    const cartOpen = ref(false);
    const intoView = ref('');
    const activeCategory = ref(0);

    const distance = computed(() => {
      const store = menu.store;
      const here = app.position;
      if (!store || !here || store.latitude === null || store.longitude === null) return '';
      return distanceLabel(distanceMeters(here.latitude, here.longitude, store.latitude, store.longitude));
    });

    /** 门店月售合计：后端只按菜品聚合，这里如实标成「本月已售 N 份」而不是编一个订单数 */
    const soldTotal = computed(() => menu.dishes.reduce((sum, dish) => sum + dish.monthlySales, 0));

    function pickCategory(categoryId: number): void {
      activeCategory.value = categoryId;
      // scroll-into-view 要先清空再赋值，否则连着点同一个分类不会重新触发滚动
      intoView.value = '';
      nextTick(() => {
        intoView.value = `cat-${categoryId}`;
      });
    }

    function onDish(dish: MenuDish): void {
      if (dish.soldOut) {
        uni.showToast({ title: '这道今天卖完了', icon: 'none' });
        return;
      }
      if (dish.specGroups.length) {
        specDish.value = dish;
        return;
      }
      cart.add(dish, [], 1);
    }

    function onSpecConfirm(payload: { dish: MenuDish; specOptionIds: number[]; quantity: number }): void {
      cart.add(payload.dish, payload.specOptionIds, payload.quantity);
      specDish.value = null;
      uni.showToast({ title: '已加入购物袋', icon: 'none', duration: 1200 });
    }

    function setDining(choice: DiningChoice): void {
      app.setDiningType(choice);
    }

    /**
     * 换桌 / 补扫：顾客已经在小程序里时，直接调起扫一扫。
     *
     * 扫到别的店的码会顺手换店 —— 桌上的码本来就同时带着门店与桌号，
     * 再让人回门店列表找一遍是多余动作。
     */
    async function scanTable(): Promise<void> {
      uni.scanCode({
        success: async (res) => {
          const hit = applyScanResult(res as { scene?: string; path?: string });
          if (!hit) {
            uni.showToast({ title: '这张码上没有桌号信息', icon: 'none' });
            return;
          }
          if (menu.store?.id !== hit.storeId) {
            const ok = await menu.enter(hit.storeId, true);
            if (!ok) return;
            app.store = menu.store;
          }
          app.bindTableStore(hit.storeId);
          uni.showToast({
            title: hit.tableNo ? `已入座 ${hit.tableNo} 桌` : '已按桌面二维码进店',
            icon: 'none',
          });
        },
        fail: () => uni.showToast({ title: '没扫到，重试一下或用微信「扫一扫」', icon: 'none' }),
      });
    }

    function checkout(): void {
      if (!cart.count) {
        uni.showToast({ title: '先点几样吧', icon: 'none' });
        return;
      }
      uni.navigateTo({ url: '/pages/confirm/confirm' });
    }

    return {
      app,
      cart,
      menu,
      TABS,
      DINING_TYPE_LABEL,
      specDish,
      cartOpen,
      intoView,
      activeCategory,
      distance,
      soldTotal,
      pickCategory,
      onDish,
      onSpecConfirm,
      setDining,
      scanTable,
      checkout,
      triggerPopup,
    };
  },

  async onLoad(query) {
    void this.app.loadConfig();
    // 扫码进来时桌号在 query.scene（H5 与开发态是 storeId / tableNo）。
    // App.onShow 已经处理过一次，这里兜底：从别的页面跳进来时 scene 只给到页面。
    applyScanQuery((query ?? {}) as Record<string, unknown>);
    const scannedStore = this.app.takeScanStore();
    const storeId = Number(query?.storeId ?? 0) || scannedStore || this.app.store?.id || 0;
    if (!storeId) return;
    const ok = await this.menu.enter(storeId, true);
    if (!ok) return;
    this.app.store = this.menu.store;
    // 换店要把上一家的桌号清掉：桌号只认桌上那张码，跟着人走会送错桌
    this.app.bindTableStore(storeId);
    // 首页分类宫格 / 推荐位带过来的定位目标（switchTab 不带 query，只能走 store）
    const focus = this.menu.takeFocus();
    if (focus?.categoryId !== undefined) {
      const target = focus.categoryId || this.menu.categories[0]?.id;
      if (target) this.pickCategory(target);
    }
    void triggerPopup('store_enter', { storeId });
  },
});
</script>

<template>
  <view class="menu" :style="app.cssVars">
    <view v-if="menu.loading && !menu.categories.length" class="menu__state">
      <text>正在打开菜单…</text>
    </view>

    <view v-else-if="menu.error" class="menu__state">
      <text>{{ menu.error }}</text>
      <text class="menu__retry" @click="menu.enter(menu.storeId, true)">重试</text>
    </view>

    <template v-else>
      <!-- 店铺头部：店名 / 营业时间 / 距离 / 本月已售 -->
      <view class="head card">
        <view class="head__logo">
          <image v-if="app.store?.logo" class="head__logo-img" :src="app.store.logo" mode="aspectFill" />
          <text v-else class="head__logo-text">{{ (app.store?.name || '').slice(0, 1) }}</text>
        </view>
        <view class="head__body">
          <view class="head__line">
            <text class="head__name">{{ app.store?.name }}</text>
            <view class="dot" :class="app.store?.orderable ? 'dot--on' : 'dot--off'" />
            <text class="head__status">{{ app.store?.orderable ? app.store?.businessStatusLabel : app.store?.orderableHint }}</text>
          </view>
          <view class="head__meta">
            <text v-if="soldTotal > 0" class="head__meta-item num">本月已售 {{ soldTotal }} 份</text>
            <text v-if="distance" class="head__meta-item num">{{ distance }}</text>
            <text v-if="app.store?.businessHours" class="head__meta-item">{{ app.store.businessHours }}</text>
          </view>
        </view>
      </view>

      <!-- 桌号卡（堂食）：只认桌上的二维码，页面上没有输入口 -->
      <view v-if="app.diningType === 'dineIn'" class="table card">
        <view class="table__body">
          <text class="table__no" :class="{ 'is-empty': !app.tableNo }">
            {{ app.tableNo ? `${app.tableNo} 桌` : '未扫码 · 由店员安排' }}
          </text>
          <text class="table__sub">{{ app.store?.name }} · 堂食点餐</text>
        </view>
        <text class="table__change" @click="scanTable">{{ app.tableNo ? '扫码换桌' : '扫码入座' }}</text>
      </view>

      <view class="tabs">
        <view
          v-for="item in TABS"
          :key="item"
          class="tabs__item"
          :class="{ 'is-on': app.diningType === item }"
          @click="setDining(item)"
        >
          {{ DINING_TYPE_LABEL[item] }}
        </view>
      </view>

      <view class="body">
        <scroll-view class="rail" scroll-y>
          <view
            v-for="category in menu.categories"
            :key="category.id"
            class="rail__item"
            :class="{ 'is-on': activeCategory === category.id }"
            @click="pickCategory(category.id)"
          >
            <text>{{ category.name }}</text>
            <text v-if="cart.quantityByDish.get(category.id)" class="rail__dot" />
          </view>
        </scroll-view>

        <scroll-view class="list" scroll-y :scroll-into-view="intoView" scroll-with-animation>
          <view
            v-for="category in menu.categories"
            :id="`cat-${category.id}`"
            :key="category.id"
            class="group"
          >
            <text class="group__title">{{ category.name }}</text>
            <view
              v-for="dish in category.dishes"
              :key="dish.id"
              class="dish"
              :class="{ 'is-out': dish.soldOut }"
              @click="onDish(dish)"
            >
              <view class="dish__pic">
                <image v-if="dish.imageUrl" class="dish__img" :src="dish.imageUrl" mode="aspectFill" />
                <text v-else class="dish__initial">{{ dish.name.slice(0, 1) }}</text>
              </view>
              <view class="dish__body">
                <text class="dish__name">{{ dish.name }}</text>
                <view class="dish__meta">
                  <text v-if="dish.monthlySales > 0" class="dish__meta-item num">月售 {{ dish.monthlySales }}</text>
                  <text v-if="dish.description" class="dish__meta-item dish__desc">{{ dish.description }}</text>
                </view>
                <view class="dish__foot">
                  <text class="dish__price num">
                    <text class="dish__cny">¥</text>{{ (dish.price / 100).toFixed(2) }}
                  </text>
                  <text v-if="cart.quantityByDish.get(dish.id)" class="dish__picked">已选 {{ cart.quantityByDish.get(dish.id) }}</text>
                  <view class="round-btn dish__add" :class="{ 'is-off': dish.soldOut }">
                    <LineIcon :name="dish.soldOut ? 'close' : 'plus'" :size="16" :color="dish.soldOut ? '#9a908a' : '#ffffff'" />
                  </view>
                </view>
              </view>
            </view>
          </view>
          <view class="list__pad" />
        </scroll-view>
      </view>

      <!-- 底部悬浮购物车条 -->
      <view class="bar">
        <view class="bar__cart" @click="cartOpen = true">
          <view class="bar__icon">
            <LineIcon name="cart" :size="22" :color="cart.count ? '#ffffff' : '#9a908a'" />
            <text v-if="cart.count" class="bar__badge num">{{ cart.count > 99 ? '99+' : cart.count }}</text>
          </view>
        </view>
        <view class="bar__total">
          <text class="bar__amount num">¥{{ (cart.amount / 100).toFixed(2) }}</text>
          <text class="bar__hint">{{ cart.count ? `已选 ${cart.count} 件` : '购物袋是空的' }}</text>
        </view>
        <view class="btn-main bar__cta" :class="{ 'is-off': !cart.count || !app.store?.orderable }" @click="checkout">
          {{ app.store?.orderable ? (app.diningType === 'dineIn' ? '下单' : '去结算') : '本店当前不接单' }}
        </view>
      </view>
    </template>

    <SpecSheet :dish="specDish" @close="specDish = null" @confirm="onSpecConfirm" />
    <CartSheet v-if="cartOpen" @close="cartOpen = false" @checkout="checkout" />
  </view>
</template>

<style scoped lang="scss">
.menu {
  /* Tab 页高度要减掉原生导航与 tabBar 的可视区，否则底部条会被裁掉 */
  height: calc(100vh - var(--window-top) - var(--window-bottom));
  display: flex;
  flex-direction: column;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.menu__state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  font-size: 28rpx;
  color: var(--ink-2, #{$n-500});
}

.menu__retry {
  color: var(--brand, #c8752b);
}

.head {
  display: flex;
  gap: 20rpx;
  margin: var(--page-margin, 16px) var(--page-margin, 16px) 0;
  padding: 24rpx 28rpx;
}

.head__logo {
  width: 96rpx;
  height: 96rpx;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.head__logo-img {
  width: 100%;
  height: 100%;
}

.head__logo-text {
  font-size: 40rpx;
  font-weight: 600;
  color: var(--brand, #c8752b);
}

.head__body {
  flex: 1;
  min-width: 0;
}

.head__line {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.head__name {
  font-size: 32rpx;
  font-weight: 700;
}

.head__status {
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}

.head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 20rpx;
  margin-top: 10rpx;
}

.head__meta-item {
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.table {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: var(--card-gap, 8px) var(--page-margin, 16px) 0;
  padding: 22rpx 28rpx;
}

.table__no {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--brand, #c8752b);

  /* 没扫码时不是错误，只是「还没定座」，所以压成次级色而不是标红 */
  &.is-empty {
    font-size: 30rpx;
    font-weight: 600;
    color: var(--ink-2, #{$n-500});
  }
}

.table__sub {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.table__change {
  font-size: 26rpx;
  color: var(--brand, #c8752b);
}

.tabs {
  display: flex;
  gap: 40rpx;
  padding: 20rpx var(--page-margin, 16px) 8rpx;
}

.tabs__item {
  position: relative;
  font-size: 28rpx;
  color: var(--ink-2, #{$n-500});
  padding-bottom: 10rpx;
}

.tabs__item.is-on {
  color: var(--ink, #{$n-900});
  font-weight: 600;
}

.tabs__item.is-on::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 32rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background-color: var(--brand, #c8752b);
}

.body {
  flex: 1;
  display: flex;
  min-height: 0;
  background-color: var(--card-bg, rgba(255, 255, 255, 0.7));
  backdrop-filter: blur(20px);
}

.rail {
  width: 176rpx;
  flex: none;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.02);
}

.rail__item {
  position: relative;
  padding: 32rpx 16rpx;
  font-size: 26rpx;
  color: var(--ink-2, #{$n-500});
  text-align: center;
}

.rail__item.is-on {
  color: var(--ink, #{$n-900});
  font-weight: 600;
  background-color: transparent;
}

.rail__item.is-on::before {
  content: '';
  position: absolute;
  left: 0;
  top: 34rpx;
  bottom: 34rpx;
  width: 6rpx;
  border-radius: 999rpx;
  background-color: var(--brand, #c8752b);
}

.rail__dot {
  position: absolute;
  top: 26rpx;
  right: 22rpx;
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background-color: var(--brand, #c8752b);
}

.list {
  flex: 1;
  height: 100%;
  padding: 0 24rpx;
}

.group__title {
  display: block;
  padding: 24rpx 0 12rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--brand-sub, #{$n-700});
}

.dish {
  display: flex;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});
}

.dish.is-out {
  opacity: 0.55;
}

.dish__pic {
  width: 132rpx;
  height: 132rpx;
  flex: none;
  border-radius: var(--radius-tile, 12px);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.dish__img {
  width: 100%;
  height: 100%;
}

.dish__initial {
  font-size: 40rpx;
  color: var(--brand, #c8752b);
}

.dish__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.dish__name {
  font-size: 30rpx;
  font-weight: 600;
}

.dish__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 16rpx;
  margin-top: 6rpx;
}

.dish__meta-item {
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.dish__desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dish__foot {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: auto;
  padding-top: 12rpx;
}

.dish__price {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--brand, #c8752b);
}

.dish__cny {
  font-size: 22rpx;
  margin-right: 2rpx;
}

.dish__picked {
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.dish__add {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.list__pad {
  height: 160rpx;
}

.bar {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 0 var(--page-margin, 16px) 20rpx;
  padding: 18rpx 24rpx;
  border-radius: 999rpx;
  background-color: rgba(58, 50, 44, 0.92);
  backdrop-filter: blur(20px);
}

.bar__icon {
  position: relative;
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background-color: var(--brand, #c8752b);
  display: flex;
  align-items: center;
  justify-content: center;
}

.bar__badge {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  min-width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  padding: 0 8rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: #fff;
  color: var(--brand, #c8752b);
  font-size: 20rpx;
}

.bar__total {
  flex: 1;
  min-width: 0;
}

.bar__amount {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: #fff;
}

.bar__hint {
  display: block;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.6);
}

.bar__cta {
  width: 220rpx;
  height: 84rpx;
  line-height: 84rpx;
  font-size: 30rpx;
}
</style>
