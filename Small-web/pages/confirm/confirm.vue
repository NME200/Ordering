<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { createOrder } from '@/api/public';
import { useAppStore } from '@/store/app';
import { useCartStore } from '@/store/cart';
import { useOrderStore } from '@/store/order';
import { ErrorCode } from '@/types/error-codes';
import { yuan } from '@/utils/format';

/** 下单要带的桌号来自二维码参数，顾客不该被要求手打 */
export default defineComponent({
  setup() {
    const app = useAppStore();
    const cart = useCartStore();
    const orders = useOrderStore();

    const tableNo = ref('');
    const customerName = ref('');
    const customerPhone = ref('');
    const remark = ref('');
    const submitting = ref(false);
    const errorText = ref('');
    /**
     * 幂等令牌在进页面时生成一次、提交失败后**不换**：
     * 网络抖动导致的重复点击会在后端命中同一个令牌，只会出一笔订单。
     */
    const clientToken = ref(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

    const storeName = computed(() => app.store?.name ?? '本店');

    async function submit(): Promise<void> {
      if (!cart.lines.length || submitting.value) return;
      submitting.value = true;
      errorText.value = '';
      try {
        const order = await createOrder({
          storeId: cart.storeId,
          items: cart.lines.map((line) => ({
            dishId: line.dishId,
            quantity: line.quantity,
            specOptionIds: line.specOptionIds.length ? line.specOptionIds : undefined,
          })),
          clientToken: clientToken.value,
          tableNo: tableNo.value.trim() || undefined,
          customerName: customerName.value.trim() || undefined,
          customerPhone: customerPhone.value.trim() || undefined,
          remark: remark.value.trim() || undefined,
        });
        if (!order.payToken) {
          // 没有票据这单就没法支付也没法查，属于后端异常，如实报错而不是假装成功
          errorText.value = '下单异常：未拿到支付凭据，请到收银台核对';
          return;
        }
        orders.remember({
          orderId: order.id,
          orderNo: order.orderNo,
          payToken: order.payToken,
          storeId: cart.storeId,
          payableAmount: order.payableAmount,
          createdAt: String(order.createdAt),
        });
        cart.clear();
        uni.redirectTo({ url: `/pages/pay/pay?orderNo=${order.orderNo}` });
      } catch (error) {
        const code = (error as { code?: number }).code ?? 0;
        if (code === ErrorCode.ORDER_DISH_UNAVAILABLE || code === ErrorCode.ORDER_SPEC_INVALID) {
          // 菜品/规格在提交这一刻变了：回菜单重载，别让顾客反复点提交
          errorText.value = `${(error as Error).message}，已返回菜单，请核对后重新提交`;
          setTimeout(() => uni.navigateBack(), 1200);
        } else if (code === ErrorCode.ORDER_STORE_CLOSED) {
          errorText.value = '门店已打烊，这一单没能提交';
        } else {
          errorText.value = (error as Error).message;
        }
      } finally {
        submitting.value = false;
      }
    }

    return { app, cart, storeName, tableNo, customerName, customerPhone, remark, submitting, errorText, submit, yuan };
  },

  onShow() {
    if (!this.cart.lines.length) {
      uni.navigateBack();
    }
  },
});
</script>

<template>
  <view class="confirm" :style="app.cssVars">
    <view class="block">
      <text class="block__title">{{ storeName }}</text>
      <view v-for="line in cart.lines" :key="line.key" class="row">
        <view class="row__main">
          <text class="row__name">{{ line.dishName }}</text>
          <text v-if="line.specSummary" class="row__spec">{{ line.specSummary }}</text>
        </view>
        <text class="row__qty num">×{{ line.quantity }}</text>
        <text class="row__money num">¥{{ yuan((line.unitPrice + line.specAmount) * line.quantity) }}</text>
      </view>
      <view class="row row--total">
        <text class="row__name">合计（{{ cart.count }} 件）</text>
        <text class="row__money num">¥{{ yuan(cart.amount) }}</text>
      </view>
    </view>

    <view class="gap" />

    <view class="form">
      <view class="field">
        <text class="field__label">桌号</text>
        <input v-model="tableNo" class="field__input" placeholder="如 A12，扫码会自动带入" maxlength="16" />
      </view>
      <view class="field">
        <text class="field__label">称呼</text>
        <input v-model="customerName" class="field__input" placeholder="店员称呼用，选填" maxlength="32" />
      </view>
      <view class="field">
        <text class="field__label">手机号</text>
        <input v-model="customerPhone" class="field__input" type="number" placeholder="需要联系你时再用，选填" maxlength="20" />
      </view>
      <view class="field field--area">
        <text class="field__label">备注</text>
        <textarea
          v-model="remark"
          class="field__textarea"
          placeholder="如「不要香菜」「少辣」"
          maxlength="255"
          :auto-height="true"
        />
      </view>
    </view>

    <text v-if="errorText" class="error">{{ errorText }}</text>

    <view class="foot">
      <view class="foot__sum">
        <text class="foot__label">应付</text>
        <text class="foot__amount num">¥{{ yuan(cart.amount) }}</text>
      </view>
      <view class="foot__submit" :class="{ 'is-off': !cart.lines.length || submitting }" @click="submit">
        {{ submitting ? '正在提交…' : '提交订单' }}
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.confirm {
  min-height: 100vh;
  padding-bottom: 200rpx;
  background-color: var(--page-bg, #fff);
  color: var(--ink, #{$n-900});
}

.block {
  padding: 8rpx 32rpx 0;

  &__title {
    display: block;
    padding: 24rpx 0 8rpx;
    font-size: 28rpx;
    font-weight: 600;
  }
}

.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid $hair;

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: block;
    font-size: 26rpx;
  }

  &__spec {
    display: block;
    margin-top: 4rpx;
    font-size: 20rpx;
    color: $n-400;
  }

  &__qty {
    flex: none;
    width: 72rpx;
    text-align: right;
    font-size: 24rpx;
    color: $n-500;
  }

  &__money {
    flex: none;
    width: 150rpx;
    text-align: right;
    font-size: 26rpx;
  }

  &--total {
    border-bottom: 0;
    padding: 26rpx 0;

    .row__name {
      font-weight: 600;
    }

    .row__money {
      font-size: 30rpx;
      font-weight: 700;
      color: var(--brand, #{$brand-500});
    }
  }
}

.form {
  padding: 0 32rpx;
}

.field {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid $hair;

  &--area {
    align-items: flex-start;
  }

  &__label {
    flex: none;
    width: 110rpx;
    font-size: 26rpx;
    color: $n-500;
  }

  &__input {
    flex: 1;
    font-size: 28rpx;
  }

  &__textarea {
    flex: 1;
    min-height: 88rpx;
    font-size: 28rpx;
    line-height: 1.5;
  }
}

.error {
  display: block;
  margin: 24rpx 32rpx 0;
  font-size: 24rpx;
  line-height: 1.6;
  color: $err;
}

.foot {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid $hair;
  background-color: #fff;

  &__sum {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 10rpx;
  }

  &__label {
    font-size: 24rpx;
    color: $n-500;
  }

  &__amount {
    font-size: 40rpx;
    font-weight: 700;
    color: var(--brand, #{$brand-500});
  }

  &__submit {
    flex: none;
    padding: 0 64rpx;
    height: 84rpx;
    line-height: 84rpx;
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
}
</style>
