<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import type { SectionProps } from '@/types/api';

/** 品牌轮播：只画平台配过的图，一张都没有就整块不占位 */
export default defineComponent({
  name: 'DiyBanner',
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
  },
  emits: { link: (_link?: string) => true },
  setup(props, { emit }) {
    const images = computed(() => props.config.images ?? []);
    const style = computed(() => {
      const height = props.config.height ?? 200;
      const radius = props.config.radius ?? 0;
      return `height:${height * 2}rpx;border-radius:${radius * 2}rpx`;
    });
    const indicator = computed(() => props.config.indicatorColor ?? '');
    const autoplay = computed(() => (props.config.interval ?? 3000) > 0);
    const interval = computed(() => props.config.interval ?? 3000);

    return { images, style, indicator, autoplay, interval, emit };
  },
});
</script>

<template>
  <swiper
    v-if="images.length"
    class="banner"
    :style="style"
    :autoplay="autoplay"
    :interval="interval"
    :circular="images.length > 1"
    :indicator-dots="images.length > 1"
    :indicator-active-color="indicator || undefined"
  >
    <swiper-item v-for="(item, index) in images" :key="index" @click="emit('link', item.link)">
      <image class="banner__img" :src="item.url" mode="aspectFill" />
    </swiper-item>
  </swiper>
</template>

<style scoped lang="scss">
.banner {
  width: 100%;
  overflow: hidden;
}

.banner__img {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
