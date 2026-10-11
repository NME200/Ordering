<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import type { SectionProps } from '@/types/api';
import type { CouponCenterItem, CustomerCoupon } from '@/types/customer';

type CouponRow = CustomerCoupon | CouponCenterItem;

/** 持有券状态 → 票面文案；与 `CustomerCoupon.status` 一一对应 */
const STATUS_TEXT: Record<string, string> = {
  unused: '',
  locked: '锁定中',
  used: '已使用',
  expired: '已过期',
};

const SCENE_TEXT: Record<string, string> = {
  newcomer: '新客券',
  birthday: '生日券',
};

/**
 * 券列表（ui.md 第 13 节：左右票根豁口造型）。
 *
 * 三种形态共用一个组件：
 * - `center` 领券中心：面额大字 + 门槛 + 「立即领取」，不可领时按钮置灰并把原因写在按钮旁；
 * - `mine` 我的券：右侧显示有效期与状态，非未使用态整卡灰掉。
 *
 * 面额、门槛、有效期文案**都用后端已经算好的字符串**（`faceValue` / `thresholdText`）：
 * 接口里的 `value`、`threshold` 是分，前端再除一次 100 就会和后端文案口径打架，
 * 尤其折扣券的分/厘语义根本不该在小程序里重算。
 */
export default defineComponent({
  name: 'DiyCouponList',
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    coupons: { type: Array as PropType<CouponRow[]>, default: () => [] },
    mode: { type: String as PropType<'center' | 'mine'>, required: true },
    /** 票面右侧的门店名；没有真实店名（未进店）时留空，不写「本店」凑版式 */
    shopName: { type: String, default: '' },
  },
  emits: {
    receive: (_item: CouponCenterItem) => true,
    use: (_coupon: CustomerCoupon) => true,
  },
  setup(props, { emit }) {
    interface DisplayRow {
      key: string;
      name: string;
      face: string;
      threshold: string;
      expire: string;
      desc: string;
      tag: string;
      btn: string;
      note: string;
      canAct: boolean;
      dead: boolean;
      raw: CouponRow;
    }

    /** 「2026.10.31」：只截字符串不 new Date —— iOS 对 ISO 串的解析不一致 */
    function expireLabel(value: string | null, prefix: string): string {
      if (!value) return '领取后生效';
      return `${prefix}${value.slice(0, 10).replace(/-/g, '.')}`;
    }

    /** 两种券形状靠 `receivable` 这个只存在于领券中心项的字段区分，不用页面额外传标记 */
    function isCenterItem(row: CouponRow): row is CouponCenterItem {
      return 'receivable' in row;
    }

    const rows = computed<DisplayRow[]>(() =>
      (props.coupons ?? []).map((row, index) => {
        if (isCenterItem(row)) {
          return {
            key: `c${row.id}-${index}`,
            name: row.name,
            face: row.faceValue,
            threshold: row.thresholdText,
            expire: expireLabel(row.expireAt, ''),
            desc: row.description || '',
            tag: '',
            /*
             * 领券中心的按钮动作就是「领取」，不吃配置的 btnText：
             * 出厂默认写的是「立即使用」，用在还没到手的券上是在骗顾客，
             * 而这块文案本来是给「我的券」那个跳转按钮用的。
             */
            btn: row.receivable ? '立即领取' : row.reason || '暂不可领',
            note: row.receivedByMe > 0 ? `已领 ${row.receivedByMe} 张` : row.reason || '',
            canAct: row.receivable,
            dead: !row.receivable,
            raw: row,
          };
        }
        const usable = row.status === 'unused';
        const fallback = props.config.expiredBtnText || '已过期';
        return {
          key: `m${row.id}-${index}`,
          name: row.name,
          face: row.faceValue,
          threshold: row.thresholdText,
          expire: props.config.showExpire === false ? '' : expireLabel(row.expireAt, '有效期至 '),
          desc: '',
          tag: SCENE_TEXT[row.scene] || '',
          btn: usable
            ? props.config.btnText || '立即使用'
            : row.status === 'expired'
              ? fallback
              : STATUS_TEXT[row.status] || '不可用',
          // 不可用原因后端已经算好（门槛不满足、门店不符），前端不自己判
          note: usable ? row.unusableReason || '' : STATUS_TEXT[row.status] || '不可用',
          canAct: usable,
          dead: !usable,
          raw: row,
        };
      }),
    );

    const showShop = computed(() => props.config.showShopName !== false && Boolean(props.shopName));
    const emptyText = computed(
      () => props.config.emptyText || (props.mode === 'center' ? '本店暂无可领的券' : '暂无优惠券'),
    );

    function onTap(row: DisplayRow): void {
      // 不可领 / 已过期的票整张都不响应：灰掉的按钮还能点是最容易被投诉的交互
      if (!row.canAct) return;
      if (isCenterItem(row.raw)) emit('receive', row.raw);
      else emit('use', row.raw);
    }

    return { rows, showShop, emptyText, onTap };
  },
});
</script>

