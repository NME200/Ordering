<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import DiyCouponList from '@/components/diy/DiyCouponList.vue';
import DiyCouponTabs from '@/components/diy/DiyCouponTabs.vue';
import DiyRuleEntry from '@/components/diy/DiyRuleEntry.vue';
import {
  claimBirthdayCoupon,
  fetchCouponCenter,
  fetchMyCoupons,
  receiveCoupon,
  updateProfile,
} from '@/api/customer';
import { useAppStore } from '@/store/app';
import { useCustomerStore } from '@/store/customer';
import { getLastMerchantId } from '@/utils/auth';
import { openLink } from '@/utils/nav';
import type { SectionKey, SectionProps } from '@/types/api';
import type { CouponCenterItem, CustomerCoupon } from '@/types/customer';

/** 这一版认识的券页组件；白名单外的 key 跳过 */
const KNOWN_KEYS: SectionKey[] = ['couponTabs', 'couponList', 'ruleEntry'];

type MainTab = 'center' | 'mine' | 'newcomer' | 'birthday';
type MineTab = 'unused' | 'used' | 'expired';

/** 页签文案给界面用，键给逻辑用 */
const MAIN_TABS: { key: MainTab; text: string }[] = [
  { key: 'center', text: '领券中心' },
  { key: 'mine', text: '我的券' },
  { key: 'newcomer', text: '新客有礼' },
  { key: 'birthday', text: '生日有礼' },
];

const SUB_TAB_KEYS: string[] = ['unused', 'used', 'expired'];

/** 装修没配 couponTabs 时的三个子页签：键是后端 tab 参数的闭合枚举，不能少 */
const DEFAULT_SUB_TABS: { key: MineTab; text: string }[] = [
  { key: 'unused', text: '未使用' },
  { key: 'used', text: '已使用' },
  { key: 'expired', text: '已过期' },
];

const EMPTY_PROPS: SectionProps = {};

/**
 * 优惠券页（ui.md 第 13 节）。
 *
 * 分工要说清楚：装修配置只决定**形态**（页签文案与顺序、券面样式、规则入口显隐），
 * 四个主页签是页面自己的固定结构 —— 新客与生日是两种发放方式，
 * 不是「未使用/已使用」那样的数据切片，平台把它们配没配都不该让券页缺一块。
 *
 * 券的面额、门槛、抵扣金额全部由后端算好下发，前端只显示文案；
 * 「立即使用」只把顾客送回点餐，不在这里算钱。
 */
