<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { SectionProps } from '@/types/api';

/** 搜索框：本身不输入，点到搜索页（首页默认不启用这个组件） */
export default defineComponent({
  name: 'DiySearchBar',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
  },
  emits: { link: (_link?: string) => true },
  setup(props, { emit }) {
    return { props, emit };
  },
});
</script>

<template>
  <view class="search" @click="emit('link', props.config.link)">
    <LineIcon name="search" :size="18" tone="sub" />
    <text class="search__ph">{{ props.config.placeholder || '搜索门店' }}</text>
  </view>
</template>

<style scoped lang="scss">
.search {
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 76rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background-color: var(--card-bg, rgba(255, 255, 255, 0.7));
  backdrop-filter: blur(20px);
}

.search__ph {
  font-size: 28rpx;
  color: var(--ink-2, #{$n-500});
}
</style>
