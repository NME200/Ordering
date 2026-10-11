<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import type { SectionProps } from '@/types/api';

/** 与 `fetchMyCoupons(tab)` 对齐的闭合枚举；配置里出现别的 key 就丢掉 */
const ALLOWED_KEYS = ['unused', 'used', 'expired'] as const;

/**
 * 券页子页签（ui.md 第 13 节的「未使用 / 已使用 / 已过期」）。
 *
 * 只决定**形态**（名称、顺序、显隐），不决定数据：点了哪个页签由页面自己持有状态，
 * 装修端把顺序换成「已使用」在前也照样工作。
 * 页签的 key 是后端 tab 参数的闭合枚举，配了枚举外的 key 会让请求 400，
 * 所以这里直接丢弃而不是透传。
 */
export default defineComponent({
  name: 'DiyCouponTabs',
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    active: { type: String, default: '' },
  },
  emits: { change: (_key: string) => true },
  setup(props) {
    const items = computed(() =>
      (props.config.items ?? [])
        .filter((item) => item.key && (ALLOWED_KEYS as readonly string[]).includes(item.key))
        .map((item) => ({ key: String(item.key), text: item.text })),
    );
    return { items };
  },
});
</script>

<template>
  <view v-if="items.length" class="tabs">
    <view
      v-for="item in items"
      :key="item.key"
      class="chip tabs__item"
      :class="{ 'is-on': item.key === active }"
      @click="$emit('change', item.key)"
    >
      <text>{{ item.text }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.tabs__item {
  padding: 14rpx 34rpx;
  font-size: 26rpx;
}
</style>
