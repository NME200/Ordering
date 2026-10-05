<script setup lang="ts">
import { yuan } from '@/utils/format';
import type { MenuDish, SectionProps } from '@/types/api';

/**
 * 热销 / 推荐位（装修模块 hotDishes）。
 *
 * 取菜方式由平台配置决定（自动取推荐菜，或按手选 ID 的顺序），
 * 组件只负责画传进来的那几道 —— 口径判断留在页面里，方便菜单页复用同一份数据。
 */
defineProps<{ config: SectionProps; dishes: MenuDish[] }>();

const emit = defineEmits<{ (event: 'pick', dish: MenuDish): void }>();
</script>

<template>
  <view v-if="dishes.length" class="hot">
    <view class="hot__head">
      <text class="hot__title">{{ config.title || '本店热销' }}</text>
      <text v-if="config.source === 'recommend'" class="hot__note">按推荐菜自动取</text>
    </view>
    <scroll-view class="hot__scroll" scroll-x :show-scrollbar="false">
      <view class="hot__row">
        <view v-for="dish in dishes" :key="dish.id" class="card" @click="emit('pick', dish)">
          <image v-if="dish.imageUrl" class="card__img" :src="dish.imageUrl" mode="aspectFill" />
          <view v-else class="card__img card__img--text">
            <text>{{ dish.name.slice(0, 1) }}</text>
          </view>
          <text class="card__name">{{ dish.name }}</text>
          <text v-if="config.showPrice !== false" class="card__price num">¥{{ yuan(dish.price) }}</text>
          <text v-else class="card__sold">
            {{ dish.soldOut ? '今日售罄' : `${dish.unit}起` }}
          </text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<style scoped lang="scss">
.hot {
  padding-top: 8rpx;

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 32rpx 20rpx;
  }

  &__title {
    font-size: 26rpx;
    font-weight: 600;
  }

  &__note {
    font-size: 20rpx;
    color: $n-400;
  }

  &__scroll {
    width: 100%;
    white-space: nowrap;
  }

  &__row {
    display: inline-flex;
    gap: 20rpx;
    padding: 0 32rpx 4rpx;
  }
}

.card {
  width: 200rpx;
  flex: none;

  &__img {
    width: 200rpx;
    height: 150rpx;
    display: block;
    background-color: $n-100;

    &--text {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--brand, #{$brand-500});
      font-size: 44rpx;
    }
  }

  &__name {
    display: block;
    margin-top: 14rpx;
    font-size: 26rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__price {
    display: block;
    margin-top: 6rpx;
    font-size: 26rpx;
    font-weight: 600;
    color: var(--brand, #{$brand-500});
  }

  &__sold {
    display: block;
    margin-top: 6rpx;
    font-size: 22rpx;
    color: $n-400;
  }
}
</style>
