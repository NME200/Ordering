<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { SectionProps } from '@/types/api';

/**
 * 领券利益点条。
 *
 * 只画「这里能领券」这句话与跳转，**面额、门槛、有效期都不在这配置里**：
 * 券的数据归营销接口，装修只决定展示形态（config-design.md 第七节的同一口径）。
 */
export default defineComponent({
  name: 'DiyCouponEntry',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
  },
  emits: { link: (_link?: string) => true },
  setup(props, { emit }) {
    return { emit };
  },
});
</script>

<template>
  <view class="coupon card" @click="emit('link', config.link)">
    <view class="coupon__icon">
      <LineIcon :name="config.icon || 'coupon'" :size="20" tone="brand" />
    </view>
    <view class="coupon__body">
      <text class="coupon__title">{{ config.title }}</text>
      <text v-if="config.benefit" class="coupon__benefit">{{ config.benefit }}</text>
    </view>
    <LineIcon name="right" :size="16" tone="sub" />
  </view>
</template>

<style scoped lang="scss">
.coupon {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 28rpx;
}

.coupon__icon {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.coupon__body {
  flex: 1;
  min-width: 0;
}

.coupon__title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--ink, #{$n-900});
}

.coupon__benefit {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: var(--brand, #c8752b);
}
</style>
