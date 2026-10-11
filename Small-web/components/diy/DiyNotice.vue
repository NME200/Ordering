<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { SectionProps } from '@/types/api';

/** 公告条：文案为空就整块不画（平台没填时不该占一条空白高度） */
export default defineComponent({
  name: 'DiyNotice',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
  },
  setup(props) {
    const style = computed(() =>
      [
        props.config.bgColor ? `background-color:${props.config.bgColor}` : 'background-color:var(--brand-soft, rgba(200,117,43,.08))',
        props.config.textColor ? `color:${props.config.textColor}` : 'color:var(--brand,#c8752b)',
      ].join(';'),
    );
    return { style };
  },
});
</script>

<template>
  <view v-if="config.text" class="notice" :style="style">
    <LineIcon :name="config.icon || 'notice'" :size="16" :color="config.textColor" />
    <text class="notice__text">{{ config.text }}</text>
  </view>
</template>

<style scoped lang="scss">
.notice {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 18rpx 24rpx;
  border-radius: var(--radius, 16px);
}

.notice__text {
  flex: 1;
  font-size: 26rpx;
  line-height: 1.5;
}
</style>