export default defineComponent({
  components: { DiyCouponList, DiyCouponTabs, DiyRuleEntry },

  setup() {
    const app = useAppStore();
    const customer = useCustomerStore();

    const mainTab = ref<MainTab>('center');
    const mineTab = ref<MineTab>('unused');
    /** null = 还没请求过；空数组 = 请求过且真没有券，两者界面文案不同 */
    const center = ref<CouponCenterItem[] | null>(null);
    const mine = ref<Record<MineTab, CustomerCoupon[] | null>>({ unused: null, used: null, expired: null });
    const busy = ref(false);
    /** 正在处理的动作（领取 / 领生日券 / 存生日），锁住避免连点发两张 */
    const acting = ref('');
    const birthdayDraft = ref('');

    const sections = computed(() =>
      app.sectionsOf('coupon').filter((item) => (KNOWN_KEYS as readonly string[]).includes(item.key)),
    );
    const tabsSection = computed(() => sections.value.find((item) => item.key === 'couponTabs') ?? null);
    const listSection = computed(() => sections.value.find((item) => item.key === 'couponList') ?? null);
    const ruleSection = computed(() => sections.value.find((item) => item.key === 'ruleEntry') ?? null);
    const listProps = computed(() => listSection.value?.props ?? EMPTY_PROPS);
    const tabsProps = computed(() => tabsSection.value?.props ?? EMPTY_PROPS);

    /** 券列表是这一页的主体：装修一个组件都没发布时也要画，否则整页空白 */
    const showList = computed(() => Boolean(listSection.value) || !sections.value.length);
    const showSubTabs = computed(() => Boolean(tabsSection.value) || !sections.value.length);

    const subTabs = computed(() => {
      const configured = (tabsProps.value.items ?? []).filter(
        (item) => item.key && SUB_TAB_KEYS.includes(item.key),
      );
      if (!configured.length) return DEFAULT_SUB_TABS;
      return configured.map((item) => ({ key: item.key as MineTab, text: item.text }));
    });

    const merchantId = computed(() => customer.member?.merchantId ?? getLastMerchantId() ?? 0);
    const shopName = computed(() => app.store?.name ?? '');
    const listMode = computed(() => (mainTab.value === 'center' ? ('center' as const) : ('mine' as const)));

    /** 新客与生日页展示的是「手里已有的这两种券」，所以走未使用列表 + scene 过滤 */
    const currentCoupons = computed<(CustomerCoupon | CouponCenterItem)[]>(() => {
      if (mainTab.value === 'center') return center.value ?? [];
      if (mainTab.value === 'mine') return mine.value[mineTab.value] ?? [];
      const scene = mainTab.value === 'newcomer' ? 'newcomer' : 'birthday';
      return (mine.value.unused ?? []).filter((coupon) => coupon.scene === scene);
    });

    const birthday = computed(() => customer.profile?.birthday ?? '');
    /** 后端 birthday 是 DATE 列（'YYYY-MM-DD'），只截字符串展示，不 new Date 免得 iOS 解析不一致 */
    const birthdayText = computed(() => birthday.value.slice(0, 10).replace(/-/g, '.'));
    const birthdayFilled = computed(() => Boolean(birthday.value));
    /**
     * 「生日当月」的判定以后端为准（这里只是决定按钮显示不显示）。
     * 取 ISO 串里的月份字段而不是 new Date，避免 iOS 解析差异。
     */
    const isBirthdayMonth = computed(() => {
      if (!birthday.value) return false;
      const month = Number(birthday.value.slice(5, 7));
      return month === new Date().getMonth() + 1;
    });
    const birthdayMonthText = computed(() =>
      birthday.value ? `${Number(birthday.value.slice(5, 7))} 月` : '',
    );

    async function loadCenter(force = false): Promise<void> {
      if (!force && center.value) return;
      if (!merchantId.value) {
        // 领券中心按商户发券，没进店时没有可领的券，也不去请求（会 401 之外还查不到东西）
        center.value = [];
        return;
      }
      busy.value = true;
      try {
        center.value = await fetchCouponCenter(merchantId.value);
      } catch {
        center.value = [];
      } finally {
        busy.value = false;
      }
    }

    async function loadMine(tab: MineTab, force = false): Promise<void> {
      if (!force && mine.value[tab]) return;
      busy.value = true;
      try {
        // 不传 merchantId：「我的券」看的是顾客名下所有店的券
        mine.value[tab] = await fetchMyCoupons(tab, merchantId.value || undefined);
      } catch {
        mine.value[tab] = [];
      } finally {
        busy.value = false;
      }
    }

    async function ensure(tab: MainTab, force = false): Promise<void> {
      if (tab === 'center') {
        await loadCenter(force);
        return;
      }
      if (tab === 'mine') {
        await loadMine(mineTab.value, force);
        return;
      }
      await loadMine('unused', force);
    }

    async function switchMain(tab: MainTab): Promise<void> {
      mainTab.value = tab;
      await ensure(tab);
    }

    async function switchMine(key: string): Promise<void> {
      if (!SUB_TAB_KEYS.includes(key)) return;
      mineTab.value = key as MineTab;
      await loadMine(mineTab.value);
    }

    async function onReceive(item: CouponCenterItem): Promise<void> {
      if (acting.value) return;
      acting.value = `receive-${item.id}`;
      try {
        // 列表项的 id 就是模板 id（后端 centerList 直接把模板 id 放进去了）
        await receiveCoupon(item.id);
        uni.showToast({ title: '已领取，去「我的券」查看', icon: 'none' });
        await Promise.all([loadCenter(true), loadMine('unused', true)]);
        void customer.refreshBuckets();
      } catch {
        // 领完/超限这类原因后端已在 toast 里说明，这里不重复弹
      } finally {
        acting.value = '';
      }
    }

    /**
     * 「立即使用」只把顾客送回点餐，不在这里选券：
     * 抵扣金额由确认订单页带着订单总额问后端才算得准，前端自己算必然和后端对不上。
     */
    function onUse(): void {
      uni.showToast({ title: '下单时在确认订单页选择优惠券', icon: 'none' });
      setTimeout(() => uni.switchTab({ url: '/pages/home/home' }), 800);
    }

    async function onClaimBirthday(): Promise<void> {
      if (!merchantId.value) {
        uni.showToast({ title: '生日券是按商户发的，先进一家店再领', icon: 'none' });
        return;
      }
      acting.value = 'claim';
      try {
        await claimBirthdayCoupon(merchantId.value);
        uni.showToast({ title: '生日券已放进券包', icon: 'none' });
        await Promise.all([loadMine('unused', true), loadCenter(true)]);
        void customer.refreshBuckets();
      } catch {
        // 非当月 / 今年已领过：原因由后端给出
      } finally {
        acting.value = '';
      }
    }

    /** picker 的回调结构是 uni-app 的，不是 DOM 的，所以收 unknown 再自己拆 */
    function onBirthdayPick(event: unknown): void {
      const detail = (event as { detail?: { value?: unknown } }).detail;
      birthdayDraft.value = String(detail?.value ?? '');
    }

    /** 生日一年只能定一次（后端会直接拒改），所以提交前必须让顾客自己确认 */
    function confirmBirthday(value: string): Promise<boolean> {
      return new Promise((resolve) => {
        uni.showModal({
          title: '确认生日',
          content: `生日登记后不可修改，确认登记为 ${value} 吗？`,
          success: (res) => resolve(Boolean(res.confirm)),
          fail: () => resolve(false),
        });
      });
    }

    async function saveBirthday(): Promise<void> {
      if (acting.value) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdayDraft.value)) {
        uni.showToast({ title: '先把日期选好', icon: 'none' });
        return;
      }
      if (!(await confirmBirthday(birthdayDraft.value))) return;
      acting.value = 'birthday';
      try {
        customer.profile = await updateProfile({ birthday: birthdayDraft.value });
        uni.showToast({ title: '生日已登记', icon: 'none' });
        await switchMain('birthday');
      } catch {
        // 已被登记过（MEMBER_BIRTHDAY_LOCKED）时后端会说明，界面保持原值
      } finally {
        acting.value = '';
      }
    }

    function onRule(link?: string): void {
      if (link) {
        openLink(link, {});
        return;
      }
      uni.showToast({ title: '规则页还没配置：券的门槛与有效期就写在券面上', icon: 'none' });
    }

    return {
      app,
      customer,
      MAIN_TABS,
      mainTab,
      mineTab,
      subTabs,
      ruleSection,
      showList,
      showSubTabs,
      listProps,
      tabsProps,
      currentCoupons,
      busy,
      acting,
      birthdayDraft,
      birthdayText,
      birthdayFilled,
      isBirthdayMonth,
      birthdayMonthText,
      shopName,
      merchantId,
      listMode,
      switchMain,
      switchMine,
      onReceive,
      onUse,
      onClaimBirthday,
      onBirthdayPick,
      saveBirthday,
      onRule,
      ensure,
    };
  },

  onLoad(query) {
    // 入口带 tab 时直达对应页签（个人中心的服务宫格会配成 /pages/coupon/coupon?tab=center）
    const tab = String(query?.tab ?? '');
    const hit = this.MAIN_TABS.find((item) => item.key === tab);
    this.mainTab = hit ? hit.key : 'center';
  },

  async onShow() {
    void this.app.loadConfig();
    // 券数、生日、最近进店商户都可能在上一次离开后变了，回来一次刷一遍
    await this.customer.refresh(this.merchantId || undefined);
    await this.ensure(this.mainTab, true);
  },
});
</script>

