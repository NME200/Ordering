<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { SectionProps } from '@/types/api';

/** 我的订单四入口：角标是本页订单缓存里的真实条数，没有就不显示 */
export default defineComponent({
  name: 'DiyOrderEntry',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    counts: { type: Object as PropType<Record<string, number>>, default: () => ({}) },
  },
  emits: { pick: (_item: { key?: string; link?: string }) => true },
});
</script>

<template>
  <view v-if="(config.items || []).length" class="orders card">
    <view class="orders__head">
      <text class="orders__title">{{ config.title || '我的订单' }}</text>
    </view>
    <view class="orders__grid">
      <view
        v-for="item in config.items"
        :key="item.key"
        class="orders__cell"
        @click="$emit('pick', item)"
      >
        <view class="orders__icon">
          <LineIcon :name="item.icon || 'order'" :size="22" tone="ink" />
          <text v-if="counts[item.key || ''] > 0" class="orders__badge num">
            {{ counts[item.key || ''] > 99 ? '99+' : counts[item.key || ''] }}
          </text>
        </view>
        <text class="orders__text">{{ item.text }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.orders {
  padding: 28rpx 24rpx 20rpx;
}

.orders__head {
  padding: 0 8rpx 12rpx;
}

.orders__title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--brand-sub, #{$n-700});
}

.orders__grid {
  display: flex;
}

.orders__cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 16rpx 0;
}

.orders__icon {
  position: relative;
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  border: 1rpx solid var(--divider, #{$n-200});
  display: flex;
  align-items: center;
  justify-content: center;
}

.orders__badge {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  padding: 0 8rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: var(--brand, #c8752b);
  color: #fff;
  font-size: 20rpx;
}

.orders__text {
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}
</style>
