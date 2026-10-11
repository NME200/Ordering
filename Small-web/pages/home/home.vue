<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import DiyBanner from '@/components/diy/DiyBanner.vue';
import DiyCouponEntry from '@/components/diy/DiyCouponEntry.vue';
import DiyEntryGrid from '@/components/diy/DiyEntryGrid.vue';
import DiyNotice from '@/components/diy/DiyNotice.vue';
import DiySearchBar from '@/components/diy/DiySearchBar.vue';
import DiyShopList from '@/components/diy/DiyShopList.vue';
import PopupLayer from '@/components/PopupLayer.vue';
import { fetchStores } from '@/api/public';
import { useAppStore } from '@/store/app';
import { distanceLabel, distanceMeters, locate } from '@/utils/geo';
import { openLink } from '@/utils/nav';
import { triggerPopup } from '@/utils/popup-manager';
import { applyScanQuery, applyScanResult } from '@/utils/scan';
import type { PublicStoreListItem, SectionKey } from '@/types/api';

/** 这一版小程序认识的首页组件；白名单外的 key 整块跳过，后端加组件不会打挂老版本 */
const KNOWN_KEYS: SectionKey[] = ['banner', 'entryGrid', 'searchBar', 'notice', 'shopList', 'couponEntry'];

/** 记住上次进的门店：从「我的小程序」重进时没有扫码参数 */
const STORE_KEY = 'last-store-id-v1';

export default defineComponent({
  components: { DiyBanner, DiyCouponEntry, DiyEntryGrid, DiyNotice, DiySearchBar, DiyShopList, PopupLayer },

  setup() {
    const app = useAppStore();
    /** 冷启动弹窗只在第一次进首页时按 app_launch 场景触发 */
    const firstShow = ref(true);

    const shops = ref<PublicStoreListItem[]>([]);
    const distances = ref<Record<number, string>>({});

    const sections = computed(() =>
      app.sectionsOf('home').filter((item) => KNOWN_KEYS.includes(item.key)),
    );
    /** 只有首页真摆了门店列表位，才值得去拉门店列表与定位 */
    const needsShops = computed(() => sections.value.some((item) => item.key === 'shopList'));

    /**
     * 距离在前端算：后端不收顾客位置（匿名接口不该知道它，且人一动就变）。
     * 拒绝授权是常态，所以不弹提示、不引导去设置 —— 少显示一行比打断点餐重要。
     */
    async function loadShops(): Promise<void> {
      if (!needsShops.value) return;
      const limit = sections.value.find((item) => item.key === 'shopList')?.props.limit ?? 6;
      try {
        const res = await fetchStores({ limit: 20 });
        const here = await locate();
        app.position = here;
        const list: PublicStoreListItem[] = [];
        const map: Record<number, string> = {};
        for (const store of res.stores) {
          if (here && store.latitude !== null && store.longitude !== null) {
            const meters = distanceMeters(here.latitude, here.longitude, store.latitude, store.longitude);
            if (meters !== null) map[store.id] = distanceLabel(meters).replace('距您 ', '');
          }
          list.push(store);
        }
        const sortMode = sections.value.find((item) => item.key === 'shopList')?.props.sortMode ?? 'distance';
        if (sortMode === 'sales') list.sort((a, b) => b.monthlySales - a.monthlySales);
        else list.sort((a, b) => (map[a.id] ? 1 : 0) - (map[b.id] ? 1 : 0));
        shops.value = list.slice(0, limit);
        distances.value = map;
      } catch {
        shops.value = [];
      }
    }

    /**
     * 页内「扫一扫」进店。
     *
     * 解析统一走 utils/scan：桌码里是 `s=门店&t=桌号`，也可能是店码（只有门店）
     * 或早期那种纯数字门店 ID 的码。这里再写一份正则的话，桌码格式一改就悄悄失效
     * （上一版就是这么把桌码判成「没有门店信息」的）。
     */
    function scan(): void {
      uni.scanCode({
        success: (res) => {
          const raw = res as { scene?: string; path?: string; result?: string };
          const hit = applyScanResult(raw);
          if (hit) {
            enterStore(hit.storeId);
            return;
          }
          /**
           * 读到了什么要说出来。
           *
           * 「这个码里没有门店信息」这句话 covering 四种完全不同的情况：
           * 扫到外卖平台的码、贴错桌、码本身没问题但扫的是**未发布小程序的正式版码**、
           * 以及在开发者工具模拟器里扫小程序码（那种情况下微信根本不给 scene）。
           * 不把读到的内容带出来，谁都分不清是哪一种。
           */
          const read = [raw.scene, raw.path, raw.result].filter(Boolean).join(' / ').slice(0, 40);
          uni.showToast({
            title: read ? `这个码读不出门店：${read}` : '没读到内容，请用微信扫一扫桌上的码',
            icon: 'none',
            duration: 4000,
          });
        },
        fail: () => uni.showToast({ title: '没能读到二维码', icon: 'none' }),
      });
    }

    function enterStore(storeId: number): void {
      uni.setStorageSync(STORE_KEY, storeId);
      uni.navigateTo({ url: `/pages/menu/menu?storeId=${storeId}` });
    }

    function onLink(link?: string): void {
      openLink(link, { scan });
    }

    return {
      app,
      firstShow,
      sections,
      shops,
      distances,
      loadShops,
      onLink,
      enterStore,
      scan,
    };
  },

  onLoad(query) {
    void this.app.loadConfig();
    // 扫码进入小程序时 scene / storeId 在启动参数上：认出来就直接带进那家店
    const hit = applyScanQuery((query ?? {}) as Record<string, unknown>);
    if (hit) this.enterStore(hit.storeId);
  },

  onShow() {
    void this.app.loadConfig();
    void this.loadShops();
    /**
     * 首次进首页跑冷启动场景（延迟 900ms 等首屏画完，别糊在白屏上），
     * 之后回首页跑 home 场景 —— 两者都靠本地频次记录拦重复。
     */
    if (this.firstShow) {
      this.firstShow = false;
      void triggerPopup('app_launch', { delay: 900 });
    } else {
      void triggerPopup('home');
    }
  },

  onPullDownRefresh() {
    void Promise.all([this.app.loadConfig(), this.loadShops()]).finally(() =>
      uni.stopPullDownRefresh(),
    );
  },
});
</script>

