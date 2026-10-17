<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import DiyBenefitGrid from '@/components/diy/DiyBenefitGrid.vue';
import DiyFooterButton from '@/components/diy/DiyFooterButton.vue';
import DiyMemberCard from '@/components/diy/DiyMemberCard.vue';
import DiyTaskList from '@/components/diy/DiyTaskList.vue';
import { fetchMember, fetchPointLogs } from '@/api/customer';
import { fetchPointActivity } from '@/api/public';
import { useAppStore } from '@/store/app';
import { useCustomerStore } from '@/store/customer';
import { getLastMerchantId } from '@/utils/auth';
import { dayClock } from '@/utils/format';
import { openLink } from '@/utils/nav';
import type { SectionKey } from '@/types/api';
import type { PublicPointActivityBanner } from '@/types/api';
import type { MemberAsset, MemberTask, PointLog } from '@/types/customer';

/** 这一版小程序认识的会员卡页组件；白名单外的 key 整块跳过，装修端加新组件不会打挂老版本 */
const KNOWN_KEYS: SectionKey[] = ['memberCard', 'benefitGrid', 'taskList', 'footerButton'];

/**
 * 会员卡页（ui.md 第 15 节），结构由平台装修配置的 `pages.card` 驱动。
 *
 * 两条口径：
 * 1. **档案与任务都是真数据**：没进店（没有 merchantId）时不请求、不摆 0，
 *    卡面自己显示「进店后可见」；
 * 2. 「去完成」按任务类型分流：消费任务回首页点餐，邀请任务在页内弹邀请码 ——
 *    这两个动作都不需要新页面，跳去一个还没做的页面只会让顾客以为功能坏了。
 */
export default defineComponent({
  components: { DiyBenefitGrid, DiyFooterButton, DiyMemberCard, DiyTaskList },

  setup() {
    const app = useAppStore();
    const customer = useCustomerStore();

    /** 接口的会员档案：比 store 里的「我的」页快照新，卡面优先用它 */
    const asset = ref<MemberAsset | null>(null);
    const tasks = ref<MemberTask[]>([]);
    const merchantId = ref(0);
    const showInvite = ref(false);
    const loaded = ref(false);
    /** 平台积分活动条。没进店（没有 storeId）/ 没活动 / 接口失败都是 null，整块不渲染 */
    const activity = ref<PublicPointActivityBanner | null>(null);
    /** 积分明细：后端只给「变动 / 变动后余额 / 说明 / 时间」四件事实，界面不汇总不预测 */
    const logs = ref<PointLog[]>([]);

    const sections = computed(() =>
      app.sectionsOf('card').filter((item) => (KNOWN_KEYS as readonly string[]).includes(item.key)),
    );

    const displayAsset = computed(() => asset.value ?? customer.member);
    const customerId = computed(() => customer.profile?.id ?? '');
    const shopName = computed(() => app.store?.name ?? '');
    /** 有档案即视为已开通：等级 1 也算开过卡，底部按钮据此换成「查看我的权益」 */
    const opened = computed(() => Boolean(displayAsset.value));
    const inviteCode = computed(() => customer.profile?.inviteCode ?? '');
    const inviteCount = computed(() => customer.profile?.inviteCount ?? 0);

    async function load(): Promise<void> {
      /**
       * 活动条按门店问（公开接口只认 storeId，与菜单同一个形状）。
       *
       * 没进店就没有 storeId，也就没有活动条 —— 规则是「这个商户这一段时间」的事，
       * 拿不到上下文时宁可什么都不显示，不能猜一家店的活动贴上去。
       */
      const storeId = app.store?.id ?? 0;
      activity.value = storeId ? await fetchPointActivity(storeId).catch(() => null) : null;

      const id = customer.member?.merchantId ?? getLastMerchantId();
      merchantId.value = id || 0;
      await customer.refresh(id || undefined);
      if (!id) {
        asset.value = null;
        tasks.value = [];
        logs.value = [];
        loaded.value = true;
        return;
      }
      try {
        const res = await fetchMember(id);
        asset.value = res.asset;
        tasks.value = res.tasks ?? [];
      } catch {
        // 会员接口失败退回「我的」页的档案快照：卡面还有等级可看，任务那栏宁可空着也不摆假进度
        asset.value = customer.member;
        tasks.value = [];
      } finally {
        loaded.value = true;
      }
      /**
       * 明细单独取，且失败不挡卡面。
       *
       * 「我的分哪来的」是顾客问得最多的一类问题，而这份账后端一直有（`point_logs`），
       * 之前只是没有任何页面读它 —— 活动加成发出去了顾客只看得到数字变大，说不清来源。
       */
      logs.value = await fetchPointLogs(id).catch(() => []);
    }

    /**
     * 任务配置项没有 key（config-design.md 第六节的形状是 `{text, btnText}`），
     * 只能按顺序与接口任务对齐取跳转链接；对不上就不跳，不猜。
     */
    function taskLink(key: string): string | undefined {
      const config = sections.value.find((item) => item.key === 'taskList')?.props;
      const index = tasks.value.findIndex((task) => task.key === key);
      return index >= 0 ? config?.items?.[index]?.link : undefined;
    }

    function onTaskTap(key: string): void {
      if (key === 'consume') {
        uni.switchTab({ url: '/pages/home/home' });
        return;
      }
      if (key === 'invite') {
        showInvite.value = true;
        return;
      }
      openLink(taskLink(key), {});
    }

    function onFooterTap(link?: string): void {
      if (link) {
        openLink(link, {});
        return;
      }
      // 没有配置跳转时把话说清楚：权益和任务就在本页上方，不是按钮坏了
      uni.showToast({
        title: opened.value ? '权益与任务已在本页列出' : '开通入口还没配置，可先点餐累积成长值',
        icon: 'none',
      });
    }

    function copyInvite(): void {
      if (!inviteCode.value) {
        uni.showToast({ title: '邀请码还没生成，稍后再来', icon: 'none' });
        return;
      }
      uni.setClipboardData({
        data: inviteCode.value,
        success: () => uni.showToast({ title: '邀请码已复制', icon: 'none' }),
      });
    }

    return {
      app,
      sections,
      displayAsset,
      customerId,
      shopName,
      opened,
      tasks,
      loaded,
      merchantId,
      activity,
      logs,
      dayClock,
      showInvite,
      inviteCode,
      inviteCount,
      load,
      onTaskTap,
      onFooterTap,
      copyInvite,
    };
  },

  onShow() {
    void this.app.loadConfig();
    void this.load();
  },

  /** 邀请码面板只是文案，真正的分享走微信右上角转发，所以这里得给出分享路径 */
  onShareAppMessage() {
    return {
      title: this.shopName ? `${this.shopName} 会员卡，成长值能升级` : '会员卡：消费攒成长值，等级越高权益越多',
      path: '/pages/home/home',
    };
  },
});
</script>

