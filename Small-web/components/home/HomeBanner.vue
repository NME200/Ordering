<script setup lang="ts">
import type { SectionProps } from '@/types/api';

/**
 * 首页轮播（装修模块 banner）。
 *
 * 高度、圆角、图片与跳转路径全部来自后端 props；一张图都没配时**整块不渲染**，
 * 而不是留一个空灰框 —— 首页少一块比空一块好看。
 */
defineProps<{ config: SectionProps }>();

const emit = defineEmits<{ (event: 'link', target: string): void }>();

function tap(link?: string): void {
  if (link) emit('link', link);
}
</script>

<template>
  <view v-if="config.images && config.images.length" class="banner">
    <swiper
      class="banner__swiper"
      :style="{ height: `${config.height || 160}px`, borderRadius: `${config.radius ?? 0}px` }"
      :circular="config.images.length > 1"
      :autoplay="config.images.length > 1"
      :interval="4000"
      indicator-dots="true"
      indicator-color="rgba(255,255,255,.4)"
      indicator-active-color="#ffffff"
    >
      <swiper-item v-for="(image, index) in config.images" :key="index" @click="tap(image.link)">
        <image class="banner__img" :src="image.url" mode="aspectFill" />
      </swiper-item>
    </swiper>
  </view>
</template>

<style scoped lang="scss">
.banner {
  padding: 0 32rpx;

  &__swiper {
    width: 100%;
    overflow: hidden;
    background-color: $n-100;
  }

  &__img {
    width: 100%;
    height: 100%;
    display: block;
  }
}
</style>