<template>
  <view class="home" :style="app.cssVars">
    <!-- 参考稿：顶部品牌大图 + 五个场景入口，不放定位栏、不放附近商户推荐 -->
    <block v-for="section in sections" :key="section.id">
      <DiyBanner v-if="section.key === 'banner'" :config="section.props" @link="onLink" />
      <DiySearchBar v-else-if="section.key === 'searchBar'" :config="section.props" @link="onLink" />
      <DiyEntryGrid v-else-if="section.key === 'entryGrid'" :config="section.props" @link="onLink" />
      <DiyNotice v-else-if="section.key === 'notice'" :config="section.props" />
      <DiyShopList
        v-else-if="section.key === 'shopList'"
        :config="section.props"
        :stores="shops"
        :distances="distances"
        @enter="enterStore"
        @more="onLink('/pages/stores/stores')"
      />
      <DiyCouponEntry v-else-if="section.key === 'couponEntry'" :config="section.props" @link="onLink" />
    </block>

    <!-- 一个组件都没配时（平台把配置删光）留一条扫码入口，首页不能是空的 -->
    <view v-if="!sections.length" class="fallback card">
      <text class="fallback__title">扫码点餐</text>
      <text class="fallback__sub">扫桌上的点餐码即可下单，无需注册</text>
      <view class="btn-main fallback__btn" @click="scan">扫一扫点餐</view>
    </view>

    <PopupLayer />
  </view>
</template>

<style scoped lang="scss">
.home {
  min-height: 100vh;
  padding: var(--page-margin, 16px) var(--page-margin, 16px) 80rpx;
  display: flex;
  flex-direction: column;
  gap: var(--section-gap, 12px);
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.fallback {
  margin-top: 120rpx;
  padding: 64rpx 48rpx;
  text-align: center;

  &__title {
    display: block;
    font-size: 44rpx;
    font-weight: 700;
  }

  &__sub {
    display: block;
    margin-top: 16rpx;
    font-size: 26rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__btn {
    margin-top: 56rpx;
  }
}
</style>
