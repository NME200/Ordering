<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { SectionProps } from '@/types/api';

/**
 * 规则入口（ui.md 第 13 节右上角的「使用规则」）。
 *
 * 跳转目标由配置给，页面只负责执行：装修端还没配 link 时点下去由页面提示，
 * 组件不自己兜一个「/pages/coupon/rule」这种并不存在的页面。
 */
export default defineComponent({
  name: 'DiyRuleEntry',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
  },
  emits: { link: (_link?: string) => true },
});
</script>

<template>
  <view class="rule" @click="$emit('link', config.link)">
    <text class="rule__text">{{ config.text || '使用规则' }}</text>
    <LineIcon name="right" :size="14" tone="sub" />
  </view>
</template>

<style scoped lang="scss">
.rule {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 8rpx 4rpx;
}

.rule__text {
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}

.rule:active .rule__text {
  color: var(--brand, #c8752b);
}
</style>