<template>
  <view class="card-page" :style="app.cssVars">
    <!-- 平台积分活动条：没活动、没配文案或接口失败时整块不渲染，不留灰框占位 -->
    <view v-if="activity" class="activity card">
      <text class="activity__title">{{ activity.title }}</text>
      <text v-if="activity.description" class="activity__desc">{{ activity.description }}</text>
      <text class="activity__note">
        {{ activity.ruleTypeLabel }} · {{ dayClock(activity.endTime) }} 结束，加成的积分直接进你在本店的账户
      </text>
    </view>

    <block v-for="item in sections" :key="item.id">
      <view class="card-page__block">
        <DiyMemberCard
          v-if="item.key === 'memberCard'"
          :config="item.props"
          :member="displayAsset"
          :customer-id="customerId"
          :shop-name="shopName"
        />
        <DiyBenefitGrid v-else-if="item.key === 'benefitGrid'" :config="item.props" />
        <DiyTaskList
          v-else-if="item.key === 'taskList'"
          :config="item.props"
          :tasks="tasks"
          @pick="onTaskTap"
        />
        <DiyFooterButton
          v-else-if="item.key === 'footerButton'"
          :config="item.props"
          :opened="opened"
          @pick="onFooterTap"
        />
      </view>
    </block>

    <!-- 装修端还没发布这一页时，卡面与成长任务照样要能看 -->
    <block v-if="!sections.length">
      <view class="card-page__block">
        <DiyMemberCard :config="{}" :member="displayAsset" :customer-id="customerId" :shop-name="shopName" />
      </view>
      <view class="card-page__block">
        <DiyTaskList :config="{}" :tasks="tasks" @pick="onTaskTap" />
      </view>
      <view class="card-page__block">
        <DiyFooterButton :config="{}" :opened="opened" @pick="onFooterTap" />
      </view>
    </block>

    <view v-if="!merchantId && loaded" class="tip">
      <text class="tip__text">还没进店，会员档案是按商户建的。先扫桌码或从首页选一家店，这里就会出现你的等级与成长值。</text>
    </view>

    <!-- 积分明细：一条流水都没有就整块不出现，不留「暂无记录」的空框 -->
    <view v-if="logs.length" class="logs card">
      <view class="logs__head">
        <text class="logs__title">积分明细</text>
        <text class="logs__note">本店最近 {{ logs.length }} 条，别的店的分不在这里</text>
      </view>
      <view v-for="(item, index) in logs" :key="index" class="log">
        <view class="log__body">
          <text class="log__reason">{{ item.reason }}</text>
          <text class="log__meta num">{{ dayClock(item.createdAt) }} · 变动后 {{ item.pointAfter }} 分</text>
        </view>
        <text class="log__change num" :class="{ 'log__change--minus': item.pointChange < 0 }">
          {{ item.pointChange > 0 ? '+' : '' }}{{ item.pointChange }}
        </text>
      </view>
    </view>

    <view v-if="showInvite" class="sheet-mask" @click="showInvite = false">
      <view class="sheet" @click.stop>
        <view class="sheet__handle" />
        <view class="sheet__head">
          <text class="sheet__title">邀请好友</text>
        </view>
        <view class="sheet__body">
          <text class="invite__label">我的邀请码</text>
          <text class="invite__code num">{{ inviteCode || '还没生成' }}</text>
          <text class="invite__note">
            好友用你的码注册并绑定手机号后，这轮邀请才算有效（当前有效邀请 {{ inviteCount }} 人）。
            也可以点右上角「···」把小程序转发给 TA。
          </text>
        </view>
        <view class="sheet__foot">
          <view class="btn-main" @click="copyInvite">复制邀请码</view>
          <view class="btn-ghost invite__close" @click="showInvite = false">关闭</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.card-page {
  min-height: 100vh;
  padding: var(--content-pad, 28rpx) 0 60rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

/* 每一块都带页边距与卡片间距：卡面在参考稿里也是一张带边距的实体卡，不是通栏头图 */
.card-page__block {
  padding: var(--card-gap, 8px) var(--content-pad, 28rpx) 0;
}

/* 平台积分活动条：容器复用全局 .card（毛玻璃 + 主题圆角），这里只排文字 */
.activity {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  margin: 0 var(--content-pad, 28rpx);
  padding: 22rpx 24rpx;
}

.activity__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--brand, #c8752b);
}

