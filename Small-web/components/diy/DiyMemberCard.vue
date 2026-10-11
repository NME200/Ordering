<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import type { SectionProps } from '@/types/api';
import type { MemberAsset } from '@/types/customer';

/**
 * 会员卡卡面（ui.md 第 15 节：深色暖棕渐变实体卡）。
 *
 * 两个刻意的取舍：
 * 1. **卡号是展示号不是资金账号** —— 后端没有实体卡 BIN，这里由顾客 ID 补 0 生成 16 位，
 *    只用来让卡面像张卡。界面必须写明这一点，否则顾客会把它当储值卡号报给客服。
 * 2. **没有档案就摆话，不摆数** —— 会员档案为 null 时等级、成长值一律显示「进店后可见」，
 *    而不是 0 级 / 0 成长值：那会被读成「我有账号但被清零了」。
 */
export default defineComponent({
  name: 'DiyMemberCard',
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    /** 当前商户的会员档案；null = 还没进店或还没建档案 */
    member: { type: Object as PropType<MemberAsset | null>, default: null },
    /** 顾客 ID：补 0 后当展示号用 */
    customerId: { type: [Number, String], default: '' },
    /** 平台没配品牌名时的兜底（当前店名），不编一个假店名 */
    shopName: { type: String, default: '' },
  },
  setup(props) {
    const hasAsset = computed(() => Boolean(props.member));

    /**
     * 兜底渐变走 CSS 变量而不是色值字面量：
     * 平台改主色时卡面跟着改，不会出现「页面新、卡旧」。
     * 配置里真给了两色（平台装修的深色暖棕）时优先用配置。
     */
    const background = computed(() => {
      if (props.config.bgType === 'image' && props.config.bgImage) {
        return `background-image:url(${props.config.bgImage});background-size:cover`;
      }
      const colors = props.config.bgColors;
      const stops =
        colors && colors.length >= 2 ? [colors[0], colors[colors.length - 1]] : ['var(--ink)', 'var(--brand-sub)'];
      return `background:linear-gradient(135deg,${stops[0]},${stops[1]})`;
    });

    /** 展示号：纯数字 ID 补 0 到 16 位再四位一组；非数字（如设备串）一律不画 */
    const cardNo = computed(() => {
      const raw = String(props.customerId || '');
      if (!/^\d+$/.test(raw)) return '';
      return raw.padStart(16, '0').replace(/\d{4}(?=\d)/g, '$& ');
    });

    const brandName = computed(() => props.config.brandName || props.shopName || '会员卡片');
    const levelName = computed(() => (hasAsset.value ? props.member?.levelName || '会员' : '进店后可见'));
    const showCardNo = computed(() => props.config.showCardNo !== false);
    const showGrowth = computed(() => props.config.showGrowth !== false);

    /** 成长值分母取下一级的门槛；已是最高级时不画进度条 */
    const growth = computed(() => {
      const asset = props.member;
      if (!asset) return null;
      const next = asset.nextLevel;
      if (!next) return { top: true as const, text: '已达最高等级' };
      const target = next.needGrowth > 0 ? next.needGrowth : 0;
      const percent = target ? Math.min(100, Math.round((asset.growth / target) * 100)) : 0;
      return {
        top: false as const,
        text: `成长值 ${asset.growth} / ${target}`,
        hint: `再 ${next.remainGrowth} 升${next.name}`,
        percent,
      };
    });

    return { hasAsset, background, cardNo, brandName, levelName, showCardNo, showGrowth, growth };
  },
});
</script>

<template>
  <view class="mcard" :style="background">
    <view class="mcard__top">
      <text class="mcard__brand">{{ brandName }}</text>
      <text class="mcard__vip">VIP</text>
    </view>

    <view v-if="showCardNo" class="mcard__no">
      <text class="mcard__digits num">{{ hasAsset && cardNo ? cardNo : '进店后可见' }}</text>
      <!-- 展示号不是资金账号，这一行小字是防投诉用的，不能省 -->
      <text v-if="hasAsset && cardNo" class="mcard__no-tip">会员展示号 · 不是储值卡号或资金账号</text>
    </view>

    <view class="mcard__level">
      <text class="mcard__level-name">{{ levelName }}</text>
      <text v-if="hasAsset" class="mcard__level-sub num">{{ member?.level }} 级</text>
    </view>

    <view v-if="showGrowth" class="mcard__growth">
      <block v-if="!hasAsset">
        <text class="mcard__growth-text">进店后可见</text>
      </block>
      <block v-else-if="growth && growth.top">
        <text class="mcard__growth-text">{{ growth.text }}</text>
      </block>
      <block v-else-if="growth">
        <view class="mcard__growth-row">
          <text class="mcard__growth-text num">{{ growth.text }}</text>
          <text class="mcard__growth-hint">{{ growth.hint }}</text>
        </view>
        <view class="mcard__bar">
          <view class="mcard__bar-fill" :style="`width:${growth.percent}%`" />
        </view>
      </block>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 卡面是深色实体，不套 .card（半透明白毛玻璃）；圆角仍跟 --radius 走 */
.mcard {
  padding: 32rpx 32rpx 28rpx;
  border-radius: var(--radius, 16px);
  color: #fff;
}

.mcard__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.mcard__brand {
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}

.mcard__vip {
  font-size: 24rpx;
  font-weight: 600;
  letter-spacing: 4rpx;
  padding: 4rpx 18rpx;
  border-radius: 999rpx;
  background-color: rgba(255, 255, 255, 0.18);
}

.mcard__no {
  margin-top: 44rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.mcard__digits {
  font-size: 40rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
}

.mcard__no-tip {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.62);
}

.mcard__level {
  margin-top: 20rpx;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.mcard__level-name {
  font-size: 28rpx;
  font-weight: 600;
}

.mcard__level-sub {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.72);
}

.mcard__growth {
  margin-top: 28rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid rgba(255, 255, 255, 0.18);
}

.mcard__growth-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.mcard__growth-text {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.86);
}

.mcard__growth-hint {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.66);
}

.mcard__bar {
  margin-top: 12rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background-color: rgba(255, 255, 255, 0.22);
  overflow: hidden;
}

/* 进度条是卡面上的强调元素，用白色半透明而不是 --brand：
   深色卡面上主色（橙）对比不足，且卡面本身可能就配了主色渐变 */
.mcard__bar-fill {
  height: 100%;
  border-radius: 999rpx;
  background-color: rgba(255, 255, 255, 0.82);
  transition: width 0.24s ease;
}
</style>
