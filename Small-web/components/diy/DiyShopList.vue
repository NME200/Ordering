<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import StoreCard from '@/components/StoreCard.vue';
import type { PublicStoreListItem, SectionProps } from '@/types/api';

/** 首页的门店列表位：默认不启用，平台打开后首页就能直接选店 */
export default defineComponent({
  name: 'DiyShopList',
  components: { StoreCard },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    stores: { type: Array as PropType<PublicStoreListItem[]>, default: () => [] },
    /** storeId → 「距您 320m」，由页面算好传进来（组件不碰定位授权） */
    distances: { type: Object as PropType<Record<number, string>>, default: () => ({}) },
  },
  emits: { enter: (_storeId: number) => true, more: () => true },
});
</script>

<template>
  <view v-if="stores.length" class="shops">
    <view class="shops__head">
      <text class="shops__title">{{ config.title || '附近门店' }}</text>
      <text class="shops__more" @click="$emit('more')">全部 ›</text>
    </view>
    <view class="shops__list">
      <StoreCard
        v-for="item in stores"
        :key="item.id"
        :store="item"
        :distance="distances[item.id] || ''"
        class="shops__item"
        @enter="$emit('enter', $event)"
      />
    </view>
  </view>
</template>

<style scoped lang="scss">
.shops__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 4rpx 16rpx;
}

.shops__title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--brand-sub, #{$n-700});
}

.shops__more {
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}

.shops__list {
  display: flex;
  flex-direction: column;
  gap: var(--card-gap, 8px);
}
</style>