<template>
  <view class="coupons">
    <text v-if="config.title" class="coupons__title">{{ config.title }}</text>

    <view v-if="!rows.length" class="coupons__empty card">
      <text>{{ emptyText }}</text>
    </view>

    <view
      v-for="row in rows"
      :key="row.key"
      class="ticket"
      :class="{ 'is-dead': row.dead }"
      @click="onTap(row)"
    >
      <view class="ticket__face">
        <text class="ticket__value num">{{ row.face }}</text>
        <text class="ticket__threshold">{{ row.threshold }}</text>
      </view>

      <view class="ticket__body">
        <view class="ticket__head">
          <text class="ticket__name">{{ row.name }}</text>
          <text v-if="row.tag" class="ticket__tag">{{ row.tag }}</text>
        </view>
        <text v-if="showShop" class="ticket__shop">{{ shopName }}</text>
        <text v-if="row.expire" class="ticket__expire num">{{ row.expire }}</text>
        <text v-if="row.desc" class="ticket__desc">{{ row.desc }}</text>

        <view class="ticket__foot">
          <text v-if="row.note" class="ticket__note">{{ row.note }}</text>
          <view class="ticket__btn" :class="{ 'is-off': !row.canAct }">
            <text class="ticket__btn-text">{{ row.btn }}</text>
          </view>
        </view>
      </view>
    </view>

    <text v-if="rows.length && mode === 'mine'" class="coupons__foot">已全部加载完成</text>
  </view>
</template>

<style scoped lang="scss">
.coupons__title {
  display: block;
  padding: 4rpx 8rpx 16rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--brand-sub, #{$n-700});
}

.coupons__empty {
  padding: 56rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--ink-2, #{$n-400});
}

/* 票根：左券面 + 右正文，中间一条虚线，豁口用两个页面底色的小圆挖出来 */
.ticket {
  position: relative;
  display: flex;
  margin-bottom: var(--card-gap, 8px);
  padding: 24rpx 0;
  border-radius: var(--radius, 16px);
  background-color: var(--card-bg, rgba(255, 255, 255, 0.7));
  backdrop-filter: blur(20px);
  overflow: hidden;
}

.ticket::before,
.ticket::after {
  content: '';
  position: absolute;
  left: 200rpx;
  width: 28rpx;
  height: 28rpx;
  margin-left: -14rpx;
  border-radius: 50%;
  background-color: var(--page-bg, #{$n-50});
}

.ticket::before {
  top: -14rpx;
}

.ticket::after {
  bottom: -14rpx;
}

.ticket.is-dead {
  /* 整卡压暗而不是只灰按钮：过期/已使用是一整张券的状态 */
  opacity: 0.5;
}

.ticket__face {
  flex: none;
  width: 200rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border-right: 1rpx dashed var(--divider, #{$n-300});
}

.ticket__value {
  font-size: 52rpx;
  font-weight: 700;
  line-height: 1.1;
  color: var(--brand, #c8752b);
}

.ticket__threshold {
  font-size: 20rpx;
  color: var(--ink-2, #{$n-500});
}

.ticket__body {
  flex: 1;
  min-width: 0;
  padding: 4rpx 28rpx 4rpx 28rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.ticket__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.ticket__name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--ink, #{$n-900});
}

.ticket__tag {
  flex: none;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
  font-size: 20rpx;
  color: var(--brand, #c8752b);
}

.ticket__shop,
.ticket__expire,
.ticket__desc {
  display: block;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.ticket__desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket__foot {
  margin-top: 10rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.ticket__note {
  flex: 1;
  min-width: 0;
  font-size: 20rpx;
  color: var(--ink-2, #{$n-400});
}

.ticket__btn {
  flex: none;
  height: 60rpx;
  padding: 0 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background-color: var(--brand, #c8752b);
}

.ticket__btn.is-off {
  background-color: var(--divider, #{$n-200});
}

.ticket__btn-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #fff;
}

.ticket__btn.is-off .ticket__btn-text {
  color: var(--ink-2, #{$n-500});
}

.coupons__foot {
  display: block;
  padding: 20rpx 0 8rpx;
  text-align: center;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-400});
}
</style>
