<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { SectionProps } from '@/types/api';

/**
 * 资产栏（余额 / 积分 / 优惠券）。
 *
 * 值由页面传进来，**没有的数不摆 0**：顾客账号与营销域还没落地时统一画 `—`，
 * 0 会被读成「我有很多但一分没有」，那是假数据里最坏的一种。
 */
export default defineComponent({
  name: 'DiyAssetBar',
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    /** key → 展示值；未提供的键画占位符 */
    values: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
  },
  emits: { pick: (_key: string) => true },
});
</script>

<template>
  <view v-if="(config.items || []).length" class="asset card">
    <view
      v-for="item in config.items"
      :key="item.key"
      class="asset__cell"
      @click="$emit('pick', item.key || '')"
    >
      <text class="asset__value num">{{ values[item.key || ''] || '—' }}</text>
      <text class="asset__label">{{ item.label || item.text }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.asset {
  display: flex;
  padding: 32rpx 0;
}

.asset__cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.asset__value {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--ink, #{$n-900});
}

.asset__label {
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}
</style>
