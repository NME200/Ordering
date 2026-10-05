<script setup lang="ts">
import type { SectionProps } from '@/types/api';

/** 公告栏（装修模块 notice）：底色与文字色由平台下发，空文案整块不渲染 */
defineProps<{ config: SectionProps }>();
</script>

<template>
  <view
    v-if="config.text"
    class="notice"
    :style="{ backgroundColor: config.bgColor || 'transparent', color: config.textColor || 'inherit' }"
  >
    <image v-if="config.iconUrl" class="notice__icon" :src="config.iconUrl" mode="aspectFit" />
    <text class="notice__text">{{ config.text }}</text>
  </view>
</template>

<style scoped lang="scss">
.notice {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 0 32rpx;
  padding: 18rpx 24rpx;

  &__icon {
    width: 28rpx;
    height: 28rpx;
    flex: none;
  }

  &__text {
    flex: 1;
    font-size: 24rpx;
    line-height: 1.5;
  }
}
</style>
