<script lang="ts">
import { defineComponent, computed } from 'vue';
import HomeBanner from '@/components/home/HomeBanner.vue';
import HomeCategoryNav from '@/components/home/HomeCategoryNav.vue';
import HomeHotDishes from '@/components/home/HomeHotDishes.vue';
import HomeNotice from '@/components/home/HomeNotice.vue';
import { useAppStore } from '@/store/app';
import { useMenuStore } from '@/store/menu';
import { ErrorCode } from '@/types/error-codes';
import { yuan } from '@/utils/format';

export default defineComponent({
  components: { HomeBanner, HomeCategoryNav, HomeHotDishes, HomeNotice },

  setup() {
    const app = useAppStore();
    const menu = useMenuStore();

    const storeId = computed(() => menu.storeId);
    /** 后端加了新组件而这一版小程序不认识时，整块跳过而不是报错白屏 */
    const known = computed(() =>
      app.sections.filter((section) =>
        ['banner', 'notice', 'categoryNav', 'hotDishes'].includes(section.key),
      ),
    );

    const hotDishes = computed(() => {
      const section = app.section('hotDishes');
      if (!section) return [];
      if (section.props.source === 'manual') return menu.pickByIds(section.props.dishIds);
      return menu.recommended().slice(0, 12);
    });

    async function boot(id: number, force: boolean): Promise<void> {
      if (!id) {
        uni.redirectTo({ url: '/pages/index/index' });
        return;
      }
      await menu.enter(id, force);
    }

    function goMenu(query: Record<string, string | number>): void {
      const parts = Object.entries(query)
        .filter(([, value]) => value !== '' && value !== undefined && value !== 'all')
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      uni.navigateTo({ url: `/pages/menu/menu?storeId=${storeId.value}${parts ? `&${parts}` : ''}` });
    }

    function onLink(link: string): void {
      if (link.startsWith('/pages/')) {
        uni.navigateTo({ url: link });
        return;
      }
      uni.showToast({ title: '这个位置还没有配置内容', icon: 'none' });
    }

    function call(): void {
      const phone = menu.store?.phone;
      if (phone) uni.makePhoneCall({ phoneNumber: phone, fail: () => undefined });
    }

    return { app, menu, known, hotDishes, boot, goMenu, onLink, call, yuan, STORE_NOT_FOUND: ErrorCode.STORE_NOT_FOUND };
  },

  onLoad(query) {
    void this.boot(Number(query?.storeId ?? 0), false);
  },

  onShow() {
    // 从菜单页返回时刷新：平台端刚发布的新配置与沽清状态都要能立刻反映到首页
    void this.app.loadConfig();
    if (this.menu.storeId) void this.boot(this.menu.storeId, true);
  },
});
</script>

<template>
  <view class="home" :style="app.cssVars">
    <view class="head">
      <view class="head__main">
        <text class="head__name">{{ menu.store?.name || '加载中' }}</text>
        <view class="head__meta">
          <text class="dot" :class="menu.store?.orderable ? 'dot--on' : 'dot--off'" />
          <text class="head__status">{{ menu.store?.businessStatusLabel || '' }}</text>
          <text v-if="menu.store?.address" class="head__addr">{{ menu.store.address }}</text>
        </view>
      </view>
      <view v-if="menu.store?.phone" class="head__phone" @click="call">电话</view>
    </view>

    <view v-if="menu.loading && !menu.categories.length" class="skeleton">
      <view class="skeleton__line" style="width: 60%" />
      <view class="skeleton__line" style="width: 100%" />
      <view class="skeleton__line" style="width: 80%" />
    </view>

    <view v-else-if="menu.error && !menu.categories.length" class="failed">
      <text class="failed__title">
        {{ menu.errorCode === STORE_NOT_FOUND ? '二维码已失效' : '没能加载到店信息' }}
      </text>
      <text class="failed__line">
        {{ menu.errorCode === STORE_NOT_FOUND
          ? '这家店可能已下线、暂停服务或二维码过期，请向店员索取当前有效的点餐码。'
          : menu.error }}
      </text>
      <view class="failed__btn" @click="boot(menu.storeId, true)">重试</view>
    </view>

    <template v-else>
      <!-- 后端 sections 的数组顺序 = 首页从上到下的渲染顺序 -->
      <block v-for="section in known" :key="section.id">
        <HomeBanner v-if="section.key === 'banner'" :config="section.props" @link="onLink" />
        <HomeNotice v-else-if="section.key === 'notice'" :config="section.props" />
        <HomeCategoryNav
          v-else-if="section.key === 'categoryNav'"
          :config="section.props"
          :categories="menu.categories"
          @pick="goMenu({ categoryId: $event })"
        />
        <HomeHotDishes
          v-else-if="section.key === 'hotDishes'"
          :config="section.props"
          :dishes="hotDishes"
          @pick="goMenu({ dishId: $event.id })"
        />
      </block>

      <view class="gap" />

      <view class="summary">
        <text class="summary__text">本店 {{ menu.dishTotal }} 道在售</text>
        <text v-if="menu.soldOutTotal" class="summary__sub">{{ menu.soldOutTotal }} 道今日售罄</text>
      </view>

      <view class="foot">
        <view class="btn" :class="{ 'is-off': !menu.store?.orderable }" @click="goMenu({})">
          {{ menu.store?.orderable ? '进入点餐' : menu.store?.orderableHint || '本店当前不接单' }}
        </view>
        <text v-if="menu.store && !menu.store.orderable" class="foot__note">仍可浏览菜单，下单请联系店员</text>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.home {
  min-height: 100vh;
  padding-bottom: 40rpx;
  background-color: var(--page-bg, #fff);
  color: var(--ink, #{$n-900});
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  padding: 40rpx 32rpx 32rpx;

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 44rpx;
    font-weight: 700;
    letter-spacing: -1rpx;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 10rpx;
    margin-top: 12rpx;
  }

  &__status {
    font-size: 22rpx;
    color: var(--ink-2, #{$n-600});
  }

  &__addr {
    font-size: 22rpx;
    color: $n-400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__phone {
    flex: none;
    padding: 0 26rpx;
    height: 60rpx;
    line-height: 60rpx;
    border: 1rpx solid $n-200;
    font-size: 24rpx;
    color: var(--ink-2, #{$n-600});
  }
}

.skeleton {
  padding: 24rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;

  &__line {
    height: 24rpx;
    background-color: $n-100;
  }
}

.failed {
  padding: 120rpx 48rpx;
  text-align: center;

  &__title {
    display: block;
    font-size: 32rpx;
    font-weight: 600;
  }

  &__line {
    display: block;
    margin-top: 14rpx;
    font-size: 24rpx;
    line-height: 1.6;
    color: $n-500;
  }

  &__btn {
    display: inline-block;
    margin-top: 40rpx;
    padding: 0 48rpx;
    height: 72rpx;
    line-height: 72rpx;
    border: 1rpx solid var(--brand, #{$brand-500});
    border-radius: 999rpx;
    font-size: 26rpx;
    color: var(--brand, #{$brand-500});
  }
}

.summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 28rpx 32rpx 0;

  &__text {
    font-size: 24rpx;
    color: var(--ink-2, #{$n-600});
  }

  &__sub {
    font-size: 22rpx;
    color: $n-400;
  }
}

.foot {
  padding: 40rpx 32rpx 0;

  &__note {
    display: block;
    margin-top: 18rpx;
    text-align: center;
    font-size: 22rpx;
    color: $n-400;
  }
}
</style>
