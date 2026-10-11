<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import StoreCard from '@/components/StoreCard.vue';
import { fetchStores } from '@/api/public';
import { useAppStore } from '@/store/app';
import { distanceLabel, distanceMeters, locate } from '@/utils/geo';
import type { PublicStoreListItem } from '@/types/api';

type SortKey = 'recommend' | 'distance' | 'sales';

const SORT_LABELS: Record<SortKey, string> = {
  recommend: '综合排序',
  distance: '距离最近',
  sales: '销量最高',
};

/** 参考稿的三个排序项里「评分」被去掉：后端没有评价表，不摆一个算不出来的维度 */
const SORTS: SortKey[] = ['recommend', 'distance', 'sales'];

export default defineComponent({
  components: { LineIcon, StoreCard },

  setup() {
    const app = useAppStore();

    const all = ref<PublicStoreListItem[]>([]);
    const distances = ref<Record<number, number>>({});
    const loading = ref(false);
    const error = ref('');
    const keyword = ref('');
    const sort = ref<SortKey>('recommend');
    const sheetOpen = ref(false);

    async function load(): Promise<void> {
      loading.value = true;
      error.value = '';
      try {
        const res = await fetchStores({ keyword: keyword.value || undefined, limit: 50 });
        const here = app.position ?? (await locate());
        app.position = here;
        const map: Record<number, number> = {};
        if (here) {
          for (const store of res.stores) {
            const meters = distanceMeters(here.latitude, here.longitude, store.latitude, store.longitude);
            if (meters !== null) map[store.id] = meters;
          }
        }
        all.value = res.stores;
        distances.value = map;
      } catch (cause) {
        error.value = (cause as Error).message || '门店列表加载失败';
      } finally {
        loading.value = false;
      }
    }

    const stores = computed(() => {
      const list = [...all.value];
      if (sort.value === 'distance') {
        // 没有坐标或没授权定位的门店排到最后，而不是显示「距您 —」冒充已知距离
        return list.sort(
          (a, b) => (distances.value[a.id] ?? Number.MAX_SAFE_INTEGER) - (distances.value[b.id] ?? Number.MAX_SAFE_INTEGER),
        );
      }
      if (sort.value === 'sales') return list.sort((a, b) => b.monthlySales - a.monthlySales);
      return list;
    });

    const sortLabel = computed(() => SORT_LABELS[sort.value]);

    function pickSort(next: SortKey): void {
      sort.value = next;
      sheetOpen.value = false;
    }

    function enter(storeId: number): void {
      uni.navigateTo({ url: `/pages/menu/menu?storeId=${storeId}` });
    }

    function label(store: PublicStoreListItem): string {
      const meters = distances.value[store.id];
      return meters === undefined ? '' : distanceLabel(meters);
    }

    return { app, all, stores, loading, error, keyword, sort, sortLabel, sheetOpen, SORTS, SORT_LABELS, load, pickSort, enter, label };
  },

  onLoad() {
    void this.app.loadConfig();
    void this.load();
  },

  onPullDownRefresh() {
    void this.load().finally(() => uni.stopPullDownRefresh());
  },
});
</script>

<template>
  <view class="stores" :style="app.cssVars">
    <view class="stores__search">
      <LineIcon name="search" :size="18" tone="sub" />
      <input
        v-model="keyword"
        class="stores__input"
        type="text"
        placeholder="搜索门店"
        placeholder-class="stores__ph"
        confirm-type="search"
        @confirm="load"
      />
      <text v-if="keyword" class="stores__clear" @click="keyword = ''; load()">清除</text>
    </view>

    <view class="stores__head">
      <text class="stores__title">全部门店</text>
      <view class="stores__sort" @click="sheetOpen = !sheetOpen">
        <text>{{ sortLabel }}</text>
        <LineIcon name="down" :size="14" tone="sub" />
      </view>
    </view>

    <view v-if="sheetOpen" class="stores__sheet">
      <view
        v-for="item in SORTS"
        :key="item"
        class="stores__sheet-item"
        :class="{ 'is-on': sort === item }"
        @click="pickSort(item)"
      >
        {{ SORT_LABELS[item] }}
      </view>
    </view>

    <view v-if="error" class="stores__error">
      <text>{{ error }}</text>
      <text class="stores__retry" @click="load">重试</text>
    </view>

    <template v-else>
      <view v-if="!loading && !stores.length" class="stores__empty">
        <text>没有符合条件的门店</text>
      </view>
      <view class="stores__list">
        <StoreCard
          v-for="item in stores"
          :key="item.id"
          :store="item"
          :distance="label(item)"
          @enter="enter"
        />
      </view>
      <text v-if="stores.length" class="stores__end">已全部加载完成</text>
    </template>
  </view>
</template>

<style scoped lang="scss">
.stores {
  min-height: 100vh;
  padding: var(--content-pad, 28rpx) var(--content-pad, 28rpx) 60rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.stores__search {
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 76rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background-color: var(--card-bg, rgba(255, 255, 255, 0.7));
  backdrop-filter: blur(20px);
}

.stores__input {
  flex: 1;
  font-size: 28rpx;
  color: var(--ink, #{$n-900});
}

.stores__ph {
  color: var(--ink-2, #{$n-500});
}

.stores__clear {
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}

.stores__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 32rpx 4rpx 20rpx;
}

.stores__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--brand-sub, #{$n-700});
}

.stores__sort {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 26rpx;
  color: var(--ink-2, #{$n-500});
}

.stores__sheet {
  display: flex;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.stores__sheet-item {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background-color: var(--card-bg, rgba(255, 255, 255, 0.7));
  font-size: 26rpx;
  color: var(--ink-2, #{$n-500});
}

.stores__sheet-item.is-on {
  background-color: var(--brand, #c8752b);
  color: #fff;
}

.stores__list {
  display: flex;
  flex-direction: column;
  gap: var(--card-gap, 8px);
}

.stores__error,
.stores__empty {
  padding: 120rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: var(--ink-2, #{$n-500});
}

.stores__retry {
  margin-left: 20rpx;
  color: var(--brand, #c8752b);
}

.stores__end {
  display: block;
  margin-top: 36rpx;
  text-align: center;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}
</style>
