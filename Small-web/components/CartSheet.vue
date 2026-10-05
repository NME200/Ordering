<script setup lang="ts">
import { useCartStore } from '@/store/cart';
import { yuan } from '@/utils/format';

/**
 * 购物袋弹层（原型 S3）。
 *
 * 行内直接改份数，不跳页：点餐时顾客反复「加一个 / 减一个」是最高频动作，
 * 每改一次就重排页面会让人找不到刚才点到哪。
 */
const cart = useCartStore();

const emit = defineEmits<{ (event: 'close'): void; (event: 'checkout'): void }>();
</script>

<template>
  <view class="sheet-mask" @click="emit('close')">
    <view class="sheet" @click.stop>
      <view class="sheet__head">
        <text class="sheet__title">购物袋</text>
        <text class="sheet__act" @click="cart.clear()">清空</text>
        <text class="sheet__act" @click="emit('close')">收起</text>
      </view>

      <scroll-view v-if="cart.lines.length" class="sheet__body" scroll-y>
        <view v-for="line in cart.lines" :key="line.key" class="line">
          <view class="line__main">
            <text class="line__name">{{ line.dishName }}</text>
            <text v-if="line.specSummary" class="line__spec">{{ line.specSummary }}</text>
            <text class="line__unit num">¥{{ yuan(line.unitPrice + line.specAmount) }} / {{ line.unit }}</text>
          </view>
          <view class="line__side">
            <view class="stepper">
              <text class="stepper__btn" @click="cart.setQuantity(line.key, line.quantity - 1)">−</text>
              <text class="stepper__num num">{{ line.quantity }}</text>
              <text class="stepper__btn" @click="cart.setQuantity(line.key, line.quantity + 1)">＋</text>
            </view>
            <text class="line__subtotal num">¥{{ yuan((line.unitPrice + line.specAmount) * line.quantity) }}</text>
          </view>
        </view>
      </scroll-view>

      <view v-else class="sheet__empty">
        <text class="sheet__empty-title">购物袋还是空的</text>
        <text class="sheet__empty-line">从左边分类里挑几个菜，选过规格的会合并成一行</text>
      </view>

      <view class="sheet__foot">
        <view class="sheet__total">
          <text class="sheet__total-label">合计</text>
          <text class="sheet__total-num num">¥{{ yuan(cart.amount) }}</text>
          <text class="sheet__total-count">{{ cart.count }} 件</text>
        </view>
        <view class="sheet__submit" :class="{ 'is-off': !cart.lines.length }" @click="cart.lines.length && emit('checkout')">
          去结算
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.sheet-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  background-color: rgba(36, 31, 28, 0.42);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet {
  background-color: #fff;
  border-top: 1rpx solid $hair;
  border-radius: 20rpx 20rpx 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  flex-direction: column;
  max-height: 76vh;
}

.sheet__head {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 28rpx 32rpx 20rpx;
  border-bottom: 1rpx solid $hair;
}

.sheet__title {
  font-size: 32rpx;
  font-weight: 600;
  flex: 1;
}

.sheet__act {
  font-size: 26rpx;
  color: $n-400;
}

.sheet__body {
  flex: 1;
  padding: 0 32rpx;
}

.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid $hair;

  &:last-child {
    border-bottom: 0;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: block;
    font-size: 28rpx;
    font-weight: 500;
  }

  &__spec {
    display: block;
    margin-top: 6rpx;
    font-size: 22rpx;
    color: $n-500;
  }

  &__unit {
    display: block;
    margin-top: 6rpx;
    font-size: 22rpx;
    color: $n-400;
  }

  &__side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10rpx;
    flex: none;
  }

  &__subtotal {
    font-size: 26rpx;
    font-weight: 600;
  }
}

.stepper {
  display: flex;
  align-items: center;
  border: 1rpx solid $n-200;
  border-radius: 999rpx;

  &__btn {
    width: 52rpx;
    text-align: center;
    font-size: 28rpx;
    line-height: 48rpx;
    color: $n-700;
  }

  &__num {
    width: 44rpx;
    text-align: center;
    font-size: 26rpx;
  }
}

.sheet__empty {
  padding: 80rpx 32rpx;
  text-align: center;

  &-title {
    display: block;
    font-size: 28rpx;
    color: $n-700;
  }

  &-line {
    display: block;
    margin-top: 10rpx;
    font-size: 24rpx;
    line-height: 1.6;
    color: $n-400;
  }
}

.sheet__foot {
  padding: 20rpx 32rpx 32rpx;
  border-top: 1rpx solid $hair;
}

.sheet__total {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-bottom: 20rpx;

  &-label {
    font-size: 26rpx;
    color: $n-500;
  }

  &-num {
    font-size: 40rpx;
    font-weight: 700;
    color: var(--brand, #{$brand-500});
  }

  &-count {
    font-size: 22rpx;
    color: $n-400;
  }
}

.sheet__submit {
  height: 92rpx;
  line-height: 92rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: var(--brand, #{$brand-500});
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;

  &.is-off {
    background-color: $n-200;
    color: $n-400;
  }
}
</style>