.activity__desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--ink, #{$n-900});
}

.activity__note {
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--ink-2, #{$n-500});
}

/* 明细是一页里唯一的账目区：内容铺在卡片上，行间只用极细分割线，不画卡中卡 */
.logs {
  margin: var(--card-gap, 8px) var(--content-pad, 28rpx) 0;
  padding: 4rpx 24rpx;
}

.logs__head {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  padding: 20rpx 0 12rpx;
}

.logs__title {
  font-size: 28rpx;
  font-weight: 700;
}

.logs__note {
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.log {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 18rpx 0;
  border-top: 1rpx solid var(--divider, #{$n-100});
}

.log__body {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}

.log__reason {
  font-size: 24rpx;
  line-height: 1.5;
  word-break: break-all;
}

.log__meta {
  font-size: 20rpx;
  color: var(--ink-2, #{$n-500});
}

.log__change {
  flex-shrink: 0;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--brand, #c8752b);
}

/* 扣回要让顾客一眼看出是少了的，但不做成红色警告：那是系统正常的退款动作，不是出错 */
.log__change--minus {
  color: var(--ink-2, #{$n-500});
}

.tip {
  margin: 24rpx var(--content-pad, 28rpx) 0;
  padding: 20rpx 24rpx;
  border-radius: var(--radius-tile, 12px);
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.tip__text {
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-500});
}

.invite__label {
  display: block;
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}

.invite__code {
  display: block;
  margin-top: 8rpx;
  font-size: 56rpx;
  font-weight: 700;
  letter-spacing: 6rpx;
  color: var(--brand, #c8752b);
}

.invite__note {
  display: block;
  margin-top: 16rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-400});
}

.invite__close {
  margin-top: 16rpx;
}
</style>
