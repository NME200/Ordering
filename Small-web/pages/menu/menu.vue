<script lang="ts">
import { defineComponent, computed, getCurrentInstance, nextTick, ref } from 'vue';
import CartSheet from '@/components/CartSheet.vue';
import SpecSheet from '@/components/SpecSheet.vue';
import { useAppStore } from '@/store/app';
import { useCartStore } from '@/store/cart';
import { useMenuStore } from '@/store/menu';
import { ErrorCode } from '@/types/error-codes';
import { yuan } from '@/utils/format';
import type { MenuCategory, MenuDish } from '@/types/api';

export default defineComponent({
  components: { CartSheet, SpecSheet },

  setup() {
    const app = useAppStore();
    const cart = useCartStore();
    const menu = useMenuStore();
    const instance = getCurrentInstance();

    const keyword = ref('');
    const activeIndex = ref(0);
    const scrollTarget = ref('');
    const specDish = ref<MenuDish | null>(null);
    const cartOpen = ref(false);
    const highlight = ref(0);
    /** 菜单重载后发现的变化（沽清移出 / 变价），用一条横幅如实告诉顾客 */
    const menuNotice = ref('');
    let offsets: number[] = [];

    const filtered = computed<MenuCategory[]>(() => {
      const text = keyword.value.trim().toLowerCase();
      const list = menu.categories.filter((category) => category.dishes.length > 0);
      if (!text) return list;
      return list
        .map((category) => ({
          ...category,
          dishes: category.dishes.filter(
            (dish) =>
              dish.name.toLowerCase().includes(text) ||
              (dish.description ?? '').toLowerCase().includes(text),
          ),
        }))
        .filter((category) => category.dishes.length > 0);
    });

    const quantityOf = (dishId: number): number => cart.quantityByDish.get(dishId) ?? 0;

    /** 「招牌 · 2 种规格」这类灰字说明：只讲事实，不做彩色标签 */
    function tagLine(dish: MenuDish): string {
      const parts: string[] = [];
      if (dish.isRecommend) parts.push('招牌');
      const single = dish.specGroups.filter((group) => group.type === 0).length;
      const multi = dish.specGroups.length - single;
      if (single) parts.push(`${single} 种规格`);
      if (multi) parts.push(`可选 ${multi} 组`);
      return parts.join(' · ');
    }

    function measure(): void {
      nextTick(() => {
        const query = uni.createSelectorQuery().in(instance?.proxy);
        query.selectAll('.cat-h').boundingClientRect();
        query.exec((res) => {
          const rects = (res[0] ?? []) as UniApp.NodeInfo[];
          if (!rects.length) return;
          offsets = rects.map((rect) => Number(rect.top) - Number(rects[0].top));
        });
      });
    }

    function onScroll(event: { detail: { scrollTop: number } }): void {
      const pos = event.detail.scrollTop + 8;
      let index = 0;
      offsets.forEach((top, i) => {
        if (pos >= top) index = i;
      });
      if (index !== activeIndex.value) activeIndex.value = index;
    }

    /** 定位到某个分类：先清空再赋值，重复点同一个才会再次触发滚动 */
    function jump(index: number): void {
      const category = filtered.value[index];
      if (!category) return;
      activeIndex.value = index;
      scrollTarget.value = '';
      nextTick(() => {
        scrollTarget.value = `cat-${category.id}`;
      });
    }

    function jumpToCategory(categoryId: number): void {
      const index = filtered.value.findIndex((category) => category.id === categoryId);
      if (index >= 0) jump(index);
    }

    function quickAdd(dish: MenuDish): void {
      cart.add(dish, [], 1);
    }

    function onSpecConfirm(payload: { dish: MenuDish; specOptionIds: number[]; quantity: number }): void {
      cart.add(payload.dish, payload.specOptionIds, payload.quantity);
      specDish.value = null;
    }

    function goCheckout(): void {
      if (!cart.lines.length) return;
      cartOpen.value = false;
      uni.navigateTo({ url: `/pages/confirm/confirm?storeId=${menu.storeId}` });
    }

    async function reload(): Promise<void> {
      const ok = await menu.load(true);
      if (!ok) return;
      const diff = cart.syncWithMenu(menu.categories);
      const parts: string[] = [];
      if (diff.removed.length) parts.push(`${diff.removed.join('、')}已售罄，已移出购物袋`);
      if (diff.repriced.length) parts.push(`${diff.repriced.join('、')}价格有变`);
      if (parts.length) menuNotice.value = `菜单已更新：${parts.join('；')}`;
      measure();
    }

    async function boot(id: number, categoryId?: string, dishId?: string): Promise<void> {
      const ok = await menu.enter(id, false);
      if (!ok) return;
      measure();
      // 首页分类宫格与推荐位带进来的定位参数：先找到菜属于哪个分类，再滚过去
      const targetDish = Number(dishId ?? 0);
      if (targetDish) {
        const dish = menu.findDish(targetDish);
        const owner = menu.categories.find((category) => category.dishes.some((item) => item.id === targetDish));
        if (dish && owner) {
          jumpToCategory(owner.id);
          highlight.value = targetDish;
          setTimeout(() => (highlight.value = 0), 2400);
        }
        return;
      }
      if (categoryId) jumpToCategory(Number(categoryId));
    }

    return {
      app,
      menu,
      cart,
      keyword,
      activeIndex,
      scrollTarget,
      specDish,
      cartOpen,
      highlight,
      menuNotice,
      filtered,
      quantityOf,
      tagLine,
      onScroll,
      jump,
      quickAdd,
      onSpecConfirm,
      goCheckout,
      reload,
      boot,
      yuan,
      STORE_NOT_FOUND: ErrorCode.STORE_NOT_FOUND,
    };
  },

  onLoad(query) {
    const id = Number(query?.storeId ?? 0);
    if (!id) {
      uni.redirectTo({ url: '/pages/index/index' });
      return;
    }
    void this.boot(id, query?.categoryId, query?.dishId);
  },

  onShow() {
    // 从确认页返回时重载：期间可能有人买走了最后一份，或商户改了价
    if (this.menu.storeId && !this.menu.loading) void this.reload();
  },
});
</script>

