<script lang="ts">
import { defineComponent, computed, ref, watch } from 'vue';
import { createOrder } from '@/api/public';
import { ensureSession, fetchAddresses, fetchUsableCoupons } from '@/api/customer';
import { DINING_TYPE_LABEL, DINING_TYPE_VALUE, useAppStore } from '@/store/app';
import { useCartStore } from '@/store/cart';
import { useCustomerStore } from '@/store/customer';
import { useMenuStore } from '@/store/menu';
import { useOrderStore } from '@/store/order';
import { ErrorCode } from '@/types/error-codes';
import { getLastMerchantId } from '@/utils/auth';
import { yuan } from '@/utils/format';
import type { CustomerAddress, CustomerCoupon } from '@/types/customer';

/**
 * 确认订单（ui.md 第 6 节：内容型页面，不用白色卡片，只靠极细分割线分区）。
 *
 * 费用明细只有「商品小计」与「优惠券抵扣」：后端没有配送费、包装费与促销模型，
 * 参考稿那三行按上一轮定的口径一律不显示 —— 算不出来的数不摆。
 * 抵扣金额**取服务端回传的值**（券上的 `discountPreview`），前端不做任何算价。
 */
export default defineComponent({
  setup() {
    const app = useAppStore();
    const cart = useCartStore();
    const menu = useMenuStore();
    const orders = useOrderStore();
    const customer = useCustomerStore();

    const customerName = ref('');
    const customerPhone = ref('');
    const remark = ref('');
    const submitting = ref(false);
    const errorText = ref('');

    /** 外卖收货地址与用券选择 */
    const addresses = ref<CustomerAddress[]>([]);
    const addressId = ref(0);
    const coupons = ref<CustomerCoupon[]>([]);
    const couponId = ref(0);
    const sheet = ref<'' | 'address' | 'coupon'>('');

    /**
     * 幂等令牌进页面生成一次、提交失败后**不换**：
     * 网络抖动导致的重复点击会在后端命中同一令牌，只会产生一笔订单。
     */
    const clientToken = ref(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

    const storeName = computed(() => menu.store?.name ?? app.store?.name ?? '本店');
    const isDineIn = computed(() => app.diningType === 'dineIn');
    const isDelivery = computed(() => app.diningType === 'delivery');
    const diningLabel = computed(() => DINING_TYPE_LABEL[app.diningType]);
    const merchantId = computed(() => menu.store?.merchantId ?? app.store?.merchantId ?? getLastMerchantId() ?? 0);

    const chosenAddress = computed(() => addresses.value.find((item) => item.id === addressId.value) ?? null);
    const chosenCoupon = computed(() => coupons.value.find((item) => item.id === couponId.value) ?? null);
    /** 抵扣额只认服务端算好的 discountPreview；这里做一次兜底下限，避免出现 0 元单 */
    const discount = computed(() => (chosenCoupon.value ? Math.min(chosenCoupon.value.discountPreview, cart.amount - 1) : 0));
    const payable = computed(() => Math.max(1, cart.amount - discount.value));
    const usableCoupons = computed(() => coupons.value.filter((item) => item.usable).length);

    async function loadAddresses(): Promise<void> {
      if (!isDelivery.value) return;
      try {
        await ensureSession();
        addresses.value = await fetchAddresses();
        if (!addressId.value) {
          const preferred = addresses.value.find((item) => item.isDefault) ?? addresses.value[0];
          if (preferred) {
            addressId.value = preferred.id;
            customerName.value = customerName.value || preferred.receiverName;
            customerPhone.value = customerPhone.value || preferred.phone;
          }
        }
      } catch {
        addresses.value = [];
      }
    }

    /**
     * 券列表按购物车金额现算：门槛是「订单满多少」，
     * 加减菜品就会让可用券集合变化，所以金额一变就重取（接口本身很轻）。
     */
    async function loadCoupons(): Promise<void> {
      if (!merchantId.value || !cart.amount) {
        coupons.value = [];
        couponId.value = 0;
        return;
      }
      try {
        await ensureSession();
        coupons.value = await fetchUsableCoupons(merchantId.value, cart.amount);
        // 金额降了导致原来那张券不再可用时，必须自动取消选择，否则提交会被后端打回
        if (couponId.value && !coupons.value.find((item) => item.id === couponId.value && item.usable)) {
          couponId.value = 0;
        }
      } catch {
        coupons.value = [];
      }
    }

    watch(isDelivery, loadAddresses);
    watch(() => cart.amount, loadCoupons);

    function pickAddress(id: number): void {
      addressId.value = id;
      sheet.value = '';
    }

    function pickCoupon(id: number): void {
      // 再点一次已选中的券 = 取消用券，顾客不该为了不用券去找「取消」按钮
      couponId.value = couponId.value === id ? 0 : id;
      sheet.value = '';
    }

    async function submit(): Promise<void> {
      if (!cart.lines.length || submitting.value) return;
      if (isDelivery.value && !addressId.value) {
        errorText.value = '外卖配送要先选一个收货地址';
        return;
      }
      submitting.value = true;
      errorText.value = '';
      try {
        // 下单前先确保有账号：顾客此刻正在付钱，这一单必须能在他「我的订单」里找到。
        // 注册失败不拦下单 —— 少一条记录可以事后查，付不了款是当场的事。
        await ensureSession().catch(() => undefined);
        const order = await createOrder({
          storeId: cart.storeId,
          items: cart.lines.map((line) => ({
            dishId: line.dishId,
            quantity: line.quantity,
            specOptionIds: line.specOptionIds.length ? line.specOptionIds : undefined,
          })),
          clientToken: clientToken.value,
          diningType: DINING_TYPE_VALUE[app.diningType],
          tableNo: isDineIn.value ? app.tableNo || undefined : undefined,
          customerName: customerName.value.trim() || undefined,
          customerPhone: customerPhone.value.trim() || undefined,
          remark: remark.value.trim() || undefined,
          couponId: couponId.value || undefined,
          addressId: isDelivery.value ? addressId.value : undefined,
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
          storeName: storeName.value,
          diningType: DINING_TYPE_VALUE[app.diningType],
          payableAmount: order.payableAmount,
          createdAt: String(order.createdAt),
        });
        cart.clear();
        uni.redirectTo({ url: `/pages/pay/pay?orderNo=${order.orderNo}` });
      } catch (error) {
        const code = (error as { code?: number }).code ?? 0;
        if (code === ErrorCode.ORDER_DISH_UNAVAILABLE || code === ErrorCode.ORDER_SPEC_INVALID) {
          errorText.value = `${(error as Error).message}，返回后已刷新菜单`;
          await menu.load(true);
        } else if (code === ErrorCode.ORDER_STORE_CLOSED) {
          errorText.value = '门店已打烊，这一单没能提交';
        } else {
          errorText.value = (error as Error).message;
        }
      } finally {
        submitting.value = false;
      }
    }

    /** 改就餐方式：动作面板够用，不必为三个选项做一层弹层组件 */
    function chooseDining(): void {
      const keys = ['dineIn', 'pickup', 'delivery'] as const;
      uni.showActionSheet({
        itemList: keys.map((key) => DINING_TYPE_LABEL[key]),
        success: (res) => app.setDiningType(keys[res.tapIndex]),
        fail: () => undefined,
      });
    }

    return {
      app,
      cart,
      customer,
      storeName,
      isDineIn,
      isDelivery,
      diningLabel,
      merchantId,
      addresses,
      addressId,
      chosenAddress,
      coupons,
      couponId,
      chosenCoupon,
      usableCoupons,
      discount,
      payable,
      sheet,
      loadAddresses,
      loadCoupons,
      pickAddress,
      pickCoupon,
      customerName,
      customerPhone,
      remark,
      submitting,
      errorText,
      submit,
      chooseDining,
      yuan,
    };
  },

  onShow() {
    if (!this.cart.lines.length) uni.navigateBack();
    void this.loadAddresses();
    void this.loadCoupons();
    // 待支付订单会占着一张券，回到这一页要重新问一次可用券
    void this.customer.refreshBuckets();
  },
});
</script>

<template>
  <view class="confirm" :style="app.cssVars">
    <view class="place">
      <view class="place__main" @click="chooseDining">
        <text class="place__store">{{ storeName }}</text>
        <text class="place__meta">{{ diningLabel }} ›</text>
      </view>
    </view>

    <!-- 桌号只读：它来自桌上的二维码，这里不给改 -->
    <view v-if="isDineIn" class="row">
      <text class="row__label">桌号</text>
      <text class="row__value" :class="{ 'is-empty': !app.tableNo }">
        {{ app.tableNo ? `${app.tableNo} 桌` : '未扫码 · 由店员安排' }}
      </text>
    </view>

    <view v-if="isDelivery" class="row" @click="sheet = 'address'">
      <text class="row__label">收货地址</text>
      <text class="row__value" :class="{ 'is-empty': !chosenAddress }">
        {{ chosenAddress ? `${chosenAddress.receiverName} ${chosenAddress.phone}` : '还没有地址，点这里选择' }}
      </text>
    </view>
    <text v-if="isDelivery && chosenAddress" class="addr">{{ chosenAddress.fullAddress }}</text>

    <view class="lines">
      <view v-for="line in cart.lines" :key="line.key" class="line">
        <image v-if="line.imageUrl" class="line__img" :src="line.imageUrl" mode="aspectFill" />
        <view v-else class="line__img line__img--text">
          <text>{{ line.dishName.slice(0, 1) }}</text>
        </view>
        <view class="line__main">
          <text class="line__name">{{ line.dishName }}</text>
          <text class="line__spec">{{ line.specSummary || line.unit || '份' }}</text>
        </view>
        <text class="line__qty num">×{{ line.quantity }}</text>
        <text class="line__money num">¥{{ yuan((line.unitPrice + line.specAmount) * line.quantity) }}</text>
      </view>
    </view>

    <view class="fields">
      <view class="field">
        <text class="field__label">称呼</text>
        <input
          v-model="customerName"
          class="field__input"
          placeholder="店员称呼用，选填"
          placeholder-class="field__ph"
          maxlength="32"
        />
      </view>
      <view class="field">
        <text class="field__label">手机号</text>
        <input
          v-model="customerPhone"
          class="field__input"
          type="number"
          placeholder="需要联系你时再用，选填"
          placeholder-class="field__ph"
          maxlength="20"
        />
      </view>
      <view class="field field--area">
        <text class="field__label">备注</text>
        <textarea
          v-model="remark"
          class="field__textarea"
          placeholder="如「不要香菜」「少辣」"
          placeholder-class="field__ph"
          maxlength="255"
          :auto-height="true"
        />
      </view>
    </view>

    <view class="row" @click="sheet = 'coupon'">
      <text class="row__label">优惠券</text>
      <text class="row__value" :class="{ 'is-empty': !chosenCoupon }">
        {{ chosenCoupon ? `${chosenCoupon.name} 已减 ¥${yuan(discount)}` : (usableCoupons ? `${usableCoupons} 张可用` : (merchantId ? '暂无可用券' : '登录后可见')) }} ›
      </text>
    </view>

    <view class="fees">
      <view class="fee">
        <text class="fee__label">商品小计（{{ cart.count }} 件）</text>
        <text class="fee__value num">¥{{ yuan(cart.amount) }}</text>
      </view>
      <view v-if="discount" class="fee">
        <text class="fee__label">优惠券抵扣</text>
        <text class="fee__value num">-¥{{ yuan(discount) }}</text>
      </view>
      <text class="fees__note">价格由服务端按本店当前菜单与规格重新计算，菜单若变动会提示你核对。</text>
    </view>

    <text v-if="errorText" class="error">{{ errorText }}</text>

    <view class="bar">
      <view class="bar__sum">
        <text class="bar__label">合计</text>
        <text class="bar__amount num">¥{{ yuan(payable) }}</text>
      </view>
      <view class="bar__submit" :class="{ 'is-off': !cart.lines.length || submitting }" @click="submit">
        {{ submitting ? '正在提交…' : '提交订单' }}
      </view>
    </view>

    <!-- 选择弹层：地址与券共用一套结构，内容按 sheet 分派 -->
    <view v-if="sheet" class="mask" @click="sheet = ''">
      <view class="sheet" @click.stop>
        <view class="sheet__head">
          <text class="sheet__title">{{ sheet === 'address' ? '选择收货地址' : '选择优惠券' }}</text>
          <text class="sheet__close" @click="sheet = ''">×</text>
        </view>
        <scroll-view class="sheet__body" scroll-y>
          <block v-if="sheet === 'address'">
            <view v-if="!addresses.length" class="sheet__empty">
              还没有收货地址，先到「我的 - 收货地址」添加一个。
            </view>
            <view
              v-for="item in addresses"
              :key="item.id"
              class="pick"
              :class="{ 'is-on': addressId === item.id }"
              @click="pickAddress(item.id)"
            >
              <view class="pick__main">
                <text class="pick__title">{{ item.receiverName }} {{ item.phone }}</text>
                <text class="pick__sub">{{ item.fullAddress }}</text>
              </view>
              <text v-if="item.isDefault" class="pick__tag">默认</text>
            </view>
          </block>
          <block v-else>
            <view v-if="!coupons.length" class="sheet__empty">
              {{ merchantId ? '这个商户下没有你持有的优惠券。' : '还没确定门店，无法匹配优惠券。' }}
            </view>
            <view
              v-for="item in coupons"
              :key="item.id"
              class="pick"
              :class="{ 'is-on': couponId === item.id, 'is-off': !item.usable }"
              @click="item.usable && pickCoupon(item.id)"
            >
              <view class="pick__face num">{{ item.faceValue }}</view>
              <view class="pick__main">
                <text class="pick__title">{{ item.name }}</text>
                <text class="pick__sub">{{ item.thresholdText }} · {{ String(item.expireAt).slice(0, 10) }} 到期</text>
              </view>
              <text v-if="!item.usable" class="pick__tag is-warn">{{ item.unusableReason }}</text>
              <text v-else class="pick__tag num">-¥{{ yuan(item.discountPreview) }}</text>
            </view>
          </block>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 内容型页面：不画卡片，行间只用极细分割线（ui.md 全局规则第 34 行） */
.confirm {
  min-height: 100vh;
  padding: 8rpx var(--content-pad, 28rpx) 220rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.place {
  display: flex;
  align-items: center;
  padding: 30rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__store {
    display: block;
    font-size: 32rpx;
    font-weight: 700;
  }

  &__meta {
    display: block;
    margin-top: 6rpx;
    font-size: 24rpx;
    color: var(--brand, #c8752b);
  }
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__label {
    font-size: 28rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__value {
    font-size: 30rpx;
    font-weight: 600;

    &.is-empty {
      font-weight: 400;
      color: var(--ink-2, #{$n-400});
    }
  }
}

.lines {
  padding: 8rpx 0;
}

.line {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__img {
    width: 96rpx;
    height: 96rpx;
    flex: none;
    border-radius: var(--radius-tile, 12px);
    background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));

    &--text {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36rpx;
      color: var(--brand, #c8752b);
    }
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: block;
    font-size: 28rpx;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__spec {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__qty {
    flex: none;
    width: 64rpx;
    text-align: right;
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__money {
    flex: none;
    width: 150rpx;
    text-align: right;
    font-size: 28rpx;
    font-weight: 600;
    color: var(--brand, #c8752b);
  }
}

.fields {
  padding-top: 12rpx;
}

.field {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &:last-child {
    border-bottom: none;
  }

  &--area {
    align-items: flex-start;
  }

  &__label {
    flex: none;
    width: 110rpx;
    font-size: 26rpx;
    color: var(--ink-2, #{$n-500});
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

  &__ph {
    color: var(--ink-2, #{$n-400});
  }
}

.fees {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--divider, #{$n-200});
}

.fee {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 28rpx;

  &__label {
    color: var(--ink-2, #{$n-500});
  }
}

.fees__note {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  line-height: 1.6;
  color: var(--ink-2, #{$n-400});
}

.error {
  display: block;
  margin-top: 20rpx;
  padding: 20rpx 24rpx;
  border-radius: var(--radius-tile, 12px);
  background-color: rgba(192, 69, 60, 0.08);
  font-size: 26rpx;
  line-height: 1.6;
  color: $err;
}

.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 20rpx var(--content-pad, 28rpx) calc(20rpx + env(safe-area-inset-bottom));
  background-color: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  border-top: 1rpx solid var(--divider, #{$n-200});
  &__sum {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 10rpx;
  }

  &__label {
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__amount {
    font-size: 42rpx;
    font-weight: 700;
    color: var(--brand, #c8752b);
  }

  &__submit {
    flex: none;
    padding: 0 64rpx;
    height: 88rpx;
    line-height: 88rpx;
    border-radius: 44rpx;
    background-color: var(--brand, #c8752b);
    color: #fff;
    font-size: 30rpx;
    font-weight: 600;

    &.is-off {
      background-color: var(--divider, #{$n-200});
      color: var(--ink-2, #{$n-400});
    }
  }
}

/* 外卖地址的第二行：整段地址换行显示，不塞进右侧那一格里 */
.addr {
  display: block;
  padding: 0 0 22rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--ink-2, #{$n-500});
}

.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  background-color: rgba(58, 50, 44, 0.42);
}

/*
 * 宽度必须 border-box + 100%：H5 下默认 content-box 会把 padding 加在 100% 之外，
 * 右侧内容被整块裁出屏幕（上一轮购物袋「+」点不到就是这个原因）。
 */
.sheet {
  box-sizing: border-box;
  width: 100%;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
  border-radius: 24px 24px 0 0;
  background-color: #fff;
}

.sheet__head {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx var(--content-pad, 28rpx);
  border-bottom: 1rpx solid var(--divider, #{$n-200});
}

.sheet__title {
  font-size: 30rpx;
  font-weight: 700;
}

.sheet__close {
  font-size: 40rpx;
  line-height: 1;
  color: var(--ink-2, #{$n-400});
}

.sheet__body {
  box-sizing: border-box;
  width: 100%;
  flex: 1;
  max-height: 56vh;
  padding: 8rpx var(--content-pad, 28rpx) 24rpx;
}

.sheet__empty {
  padding: 60rpx 0;
  font-size: 26rpx;
  line-height: 1.7;
  text-align: center;
  color: var(--ink-2, #{$n-400});
}

.pick {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &.is-on {
    .pick__title {
      color: var(--brand, #c8752b);
    }

    .pick__tag {
      background-color: var(--brand, #c8752b);
      color: #fff;
    }
  }

  /* 不可用的券整行压暗但仍可读，顾客要知道「我有这张券，只是这单用不了」 */
  &.is-off {
    opacity: 0.5;
  }

  &__face {
    flex: none;
    width: 120rpx;
    font-size: 34rpx;
    font-weight: 700;
    color: var(--brand, #c8752b);
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__title {
    display: block;
    font-size: 28rpx;
    font-weight: 600;
  }

  &__sub {
    display: block;
    margin-top: 6rpx;
    font-size: 22rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__tag {
    flex: none;
    padding: 4rpx 14rpx;
    border-radius: 999rpx;
    background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
    font-size: 22rpx;
    color: var(--brand, #c8752b);

    &.is-warn {
      background-color: var(--divider, #{$n-200});
      color: var(--ink-2, #{$n-500});
    }
  }
}
</style>
