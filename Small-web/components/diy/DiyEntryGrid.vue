<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { IconItem, SectionProps } from '@/types/api';

/**
 * 场景入口宫格（首页五个入口就是它）。
 *
 * 图标只认内置线稿 key —— 小程序不能下载资源，配一个包里没画的图标
 * 只能显示占位圆，所以白名单在后端就卡住了。
 */
export default defineComponent({
  name: 'DiyEntryGrid',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
  },
  emits: { link: (_link?: string) => true },
  setup(props, { emit }) {
    const items = computed<IconItem[]>(() => (props.config.items ?? []) as IconItem[]);
    const cols = computed(() => props.config.cols ?? 2);
    /** 五格时用 3 列更贴近参考稿（上三下二），其余按配置列数 */
    const gridStyle = computed(() => `grid-template-columns:repeat(${cols.value},1fr)`);

    return { items, gridStyle, emit };
  },
});
</script>

<template>
  <view v-if="items.length" class="entry card">
    <text v-if="config.title" class="entry__title">{{ config.title }}</text>
    <view class="entry__grid" :style="gridStyle">
      <view
        v-for="(item, index) in items"
        :key="index"
        class="entry__cell"
        @click="emit('link', item.link)"
      >
        <view class="entry__icon">
          <LineIcon :name="item.icon" :size="24" tone="brand" />
          <text v-if="item.badge" class="entry__badge">{{ item.badge }}</text>
        </view>
        <text class="entry__text">{{ item.text }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.entry {
  padding: 28rpx 24rpx 20rpx;
}

.entry__title {
  display: block;
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--brand-sub, #{$n-700});
}

.entry__grid {
  display: grid;
  gap: 8rpx;
}

.entry__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 8rpx 18rpx;
  border-radius: var(--radius, 16px);
}

.entry__cell:active {
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.entry__icon {
  position: relative;
  width: 96rpx;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.entry__badge {
  position: absolute;
  top: 4rpx;
  right: 0;
  padding: 0 10rpx;
  min-width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: var(--brand, #c8752b);
  color: #fff;
  font-size: 20rpx;
}

.entry__text {
  margin-top: 14rpx;
  font-size: 26rpx;
  color: var(--ink, #{$n-900});
}
</style>
