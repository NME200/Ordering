<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { PublicStoreListItem } from '@/types/api';

/**
 * 门店卡片（「查看门店」与首页门店列表共用一个）。
 *
 * 只显示后端真有数据的字段：店名、月售、距离、营业时间、营业状态。
 * 参考稿里的**评分与起送价刻意不画** —— 没有评价表与配送费模型，摆出来就是假数据。
 */
export default defineComponent({
  name: 'StoreCard',
  components: { LineIcon },
  props: {
    store: { type: Object as PropType<PublicStoreListItem>, required: true },
    /** 已格式化好的「距您 320m」，未授权定位或门店无坐标时为空 */
    distance: { type: String, default: '' },
  },
  emits: { enter: (_storeId: number) => true },
});
</script>

<template>
  <view class="store card" @click="$emit('enter', store.id)">
    <view class="store__logo">
      <image v-if="store.logo" class="store__logo-img" :src="store.logo" mode="aspectFill" />
      <text v-else class="store__logo-text">{{ store.name.slice(0, 1) }}</text>
    </view>

    <view class="store__body">
      <text class="store__name">{{ store.name }}</text>
      <view class="store__meta">
        <text v-if="store.monthlySales > 0" class="store__meta-item num">月售 {{ store.monthlySales }}</text>
        <text v-if="distance" class="store__meta-item num">{{ distance }}</text>
        <text v-if="store.businessHours" class="store__meta-item">{{ store.businessHours }}</text>
      </view>
      <view class="store__row">
        <view class="store__status">
          <view class="dot" :class="store.orderable ? 'dot--on' : 'dot--off'" />
          <text class="store__status-text">{{ store.orderable ? store.businessStatusLabel : store.orderableHint }}</text>
        </view>
        <view class="store__enter" @click.stop="$emit('enter', store.id)">
          <text>进店</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.store {
  display: flex;
  gap: 24rpx;
  padding: 28rpx;
}

.store__logo {
  width: 112rpx;
  height: 112rpx;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.store__logo-img {
  width: 100%;
  height: 100%;
}

.store__logo-text {
  font-size: 44rpx;
  font-weight: 600;
  color: var(--brand, #c8752b);
}

.store__body {
  flex: 1;
  min-width: 0;
}

.store__name {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: var(--ink, #{$n-900});
}

.store__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 24rpx;
  margin-top: 10rpx;
}

.store__meta-item {
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}

.store__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
}

.store__status {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.store__status-text {
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}

/* 参考稿是橙色描边按钮，这里保持同一形状但更收一点 */
.store__enter {
  padding: 10rpx 30rpx;
  border: 1rpx solid var(--brand, #c8752b);
  border-radius: 999rpx;
  color: var(--brand, #c8752b);
  font-size: 26rpx;
}
</style>