<template>
  <view class="menu" :style="app.cssVars">
    <view class="head">
      <text class="head__name">{{ menu.store?.name || '加载中' }}</text>
      <view class="head__meta">
        <text class="dot" :class="menu.store?.orderable ? 'dot--on' : 'dot--off'" />
        <text class="head__status">{{ menu.store?.businessStatusLabel }}</text>
        <text class="head__count num">{{ menu.dishTotal }} 道在售</text>
        <text v-if="menu.soldOutTotal" class="head__sold">{{ menu.soldOutTotal }} 道售罄</text>
      </view>
    </view>

    <view v-if="menuNotice" class="tip" @click="menuNotice = ''">
      <text class="tip__text">{{ menuNotice }}</text>
      <text class="tip__close">知道了</text>
    </view>

    <view class="search">
      <input v-model="keyword" class="search__input" placeholder="搜索本店菜品" placeholder-class="search__ph" />
      <text v-if="keyword" class="search__clear" @click="keyword = ''">清除</text>
    </view>

    <view v-if="menu.error && !menu.categories.length" class="state">
      <text class="state__text">
        {{ menu.errorCode === STORE_NOT_FOUND ? '这家店当前不可点单，请返回首页重新扫码' : menu.error }}
      </text>
      <text v-if="menu.retryIn > 0" class="state__sub num">{{ menu.retryIn }} 秒后自动重试</text>
      <view v-else class="state__btn" @click="reload">重试</view>
    </view>

    <view v-else class="body">
      <scroll-view class="rail" scroll-y>
        <view
          v-for="(category, index) in filtered"
          :key="category.id"
          class="rail__i"
          :class="{ 'is-on': index === activeIndex }"
          @click="jump(index)"
        >
          <text class="rail__name">{{ category.name }}</text>
          <text class="rail__n num">{{ category.dishes.length }}</text>
        </view>
      </scroll-view>

      <scroll-view
        class="list"
        scroll-y
        :scroll-into-view="scrollTarget"
        scroll-with-animation
        @scroll="onScroll"
      >
        <view v-for="category in filtered" :id="`cat-${category.id}`" :key="category.id">
          <view class="cat-h">{{ category.name }}</view>
          <view
            v-for="dish in category.dishes"
            :key="dish.id"
            class="dish"
            :class="{ 'is-out': dish.soldOut, 'is-flash': highlight === dish.id }"
          >
            <image v-if="dish.imageUrl" class="thumb" :src="dish.imageUrl" mode="aspectFill" />
            <view v-else class="thumb thumb--text">
              <text>{{ dish.name.slice(0, 1) }}</text>
            </view>

            <view class="dish__body">
              <text class="dish__name">{{ dish.name }}</text>
              <text v-if="dish.description" class="dish__desc">{{ dish.description }}</text>
              <text v-if="tagLine(dish)" class="dish__tag">{{ tagLine(dish) }}</text>
              <view class="dish__foot">
                <text class="price num"><text class="price__cny">¥</text>{{ yuan(dish.price) }}</text>
                <view class="dish__ctl">
                  <text v-if="quantityOf(dish.id)" class="dish__qty num">{{ quantityOf(dish.id) }} 份</text>
                  <view v-if="dish.soldOut" class="add add--off">已售罄</view>
                  <view v-else-if="dish.specGroups.length" class="add add--ghost" @click="specDish = dish">选规格</view>
                  <view v-else class="add" @click="quickAdd(dish)">＋</view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view v-if="!filtered.length" class="state state--inline">
          <text class="state__text">没有搜到「{{ keyword }}」，换个词试试</text>
        </view>
        <view class="list__pad" />
      </scroll-view>
    </view>

    <view class="bar">
      <view class="bar__bag" @click="cartOpen = true">
        <text class="bar__bag-text">购物袋</text>
        <text v-if="cart.count" class="bar__badge num">{{ cart.count }}</text>
      </view>
      <view class="bar__mid">
        <text v-if="cart.count" class="bar__amount num">¥{{ yuan(cart.amount) }}</text>
        <text v-else class="bar__hint">{{ menu.store && !menu.store.orderable ? '本店当前不接单' : '未选购' }}</text>
      </view>
      <view class="bar__go" :class="{ 'is-off': !cart.count || (menu.store && !menu.store.orderable) }" @click="goCheckout">
        {{ menu.store && !menu.store.orderable ? '暂不接单' : '去结算' }}
      </view>
    </view>

    <SpecSheet :dish="specDish" @close="specDish = null" @confirm="onSpecConfirm" />
    <CartSheet v-if="cartOpen" @close="cartOpen = false" @checkout="goCheckout" />
  </view>
