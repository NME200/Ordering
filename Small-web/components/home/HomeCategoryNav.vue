<script setup lang="ts">
import { computed } from 'vue';
import type { MenuCategory, SectionProps } from '@/types/api';

/**
 * 分类导航（装修模块 categoryNav）。
 *
 * 列数与「是否显示全部」由平台下发；分类本身来自本店真实菜单 ——
 * 没上菜的分类不该出现在入口里，所以这里按菜单实际有的分类渲染。
 */
const props = defineProps<{ config: SectionProps; categories: MenuCategory[] }>();

const emit = defineEmits<{ (event: 'pick', categoryId: number | 'all'): void }>();

const cells = computed<{ id: number | 'all'; name: string }[]>(() => {
  const list = props.categories
    .filter((category) => category.dishes.length > 0)
    .map((category) => ({ id: category.id, name: category.name }));
  return props.config.showAll === false ? list : [...list, { id: 'all' as const, name: '全部' }];
});

const columns = computed(() => props.config.columns || 4);
</script>

<template>
  <view v-if="cells.length" class="nav">
    <text v-if="config.title" class="nav__title">{{ config.title }}</text>
    <view class="nav__grid" :style="{ gridTemplateColumns: `repeat(${columns}, 1fr)` }">
      <view
        v-for="cell in cells"
        :key="String(cell.id)"
        class="nav__cell"
        @click="emit('pick', cell.id)"
      >
        <view class="nav__mark">
          <text class="nav__char">{{ cell.name.slice(0, 1) }}</text>
        </view>
        <text class="nav__name">{{ cell.name }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.nav {
  padding: 8rpx 32rpx 0;

  &__title {
    display: block;
    margin-bottom: 24rpx;
    font-size: 26rpx;
    font-weight: 600;
  }

  &__grid {
    display: grid;
    gap: 28rpx 0;
  }

  &__cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10rpx;
  }

  &__mark {
    width: 76rpx;
    height: 76rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1rpx solid $n-200;
  }

  &__char {
    font-size: 30rpx;
    color: var(--brand, #{$brand-500});
  }

  &__name {
    font-size: 22rpx;
    color: var(--ink-2, #{$n-600});
  }
}
</style>