<template>
  <view class="cpage" :style="app.cssVars">
    <view class="cpage__head">
      <view class="cpage__tabs">
        <view
          v-for="item in MAIN_TABS"
          :key="item.key"
          class="chip cpage__tab"
          :class="{ 'is-on': mainTab === item.key }"
          @click="switchMain(item.key)"
        >
          <text>{{ item.text }}</text>
        </view>
      </view>
      <DiyRuleEntry v-if="ruleSection" :config="ruleSection.props" @link="onRule" />
    </view>

    <view v-if="mainTab === 'mine' && showSubTabs" class="cpage__sub">
      <DiyCouponTabs :config="tabsProps" :active="mineTab" @change="switchMine" />
    </view>

    <view v-if="mainTab === 'newcomer'" class="note">
      <text class="note__title">新客券不用领</text>
      <text class="note__text">注册后系统会自动发放到你名下，下面这些就是你的新客券。用完后可以在领券中心领普通券。</text>
    </view>

    <view v-if="mainTab === 'birthday'" class="note">
      <text class="note__title">生日有礼</text>
      <text class="note__text">生日券在生日当月、按商户各领一张，每年一次。券面门槛与有效期领取后可见。</text>

      <view v-if="!birthdayFilled" class="birthday">
        <text class="birthday__label">登记生日</text>
        <picker mode="date" :value="birthdayDraft" start="1900-01-01" @change="onBirthdayPick">
          <view class="birthday__field">
            <text class="birthday__value" :class="{ 'is-empty': !birthdayDraft }">
              {{ birthdayDraft || '点这里选出生日期' }}
            </text>
          </view>
        </picker>
        <text class="birthday__warn">生日登记后不可修改，如需更正请联系店员。</text>
        <view class="btn-main birthday__btn" :class="{ 'is-off': acting === 'birthday' }" @click="saveBirthday">
          保存生日
        </view>
      </view>

      <view v-else class="birthday">
        <view class="birthday__row">
          <text class="birthday__label">已登记生日</text>
          <text class="birthday__date num">{{ birthdayText }}</text>
        </view>
        <text class="birthday__fixed">生日登记后不可修改</text>
        <view
          v-if="isBirthdayMonth"
          class="btn-main birthday__btn"
          :class="{ 'is-off': acting === 'claim' }"
          @click="onClaimBirthday"
        >
          {{ acting === 'claim' ? '正在领取…' : '领取生日券' }}
        </view>
        <text v-else class="birthday__wait">
          你的生日在 {{ birthdayMonthText }}，那时这里会出现「领取生日券」。
        </text>
      </view>
    </view>

    <text v-if="mainTab === 'center' && !merchantId" class="cpage__hint">
      券是按商户发的，先从首页进一家店，这里才会列出可领的券。
    </text>

    <view v-if="showList" class="cpage__list">
      <DiyCouponList
        :config="listProps"
        :mode="listMode"
        :coupons="currentCoupons"
        :shop-name="shopName"
        @receive="onReceive"
        @use="onUse"
      />
      <text v-if="busy" class="cpage__loading">正在读取券包…</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.cpage {
  min-height: 100vh;
  padding: var(--content-pad, 28rpx) var(--content-pad, 28rpx) 60rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.cpage__head {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.cpage__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.cpage__tab {
  padding: 14rpx 30rpx;
  font-size: 26rpx;
}

.cpage__sub {
  margin-bottom: 20rpx;
}

.cpage__list {
  /* 券卡之间的间隔由券自己带，这里只留上下呼吸 */
  padding-top: 4rpx;
}

.cpage__hint {
  display: block;
  margin-bottom: 20rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-400});
}

