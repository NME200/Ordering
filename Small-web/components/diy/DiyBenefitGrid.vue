<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { SectionProps } from '@/types/api';

/**
 * 会员权益四宫格（ui.md 第 15 节）。
 *
 * 权益项**没有 link**：权益是「你在这家店能享受什么」的说明，不是功能入口，
 * 给它们配跳转会让装修端把一个展示组件用成导航栏，顾客也分不清点哪个才是真功能。
 * 配置里真出现了 link 也一律忽略，保持这个口径。
 */
export default defineComponent({
  name: 'DiyBenefitGrid',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
  },
  setup(props) {
    const items = computed(() => props.config.items ?? []);
    /** 参考稿是四宫格；配置漏给 cols 时按四列，不与配置较劲 */
    const cols = computed(() => props.config.cols ?? 4);
    const gridStyle = computed(() => `grid-template-columns:repeat(${cols.value},1fr)`);
    return { items, gridStyle };
  },
});
</script>

<template>
  <view v-if="items.length" class="benefit card">
    <text v-if="config.title" class="benefit__title">{{ config.title }}</text>
    <view class="benefit__grid" :style="gridStyle">
      <view v-for="(item, index) in items" :key="index" class="benefit__cell">
        <view class="benefit__icon">
          <LineIcon :name="item.icon" :size="22" tone="brand" />
        </view>
        <text class="benefit__text">{{ item.text }}</text>
        <text v-if="item.desc" class="benefit__desc">{{ item.desc }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.benefit {
  padding: 28rpx 24rpx 20rpx;
}

.benefit__title {
  display: block;
  padding: 0 8rpx 16rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--brand-sub, #{$n-700});
}

.benefit__grid {
  display: grid;
  gap: 8rpx;
}

.benefit__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 20rpx 8rpx 16rpx;
  border-radius: var(--radius-tile, 12px);
}

.benefit__icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
}

.benefit__text {
  font-size: 24rpx;
  color: var(--ink, #{$n-900});
}

.benefit__desc {
  font-size: 20rpx;
  text-align: center;
  line-height: 1.5;
  color: var(--ink-2, #{$n-500});
}
</style>
