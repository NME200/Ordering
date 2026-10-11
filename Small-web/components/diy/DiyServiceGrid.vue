<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { IconItem, SectionProps } from '@/types/api';

/**
 * 服务功能宫格。
 *
 * 项由平台配置（增删改排序显隐），但**键是闭合的**：每个键都对应一个真页面或真动作，
 * 装修不该决定小程序里有没有某个功能。目标页还没做时由 utils/nav 如实提示。
 */
export default defineComponent({
  name: 'DiyServiceGrid',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    /** key → 角标数字（比如「我的优惠券」有几张） */
    badges: { type: Object as PropType<Record<string, number>>, default: () => ({}) },
  },
  emits: { pick: (_item: IconItem & { key?: string; link?: string }) => true },
  setup(props) {
    const items = computed(() => (props.config.items ?? []).filter((item) => item.enabled !== false));
    const cols = computed(() => props.config.cols ?? 3);
    const gridStyle = computed(() => `grid-template-columns:repeat(${cols.value},1fr)`);
    return { items, gridStyle };
  },
});
</script>

<template>
  <view v-if="items.length" class="service card">
    <text v-if="config.title" class="service__title">{{ config.title }}</text>
    <view class="service__grid" :style="gridStyle">
      <view
        v-for="item in items"
        :key="item.key || item.text"
        class="service__cell"
        @click="$emit('pick', item)"
      >
        <view class="service__icon">
          <LineIcon :name="item.icon" :size="22" tone="brand" />
          <text v-if="badges[item.key || ''] > 0" class="service__badge num">
            {{ badges[item.key || ''] }}
          </text>
        </view>
        <text class="service__text">{{ item.text }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.service {
  padding: 28rpx 24rpx 24rpx;
}

.service__title {
  display: block;
  padding: 0 8rpx 16rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--brand-sub, #{$n-700});
}

.service__grid {
  display: grid;
  gap: 8rpx;
}

.service__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx 0 12rpx;
  border-radius: var(--radius-tile, 12px);
}

.service__cell:active {
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.service__icon {
  position: relative;
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
}

.service__badge {
  position: absolute;
  top: -4rpx;
  right: -8rpx;
  min-width: 30rpx;
  height: 30rpx;
  line-height: 30rpx;
  padding: 0 8rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: var(--brand, #c8752b);
  color: #fff;
  font-size: 20rpx;
}

.service__text {
  font-size: 24rpx;
  color: var(--ink, #{$n-900});
}
</style>