.cpage__loading {
  display: block;
  padding: 12rpx 0;
  text-align: center;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-400});
}

.note {
  margin-bottom: 24rpx;
  padding: 24rpx 28rpx;
  border-radius: var(--radius, 16px);
  background-color: var(--card-bg, rgba(255, 255, 255, 0.7));
  backdrop-filter: blur(20px);
}

.note__title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--brand-sub, #{$n-700});
}

.note__text {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-500});
}

.birthday {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--divider, #{$n-200});
}

.birthday__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.birthday__label {
  font-size: 26rpx;
  color: var(--ink-2, #{$n-500});
}

.birthday__field {
  margin-top: 12rpx;
  padding: 22rpx 24rpx;
  border-radius: var(--radius-tile, 12px);
  background-color: var(--chip-bg, #{$n-100});
}

.birthday__value {
  font-size: 30rpx;
  color: var(--ink, #{$n-900});
}

.birthday__value.is-empty {
  color: var(--ink-2, #{$n-400});
}

.birthday__date {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--ink, #{$n-900});
}

.birthday__fixed {
  display: block;
  margin-top: 10rpx;
  font-size: 20rpx;
  color: var(--ink-2, #{$n-400});
}

.birthday__warn {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: $err;
}

.birthday__btn {
  margin-top: 24rpx;
  font-size: 30rpx;
}

.birthday__wait {
  display: block;
  margin-top: 16rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-500});
}
</style>
