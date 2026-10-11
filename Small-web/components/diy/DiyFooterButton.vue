<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import type { SectionProps } from '@/types/api';

/**
 * 底部主按钮（ui.md 第 15 节：未开通「立即开通会员」/ 已开通「查看我的权益」）。
 *
 * 文案切换由页面传进来的 `opened` 决定，组件自己不看数据 ——
 * 「是否已开通」在会员档案里，不在装修配置里，配置只决定文案与跳转。
 */
export default defineComponent({
  name: 'DiyFooterButton',
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    opened: { type: Boolean, default: false },
  },
  emits: { pick: (_link?: string) => true },
  setup(props) {
    const text = computed(() => {
      const openedText = props.config.openedText || '查看我的权益';
      const closedText = props.config.text || '立即开通会员';
      return props.opened ? openedText : closedText;
    });
    return { text };
  },
});
</script>

<template>
  <view class="footer-btn" @click="$emit('pick', config.link)">
    <view class="btn-main footer-btn__inner">{{ text }}</view>
  </view>
</template>

<style scoped lang="scss">
.footer-btn {
  padding: 8rpx 0 0;
}

.footer-btn__inner {
  font-size: 30rpx;
}

.footer-btn__inner:active {
  opacity: 0.9;
}
</style>
