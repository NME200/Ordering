<script lang="ts">
import { defineComponent } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import { useCartStore } from '@/store/cart';

/**
 * 购物袋面板（ui.md 第 5 节）。
 *
 * 行**直接铺在面板上**，只用极细分割线分区 —— 弹层本身已经是一张卡片，
 * 里面再套卡片会变成「卡中卡」，参考稿明确避开了这种层级。
 * 「已优惠 ¥3.00」这类促销行不画：没有促销模型，画出来就是假数据。
 */
export default defineComponent({
  name: 'CartSheet',
  components: { LineIcon },
  emits: { close: () => true, checkout: () => true },
  setup() {
    const cart = useCartStore();

    function clear(): void {
      uni.showModal({
        title: '清空购物袋',
        content: `确定移除全部 ${cart.count} 件吗？`,
        confirmText: '清空',
        confirmColor: '#c8752b',
        success: (res) => {
          if (res.confirm) cart.clear();
        },
      });
    }

    return { cart, clear };
  },
});
</script>

<template>
  <view class="sheet-mask" @click="$emit('close')">
    <view class="sheet" @click.stop>
      <view class="sheet__handle" />
      <view class="sheet__head">
        <text class="sheet__title">购物袋</text>
        <text v-if="cart.count" class="cart__clear" @click="clear">清空</text>
      </view>

      <scroll-view v-if="cart.count" class="sheet__body cart" scroll-y>
        <view v-for="line in cart.lines" :key="line.key" class="line">
          <view class="line__pic">
            <image v-if="line.imageUrl" class="line__img" :src="line.imageUrl" mode="aspectFill" />
            <text v-else class="line__initial">{{ line.dishName.slice(0, 1) }}</text>
          </view>
          <view class="line__body">
            <text class="line__name">{{ line.dishName }}</text>
            <text v-if="line.specSummary" class="line__spec">{{ line.specSummary }}</text>
            <text class="line__price num">¥{{ ((line.unitPrice + line.specAmount) / 100).toFixed(2) }}</text>
          </view>
          <view class="line__counter">
            <view class="round-btn round-btn--plain" @click="cart.setQuantity(line.key, line.quantity - 1)">
              <LineIcon name="minus" :size="14" color="#3a322c" />
            </view>
            <text class="line__qty num">{{ line.quantity }}</text>
            <view class="round-btn" @click="cart.setQuantity(line.key, line.quantity + 1)">
              <LineIcon name="plus" :size="14" color="#ffffff" />
            </view>
          </view>
        </view>
      </scroll-view>

      <view v-else class="cart__empty">
        <text>购物袋还是空的</text>
      </view>

      <view class="sheet__foot bar">
        <view class="bar__total">
          <text class="bar__amount num">¥{{ (cart.amount / 100).toFixed(2) }}</text>
          <text class="bar__hint">共 {{ cart.count }} 件</text>
        </view>
        <view class="btn-main bar__cta" :class="{ 'is-off': !cart.count }" @click="$emit('checkout')">
          去结算
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.cart__clear {
  font-size: 26rpx;
  color: var(--ink-2, #{$n-500});
}

.cart {
  max-height: 46vh;
}

.line {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});
}

.line__pic {
  width: 104rpx;
  height: 104rpx;
  flex: none;
  border-radius: var(--radius-tile, 12px);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.line__img {
  width: 100%;
  height: 100%;
}

.line__initial {
  font-size: 36rpx;
  color: var(--brand, #c8752b);
}

.line__body {
  flex: 1;
  min-width: 0;
}

.line__name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.line__spec {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.line__price {
  display: block;
  margin-top: 6rpx;
  font-size: 28rpx;
  color: var(--brand, #c8752b);
}

.line__counter {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.line__qty {
  min-width: 40rpx;
  text-align: center;
  font-size: 28rpx;
}

.cart__empty {
  padding: 100rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: var(--ink-2, #{$n-500});
}

.bar {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 20rpx 32rpx 32rpx;
}

.bar__total {
  flex: 1;
}

.bar__amount {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: var(--ink, #{$n-900});
}

.bar__hint {
  display: block;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.bar__cta {
  width: 260rpx;
}
</style>