</template>

<style scoped lang="scss">
.menu {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--page-bg, #fff);
  color: var(--ink, #{$n-900});
}

.head {
  padding: 24rpx 32rpx 20rpx;
  border-bottom: 1rpx solid $hair;

  &__name {
    display: block;
    font-size: 36rpx;
    font-weight: 700;
    letter-spacing: -0.5rpx;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 10rpx;
    margin-top: 10rpx;
  }

  &__status,
  &__count,
  &__sold {
    font-size: 22rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__sold {
    color: $n-400;
  }
}

.tip {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 14rpx 32rpx;
  border-bottom: 1rpx solid $hair;

  &__text {
    flex: 1;
    font-size: 22rpx;
    line-height: 1.5;
    color: $warn;
  }

  &__close {
    flex: none;
    font-size: 22rpx;
    color: $n-400;
  }
}

.search {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 0 32rpx;
  height: 72rpx;
  border-bottom: 1rpx solid $hair;

  &__input {
    flex: 1;
    font-size: 26rpx;
    height: 48rpx;
  }

  &__ph {
    color: $n-400;
  }

  &__clear {
    flex: none;
    font-size: 22rpx;
    color: $n-400;
  }
}

.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding: 0 48rpx;

  &--inline {
    flex: none;
    padding: 120rpx 0;
  }

  &__text {
    font-size: 26rpx;
    line-height: 1.6;
    text-align: center;
    color: $n-500;
  }

  &__sub {
    font-size: 22rpx;
    color: $n-400;
  }

  &__btn {
    padding: 0 40rpx;
    height: 64rpx;
    line-height: 64rpx;
    border: 1rpx solid $n-200;
    border-radius: 999rpx;
    font-size: 26rpx;
    color: $n-600;
  }
}

.body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.rail {
  width: 168rpx;
  flex: none;
  height: 100%;
  background-color: $n-50;

  &__i {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6rpx;
    padding: 26rpx 16rpx 26rpx 20rpx;
    font-size: 24rpx;
    color: $n-600;
    border-left: 4rpx solid transparent;

    &.is-on {
      background-color: #fff;
      color: var(--ink, #{$n-900});
      font-weight: 600;
      border-left-color: var(--brand, #{$brand-500});
    }
  }

  &__name {
    flex: 1;
  }

  &__n {
    font-size: 18rpx;
    color: $n-400;
  }
}

.list {
  flex: 1;
  min-width: 0;
  height: 100%;
  background-color: #fff;

  &__pad {
    height: 40rpx;
  }
}

.cat-h {
  padding: 28rpx 24rpx 10rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: $n-500;
}

.dish {
  display: flex;
  gap: 20rpx;
  padding: 20rpx 24rpx;
  border-bottom: 1rpx solid $hair;

  &.is-out {
    opacity: 0.45;
  }

  /* 从首页推荐位跳进来时闪一下，告诉顾客「就是这道」 */
  &.is-flash {
    background-color: var(--brand-soft, #{$brand-50});
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: block;
    font-size: 28rpx;
    font-weight: 600;
  }

  &__desc {
    display: block;
    margin-top: 6rpx;
    font-size: 22rpx;
    line-height: 1.5;
    color: $n-500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__tag {
    display: block;
    margin-top: 8rpx;
    font-size: 20rpx;
    color: $n-400;
  }

  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 14rpx;
  }

  &__ctl {
    display: flex;
    align-items: center;
    gap: 14rpx;
  }

  &__qty {
    font-size: 20rpx;
    color: var(--brand, #{$brand-500});
  }
}

.thumb {
  width: 120rpx;
  height: 120rpx;
  flex: none;
  background-color: $n-100;

  &--text {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--brand, #{$brand-500});
    font-size: 40rpx;
  }
}

.price {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--brand, #{$brand-500});

  &__cny {
    font-size: 20rpx;
    margin-right: 2rpx;
  }
}

.add {
  min-width: 56rpx;
  padding: 0 20rpx;
  height: 52rpx;
  line-height: 52rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: var(--brand, #{$brand-500});
  color: #fff;
  font-size: 26rpx;

  &--ghost {
    background-color: transparent;
    border: 1rpx solid var(--brand, #{$brand-500});
    color: var(--brand, #{$brand-500});
    font-size: 24rpx;
  }

  &--off {
    background-color: $n-100;
    color: $n-400;
    font-size: 22rpx;
  }
}

.bar {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid $hair;
  background-color: #fff;

  &__bag {
    position: relative;
    padding: 0 26rpx;
    height: 72rpx;
    line-height: 72rpx;
    background-color: $n-900;
    color: #fff;
  }

  &__bag-text {
    font-size: 24rpx;
  }

  &__badge {
    position: absolute;
    top: -8rpx;
    right: -6rpx;
    min-width: 32rpx;
    padding: 0 8rpx;
    height: 32rpx;
    line-height: 32rpx;
    text-align: center;
    border-radius: 999rpx;
    background-color: var(--brand, #{$brand-500});
    color: #fff;
    font-size: 20rpx;
  }

  &__mid {
    flex: 1;
  }

  &__amount {
    font-size: 36rpx;
    font-weight: 700;
  }

  &__hint {
    font-size: 24rpx;
    color: $n-400;
  }

  &__go {
    flex: none;
    padding: 0 48rpx;
    height: 72rpx;
    line-height: 72rpx;
    border-radius: 999rpx;
    background-color: var(--brand, #{$brand-500});
    color: #fff;
    font-size: 28rpx;
    font-weight: 600;

    &.is-off {
      background-color: $n-200;
      color: $n-400;
    }
  }
}
</style>
