<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { ensureSession, fetchCustomerOrder, fetchMyReviews, submitReview } from '@/api/customer';
import { useAppStore } from '@/store/app';
import type { CustomerOrder, ReviewRow } from '@/types/customer';
import { dayClock, yuan } from '@/utils/format';

/** 与后端 CreateReviewDto 的 @MaxLength(500) / @ArrayMaxSize(6) 对齐 */
const CONTENT_MAX = 500;
const TAG_MAX = 6;

/**
 * 标签按星级分两组固定文案。
 *
 * 后端存的是自由字符串（`tags` 只限数量不限内容），所以这一层由前端定词，
 * 目的是让商户侧的统计能聚得起来 —— 做成顾客自填标签就永远统计不出「等太久」有多少条。
 */
const GOOD_TAGS = ['出餐快', '味道好', '分量足', '包装完好', '服务好', '会再来'];
const BAD_TAGS = ['等太久', '分量少', '口味偏差', '包装差', '和描述不符', '服务一般'];

export default defineComponent({
  setup() {
    const app = useAppStore();

    const orderId = ref(0);
    const order = ref<CustomerOrder | null>(null);
    const loading = ref(false);
    const loadError = ref('');

    const rating = ref(0);
    const tags = ref<string[]>([]);
    const content = ref('');
    const anonymous = ref(false);
    const submitting = ref(false);
    /** 后端拒绝时原文放这里：原因只有服务端知道，前端不要复述一遍改措辞 */
    const formError = ref('');

    const history = ref<ReviewRow[]>([]);
    const historyLoading = ref(false);

    const tagPool = computed(() => (rating.value >= 4 ? GOOD_TAGS : BAD_TAGS));
    const showTags = computed(() => rating.value > 0);
    const ratingText = computed(() => ['', '很不满意', '不太满意', '一般', '满意', '非常满意'][rating.value] ?? '');

    function setRating(next: number): void {
      // 星级跨过好评/差评分界时清掉旧标签：留着「等太久」挂在五星上会把评价说反
      const crossed = rating.value > 0 && (rating.value >= 4) !== (next >= 4);
      rating.value = next;
      if (crossed) tags.value = [];
    }

    function toggleTag(tag: string): void {
      const hit = tags.value.indexOf(tag);
      if (hit >= 0) {
        tags.value.splice(hit, 1);
        return;
      }
      if (tags.value.length >= TAG_MAX) return;
      tags.value.push(tag);
    }

    async function loadOrder(): Promise<void> {
      if (!orderId.value) return;
      loading.value = true;
      loadError.value = '';
      try {
        order.value = await fetchCustomerOrder(orderId.value);
      } catch (cause) {
        // 订单取不到就如实显示后端 message，不给一张空白表单让人乱猜
        order.value = null;
        loadError.value = (cause as Error).message || '订单加载失败';
      } finally {
        loading.value = false;
      }
    }

    async function loadHistory(): Promise<void> {
      historyLoading.value = true;
      try {
        history.value = await fetchMyReviews();
      } catch {
        // 历史评价拉不到不影响提交这一单，界面显示空态而不是假数据
      } finally {
        historyLoading.value = false;
      }
    }

    async function submit(): Promise<void> {
      if (submitting.value) return;
      if (!orderId.value) {
        uni.showToast({ title: '没有指定要评价的订单', icon: 'none' });
        return;
      }
      if (rating.value < 1) {
        uni.showToast({ title: '先给个星级', icon: 'none' });
        return;
      }
      submitting.value = true;
      formError.value = '';
      try {
        await submitReview({
          orderId: orderId.value,
          rating: rating.value,
          tags: tags.value,
          content: content.value.trim() || undefined,
          anonymous: anonymous.value,
        });
        // 「+5」与后端 REVIEW_POINT = 5 对应；赠分在服务端是尽力而为，
        // 若某次积分服务异常仍会返回成功，所以文案只说明这一条评价给多少分，不承诺到账时间
        uni.showToast({ title: '评价已提交，积分 +5', icon: 'none' });
        setTimeout(() => uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/orders/orders' }) }), 800);
      } catch (cause) {
        // 「订单完成后才能评价」「这笔订单已经评价过了」等原文在这里显示
        formError.value = (cause as Error).message || '评价没有提交成功';
      } finally {
        submitting.value = false;
      }
    }

    function goOrders(): void {
      uni.switchTab({ url: '/pages/orders/orders' });
    }

    return {
      app,
      CONTENT_MAX,
      TAG_MAX,
      orderId,
      order,
      loading,
      loadError,
      rating,
      tags,
      content,
      anonymous,
      submitting,
      formError,
      history,
      historyLoading,
      tagPool,
      showTags,
      ratingText,
      setRating,
      toggleTag,
      loadOrder,
      loadHistory,
      submit,
      goOrders,
      dayClock,
      yuan,
    };
  },

  onLoad(query) {
    void this.app.loadConfig();
    const id = Number(query?.orderId ?? 0);
    // 没有 orderId 时这一页没有意义（评价是按单提交的），直接给回订单列表的路
    if (!id) {
      this.loadError = '没有指定要评价的订单';
      return;
    }
    this.orderId = id;
    void (async () => {
      await ensureSession();
      await this.loadOrder();
    })();
    void this.loadHistory();
  },
});
</script>

<template>
  <view class="review" :style="app.cssVars">
    <view v-if="!orderId" class="gate">
      <text class="gate__title">{{ loadError }}</text>
      <text class="gate__line">评价是按订单提交的，从「订单」页点要评价的那一单进来就行。</text>
      <view class="btn-main gate__btn" @click="goOrders">去订单列表</view>
    </view>

    <template v-else>
      <view v-if="loadError" class="gate">
        <text class="gate__title">{{ loadError }}</text>
        <text class="gate__line">这一单还没取到，可以先回订单页确认它还在。</text>
        <view class="btn-main gate__btn" @click="goOrders">去订单列表</view>
      </view>

      <!-- 订单概要：门店 + 菜品行 + 金额（ui.md 第 14 节） -->
      <view v-else class="card order">
        <view class="order__head">
          <text class="order__store">{{ order ? order.storeName : '加载中…' }}</text>
          <text v-if="order" class="order__status">{{ order.statusLabel }}</text>
        </view>
        <text v-if="order" class="order__no num">{{ order.orderNo }} · {{ dayClock(order.createdAt) }}</text>

        <template v-if="order">
          <view class="order__items">
            <view v-for="(item, index) in order.items" :key="index" class="irow">
              <view class="irow__left">
                <text class="irow__name">{{ item.dishName }}</text>
                <text v-if="item.specSummary" class="irow__spec">{{ item.specSummary }}</text>
              </view>
              <text class="irow__qty num">×{{ item.quantity }}</text>
              <text class="irow__money num">¥{{ yuan(item.subtotal) }}</text>
            </view>
          </view>
          <view class="order__foot">
            <text class="order__count num">{{ order.itemCount }} 件</text>
            <text class="order__total num">实付 ¥{{ yuan(order.payableAmount) }}</text>
          </view>
          <!-- canReview 是后端给的可评标记，这里只做提醒，不替服务端下结论 -->
          <text v-if="!order.canReview" class="order__hint">
            这一单当前标记为不可评价，提交后以门店返回的原因为准。
          </text>
        </template>
      </view>

      <!-- 评价表单 -->
      <view class="card form">
        <text class="form__title">整体评分</text>
        <view class="stars">
          <text
            v-for="i in 5"
            :key="i"
            class="stars__item"
            :class="{ 'is-on': i <= rating }"
            @click="setRating(i)"
          >★</text>
          <text class="stars__text">{{ rating > 0 ? `${rating} 分 · ${ratingText}` : '点一下星星打分' }}</text>
        </view>

        <template v-if="showTags">
          <text class="form__sub">印象标签（最多 {{ TAG_MAX }} 个）</text>
          <view class="chips">
            <view
              v-for="tag in tagPool"
              :key="tag"
              class="chip chips__item"
              :class="{ 'is-on': tags.indexOf(tag) >= 0 }"
              @click="toggleTag(tag)"
            >
              <text>{{ tag }}</text>
            </view>
          </view>
        </template>

        <text class="form__sub">说说这一单</text>
        <textarea
          v-model="content"
          class="form__input"
          :maxlength="CONTENT_MAX"
          placeholder="口味、出餐速度、包装、服务都可以说说…"
          placeholder-class="form__ph"
          :auto-height="true"
        />
        <text class="form__count num">{{ content.length }}/{{ CONTENT_MAX }}</text>

        <view class="form__row">
          <text class="form__label">匿名评价</text>
          <view class="switch" :class="{ 'is-on': anonymous }" @click="anonymous = !anonymous">
            <view class="switch__dot" />
          </view>
          <text class="form__tail">{{ anonymous ? '昵称只显示首字，商户端也看不到全名' : '会显示你的昵称' }}</text>
        </view>

        <text v-if="formError" class="form__error">{{ formError }}</text>

        <view class="btn-main form__submit" :class="{ 'is-off': submitting }" @click="submit">
          {{ submitting ? '正在提交…' : '提交评价' }}
        </view>
      </view>

      <!-- 我的历史评价 -->
      <view class="hist">
        <view class="hist__head">
          <text class="hist__title">我的历史评价</text>
          <text class="hist__refresh" @click="loadHistory">刷新</text>
        </view>

        <view v-if="historyLoading && !history.length" class="hist__tip">正在加载…</view>
        <view v-else-if="!history.length" class="hist__tip">
          <text>还没有评价记录</text>
          <text class="hist__sub">评价过的订单会出现在这里，商家的回复也跟着这一条。</text>
        </view>

        <view v-for="row in history" :key="row.id" class="hcard">
          <view class="hcard__top">
            <text class="hcard__stars num">
              <text v-for="i in 5" :key="i" class="hcard__star" :class="{ 'is-on': i <= row.rating }">★</text>
            </text>
            <text class="hcard__name">{{ row.anonymous ? '匿名' : row.customerName }}</text>
          </view>
          <text class="hcard__no num">{{ row.orderNo }} · {{ dayClock(row.createdAt) }}</text>
          <view v-if="row.tags.length" class="hcard__tags">
            <text v-for="tag in row.tags" :key="tag" class="hcard__tag">{{ tag }}</text>
          </view>
          <text v-if="row.content" class="hcard__content">{{ row.content }}</text>
          <!-- 商家回复只有回了才有，空着就什么都不画，不写「商家暂未回复」那种填充语 -->
          <view v-if="row.replyContent" class="hcard__reply">
            <text class="hcard__reply-label">商家回复</text>
            <text class="hcard__reply-text">{{ row.replyContent }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.review {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 24rpx var(--content-pad, 28rpx) 60rpx;
  background-color: var(--page-bg);
  color: var(--ink);
}

.gate {
  padding: 160rpx 40rpx 0;
  text-align: center;

  &__title {
    display: block;
    font-size: 32rpx;
    font-weight: 700;
  }

  &__line {
    display: block;
    margin-top: 14rpx;
    font-size: 24rpx;
    line-height: 1.6;
    color: var(--ink-2);
  }

  &__btn {
    margin: 56rpx auto 0;
    max-width: 460rpx;
  }
}

.order {
  box-sizing: border-box;
  width: 100%;
  padding: 28rpx;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }

  &__store {
    flex: 1;
    min-width: 0;
    font-size: 30rpx;
    font-weight: 700;
  }

  &__status {
    flex: none;
    font-size: 24rpx;
    color: var(--brand);
  }

  &__no {
    display: block;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: var(--ink-2);
  }

  &__items {
    margin-top: 20rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid var(--divider);
  }

  &__foot {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-top: 18rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid var(--divider);
  }

  &__count {
    font-size: 22rpx;
    color: var(--ink-2);
  }

  &__total {
    font-size: 32rpx;
    font-weight: 700;
    color: var(--brand);
  }

  &__hint {
    display: block;
    margin-top: 14rpx;
    font-size: 20rpx;
    line-height: 1.6;
    color: var(--ink-2);
  }
}

.irow {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
  padding: 10rpx 0;

  &__left {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 26rpx;
  }

  &__spec {
    margin-left: 10rpx;
    font-size: 20rpx;
    color: var(--ink-2);
  }

  &__qty {
    flex: none;
    font-size: 24rpx;
    color: var(--ink-2);
  }

  &__money {
    flex: none;
    width: 140rpx;
    text-align: right;
    font-size: 26rpx;
  }
}

.form {
  box-sizing: border-box;
  width: 100%;
  margin-top: var(--section-gap);
  padding: 28rpx;

  &__title {
    display: block;
    font-size: 30rpx;
    font-weight: 700;
  }

  &__sub {
    display: block;
    margin-top: 32rpx;
    font-size: 24rpx;
    color: var(--ink-2);
  }

  &__input {
    box-sizing: border-box;
    width: 100%;
    min-height: 160rpx;
    margin-top: 16rpx;
    padding: 22rpx 24rpx;
    border-radius: var(--radius);
    background-color: var(--chip-bg);
    font-size: 28rpx;
    line-height: 1.6;
  }

  &__ph {
    color: var(--ink-2);
  }

  &__count {
    display: block;
    margin-top: 8rpx;
    text-align: right;
    font-size: 20rpx;
    color: var(--ink-2);
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 20rpx;
    margin-top: 28rpx;
  }

  &__label {
    flex: none;
    font-size: 26rpx;
  }

  &__tail {
    flex: 1;
    text-align: right;
    font-size: 20rpx;
    line-height: 1.6;
    color: var(--ink-2);
  }

  &__error {
    display: block;
    margin-top: 24rpx;
    padding: 16rpx 20rpx;
    border-radius: var(--radius);
    background-color: var(--brand-soft);
    font-size: 22rpx;
    line-height: 1.6;
    color: var(--brand-sub);
  }

  &__submit {
    margin-top: 32rpx;
  }
}

.stars {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 18rpx;

  &__item {
    font-size: 48rpx;
    line-height: 1.2;
    color: var(--divider);

    &.is-on {
      color: var(--brand);
    }
  }

  &__text {
    margin-left: 8rpx;
    font-size: 24rpx;
    color: var(--ink-2);
  }
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 16rpx;

  &__item {
    font-size: 24rpx;
  }
}

/* 原生 switch 只能传色值字面量，吃不到 var(--brand)，换肤会脱节，所以自绘 */
.switch {
  box-sizing: border-box;
  width: 88rpx;
  height: 48rpx;
  padding: 4rpx;
  border-radius: 999rpx;
  background-color: var(--divider);
  transition: background-color 0.2s;

  &__dot {
    width: 40rpx;
    height: 40rpx;
    border-radius: 50%;
    background-color: #fff;
  }

  &.is-on {
    background-color: var(--brand);

    .switch__dot {
      margin-left: 40rpx;
    }
  }
}

.hist {
  margin-top: 40rpx;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__title {
    font-size: 28rpx;
    font-weight: 700;
  }

  &__refresh {
    font-size: 24rpx;
    color: var(--brand);
  }

  &__tip {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
    padding: 60rpx 0;
    text-align: center;
    font-size: 26rpx;
    color: var(--ink-2);
  }

  &__sub {
    font-size: 20rpx;
    line-height: 1.6;
  }
}

.hcard {
  box-sizing: border-box;
  width: 100%;
  margin-top: var(--card-gap);
  padding: 24rpx 26rpx;
  border-radius: var(--radius);
  background-color: var(--card-bg);
  backdrop-filter: blur(20px);

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__stars {
    font-size: 28rpx;
  }

  &__star {
    color: var(--divider);

    &.is-on {
      color: var(--brand);
    }
  }

  &__name {
    font-size: 24rpx;
    color: var(--ink-2);
  }

  &__no {
    display: block;
    margin-top: 8rpx;
    font-size: 20rpx;
    color: var(--ink-2);
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
    margin-top: 14rpx;
  }

  &__tag {
    padding: 6rpx 18rpx;
    border-radius: 999rpx;
    background-color: var(--chip-bg);
    font-size: 20rpx;
    color: var(--ink-2);
  }

  &__content {
    display: block;
    margin-top: 14rpx;
    font-size: 26rpx;
    line-height: 1.6;
  }

  &__reply {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
    margin-top: 16rpx;
    padding: 18rpx 20rpx;
    border-radius: var(--radius);
    background-color: var(--brand-soft);
  }

  &__reply-label {
    font-size: 20rpx;
    color: var(--brand-sub);
  }

  &__reply-text {
    font-size: 24rpx;
    line-height: 1.6;
    color: var(--ink);
  }
}
</style>
