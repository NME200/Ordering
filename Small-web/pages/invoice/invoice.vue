<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import {
  applyInvoice,
  createInvoiceTitle,
  ensureSession,
  fetchInvoiceTitles,
  fetchInvoiceableOrders,
  fetchMyInvoices,
  removeInvoiceTitle,
} from '@/api/customer';
import { useAppStore } from '@/store/app';
import type { InvoiceableOrder, InvoiceRow, InvoiceTitle } from '@/types/customer';
import { dayClock, yuan } from '@/utils/format';

type TabKey = 'available' | 'processing' | 'issued';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'available', label: '可开票' },
  { key: 'processing', label: '开票中' },
  { key: 'issued', label: '已开票' },
];

/** 与后端 UpsertInvoiceTitleDto 同一套校验，提示文案照抄，免得两边说法不一致让人对不上号 */
const TAX_RE = /^[0-9A-Z]{15}$|^[0-9A-Z]{18}$|^[0-9A-Z]{20}$/;
const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;
const CODE_TAX = '税号应为 15 / 18 / 20 位数字或大写字母';

interface TitleForm {
  kind: 'personal' | 'enterprise';
  title: string;
  taxNo: string;
  email: string;
  isDefault: boolean;
}

function emptyTitleForm(): TitleForm {
  return { kind: 'personal', title: '', taxNo: '', email: '', isDefault: false };
}

/**
 * 发票管理（ui.md 第 16 节）。
 *
 * 本轮**没有接任何开票服务商**：顾客提交后申请落到商户，由门店线下开电子票再回填发票号，
 * 所以界面一律说「等待门店开票」，不写「已为您自动开具」那种兑现不了的承诺。
 * 「可开票」页签返回的是订单而不是申请，和另外两页签数据结构不同，各自独立取。
 */
export default defineComponent({
  components: { LineIcon },

  setup() {
    const app = useAppStore();

    const tab = ref<TabKey>('available');
    const available = ref<InvoiceableOrder[]>([]);
    const processing = ref<InvoiceRow[]>([]);
    const issued = ref<InvoiceRow[]>([]);
    const titles = ref<InvoiceTitle[]>([]);

    const loading = ref(false);
    const error = ref('');
    const titlePanel = ref(false);
    /** '' / rules / pick / title —— 四个弹层共用一套遮罩，同一时刻只可能开一个 */
    const sheet = ref('');
    const submitting = ref(false);
    /** 从「去开票」进来时记住的那一单；抬头选完就用它提交 */
    const pending = ref<InvoiceableOrder | null>(null);
    /** 走「个人」快速入口时，抬头建完直接替顾客提交这一单，省一次返回操作 */
    const quickApply = ref(false);

    const titleForm = ref<TitleForm>(emptyTitleForm());

    const defaultTitle = computed(() => titles.value.find((item) => item.isDefault) ?? titles.value[0] ?? null);
    const current = computed(() => {
      if (tab.value === 'available') return available.value.length;
      if (tab.value === 'processing') return processing.value.length;
      return issued.value.length;
    });

    async function load(next = tab.value): Promise<void> {
      loading.value = true;
      error.value = '';
      try {
        // 发票接口全部要顾客令牌，冷启动直达这一页时令牌还没生成
        await ensureSession();
        if (next === 'available') available.value = await fetchInvoiceableOrders();
        else if (next === 'processing') processing.value = await fetchMyInvoices('processing');
        else issued.value = await fetchMyInvoices('issued');
      } catch (cause) {
        error.value = (cause as Error).message || '发票数据加载失败';
      } finally {
        loading.value = false;
      }
    }

    async function loadTitles(): Promise<void> {
      try {
        titles.value = await fetchInvoiceTitles();
      } catch {
        // 失败已由 request toast，保留上一次列表
      }
    }

    function switchTab(next: TabKey): void {
      if (tab.value === next) return;
      tab.value = next;
      void load(next);
    }

    function kindLabel(kind: InvoiceTitle['kind']): string {
      return kind === 'enterprise' ? '企业' : '个人';
    }

    function daysText(order: InvoiceableOrder): string {
      return order.remainDays <= 0 ? '今天到期，逾期不可申请' : `还剩 ${order.remainDays} 天可开票`;
    }

    // ==================== 开票申请 ====================

    async function openApply(order: InvoiceableOrder): Promise<void> {
      pending.value = order;
      await loadTitles();
      sheet.value = 'pick';
    }

    async function submitApply(titleId: number): Promise<void> {
      const order = pending.value;
      if (!order || submitting.value) return;
      submitting.value = true;
      try {
        await applyInvoice(order.orderId, titleId);
        sheet.value = '';
        pending.value = null;
        uni.showToast({ title: '已提交，等待门店开票', icon: 'none' });
        // 换列表：这一单从「可开票」消失；「开票中」在切页签时按需重取
        available.value = available.value.filter((item) => item.orderId !== order.orderId);
        processing.value = [];
      } catch {
        // 后端会把「未完成 / 超 30 天 / 已申请过」原文 toast 出来
      } finally {
        submitting.value = false;
      }
    }

    /** 快速抬头：企业抬头要税号，个人抬头只差邮箱，所以它只是把表单预填好 */
    function quickPersonal(): void {
      quickApply.value = true;
      titleForm.value = { kind: 'personal', title: '个人', taxNo: '', email: '', isDefault: true };
      sheet.value = 'title';
    }

    function openTitleForm(): void {
      quickApply.value = false;
      titleForm.value = emptyTitleForm();
      sheet.value = 'title';
    }

    function closeSheet(): void {
      if (submitting.value) return;
      sheet.value = '';
      pending.value = null;
      quickApply.value = false;
    }

    function pickKind(kind: TitleForm['kind']): void {
      titleForm.value.kind = kind;
    }

    async function saveTitle(): Promise<void> {
      if (submitting.value) return;
      const value = titleForm.value;
      const name = value.title.trim();
      const taxNo = value.taxNo.trim().toUpperCase();
      const email = value.email.trim();

      let message = '';
      if (!name) message = '请填写抬头名称';
      else if (name.length > 64) message = '抬头名称最长 64 个字符';
      else if (value.kind === 'enterprise' && !taxNo) message = '企业抬头必须填写税号';
      else if (value.kind === 'enterprise' && !TAX_RE.test(taxNo)) message = CODE_TAX;
      else if (!EMAIL_RE.test(email)) message = '邮箱格式不正确';
      if (message) {
        uni.showToast({ title: message, icon: 'none' });
        return;
      }

      submitting.value = true;
      try {
        const created = await createInvoiceTitle({
          kind: value.kind,
          title: name,
          taxNo: value.kind === 'enterprise' ? taxNo : undefined,
          email,
          isDefault: value.isDefault ? 1 : 0,
        });
        await loadTitles();
        const order = pending.value;
        if (quickApply.value && order) {
          quickApply.value = false;
          await submitApply(created.id);
        } else {
          // 从「去开票」进来的人要能立刻用上新抬头，所以退回选抬头那一层，而不是把弹层整个关掉
          sheet.value = pending.value ? 'pick' : '';
          uni.showToast({ title: '抬头已保存', icon: 'none' });
        }
      } catch {
        // 后端原文已 toast
      } finally {
        submitting.value = false;
      }
    }

    function askRemoveTitle(item: InvoiceTitle): void {
      uni.showModal({
        title: '删除抬头',
        content: `确定删除「${item.title}」吗？已提交的开票申请不受影响。`,
        confirmText: '删除',
        success: (res) => {
          if (!res.confirm) return;
          void removeInvoiceTitle(item.id).then(() => loadTitles());
        },
      });
    }

    // ==================== 已开票 ====================

    /**
     * 电子发票的载体是商户回填的一条链接（本轮没有文件预览，也没有邮箱推送）。
     * 复制后提示去浏览器打开，比在小程序里塞一个打不开的 webview 诚实。
     */
    function viewInvoice(row: InvoiceRow): void {
      if (!row.invoiceUrl) {
        uni.showToast({ title: '商户尚未上传电子发票', icon: 'none' });
        return;
      }
      uni.setClipboardData({
        data: row.invoiceUrl,
        success: () => uni.showToast({ title: '发票链接已复制，请在浏览器中打开', icon: 'none' }),
      });
    }

    return {
      app,
      TABS,
      tab,
      available,
      processing,
      issued,
      titles,
      loading,
      error,
      titlePanel,
      sheet,
      submitting,
      pending,
      titleForm,
      defaultTitle,
      current,
      load,
      loadTitles,
      switchTab,
      kindLabel,
      daysText,
      openApply,
      submitApply,
      quickPersonal,
      openTitleForm,
      closeSheet,
      pickKind,
      saveTitle,
      askRemoveTitle,
      viewInvoice,
      dayClock,
      yuan,
    };
  },

  onLoad() {
    void this.app.loadConfig();
    void this.load();
    void this.loadTitles();
  },

  onPullDownRefresh() {
    void this.load().finally(() => uni.stopPullDownRefresh());
  },
});
</script>

<template>
  <view class="invoice" :style="app.cssVars">
    <view class="titles" :class="{ 'is-open': titlePanel }">
      <view class="titles__head" @click="titlePanel = !titlePanel">
        <text class="titles__label">抬头管理</text>
        <view class="titles__peek">
          <text v-if="defaultTitle" class="titles__value">{{ defaultTitle.title }}</text>
          <text v-else-if="!loading" class="titles__value titles__value--none">还没有抬头</text>
          <LineIcon :name="titlePanel ? 'down' : 'right'" :size="14" tone="sub" />
        </view>
      </view>
      <view v-if="titlePanel" class="titles__body">
        <view v-for="item in titles" :key="item.id" class="trow">
          <view class="trow__main">
            <view class="trow__line">
              <text class="trow__name">{{ item.title }}</text>
              <text class="trow__kind">{{ kindLabel(item.kind) }}</text>
              <text v-if="item.isDefault" class="trow__default">默认</text>
            </view>
            <text class="trow__meta num">{{ item.taxNo ? `税号 ${item.taxNo}` : `邮箱 ${item.email}` }}</text>
          </view>
          <view class="op" @click="askRemoveTitle(item)">
            <LineIcon name="trash" :size="16" tone="sub" />
          </view>
        </view>
        <view v-if="!titles.length" class="trow trow--empty">
          <text class="trow__meta">还没建过抬头。企业抬头要填税号，邮箱用于接收电子发票。</text>
        </view>
        <view class="btn-ghost titles__add" @click="openTitleForm">＋ 新增抬头</view>
      </view>
    </view>

    <view class="tabs">
      <view class="tabs__items">
        <view
          v-for="item in TABS"
          :key="item.key"
          class="tabs__item"
          :class="{ 'is-on': tab === item.key }"
          @click="switchTab(item.key)"
        >
          <text>{{ item.label }}</text>
        </view>
      </view>
      <text class="tabs__rule" @click="sheet = 'rules'">开票规则</text>
    </view>

    <view v-if="error" class="tip">
      <text>{{ error }}</text>
      <text class="tip__retry" @click="load">重试</text>
    </view>

    <template v-else>
      <view v-if="loading && !current" class="tip">正在加载…</view>

      <!-- 可开票 -->
      <view v-else-if="tab === 'available'" class="list">
        <view v-for="item in available" :key="item.orderId" class="card row">
          <view class="row__top">
            <view class="row__store">
              <LineIcon name="store" :size="16" tone="sub" />
              <text class="row__name">{{ item.storeName }}</text>
            </view>
            <text class="row__money num">¥{{ yuan(item.amount) }}</text>
          </view>
          <text class="row__no num">{{ item.orderNo }} · {{ dayClock(item.completedAt) }} 完成</text>
          <view class="row__foot">
            <text class="row__days">{{ daysText(item) }}</text>
            <text class="btn-ghost row__btn" @click="openApply(item)">去开票</text>
          </view>
        </view>
        <view v-if="!available.length" class="tip">
          <text>没有可开票的订单</text>
          <text class="tip__sub">只有已完成、且完成不超过 30 天的订单能申请开票</text>
        </view>
      </view>

      <!-- 开票中 -->
      <view v-else-if="tab === 'processing'" class="list">
        <view v-for="item in processing" :key="item.id" class="card row">
          <view class="row__top">
            <view class="row__store">
              <text class="row__name">{{ item.title }}</text>
              <text class="row__kind">{{ kindLabel(item.kind) }}</text>
            </view>
            <text class="row__status">{{ item.statusLabel }}</text>
          </view>
          <text class="row__no num">{{ item.orderNo }} · ¥{{ yuan(item.amount) }}</text>
          <text class="row__no num">申请于 {{ dayClock(item.createdAt) }}</text>
          <text v-if="item.status === 'rejected'" class="row__note">驳回原因：{{ item.handleNote || '商户未填写原因' }}</text>
          <text v-else class="row__note">门店开票后会出现在「已开票」页签。</text>
        </view>
        <view v-if="!processing.length" class="tip">
          <text>没有在处理的开票申请</text>
        </view>
      </view>

      <!-- 已开票 -->
      <view v-else class="list">
        <view v-for="item in issued" :key="item.id" class="card row">
          <view class="row__top">
            <view class="row__store">
              <text class="row__name">{{ item.title }}</text>
              <text class="row__kind">{{ kindLabel(item.kind) }}</text>
            </view>
            <text class="row__money num">¥{{ yuan(item.amount) }}</text>
          </view>
          <text class="row__no num">{{ item.orderNo }}</text>
          <text class="row__no num">发票号 {{ item.invoiceNo || '—' }} · {{ dayClock(item.handledAt) }}</text>
          <view class="row__foot">
            <text class="row__days">电子发票由门店上传，链接有效期以商户为准</text>
            <text class="btn-ghost row__btn" @click="viewInvoice(item)">查看发票</text>
          </view>
        </view>
        <view v-if="!issued.length" class="tip">
          <text>还没有已开好的发票</text>
        </view>
      </view>

      <text v-if="current" class="end">已全部加载完成</text>
    </template>

    <view v-if="sheet" class="sheet-mask" @click="closeSheet">
      <view class="sheet" @click.stop>
        <view class="sheet__handle" />

        <!-- 开票规则 -->
        <template v-if="sheet === 'rules'">
          <view class="sheet__head">
            <text class="sheet__title">开票规则</text>
          </view>
          <view class="sheet__body rules">
            <text class="rules__line">· 仅本人已完成的订单可申请开票</text>
            <text class="rules__line">· 完成之日起 30 天内有效，逾期不再受理</text>
            <text class="rules__line">· 一单一票，同一订单只能申请一次</text>
            <text class="rules__line">· 开票金额等于订单实付，优惠券抵扣的部分不在内</text>
            <text class="rules__line">· 抬头支持个人与企业，企业抬头必须填写税号</text>
            <!-- 本轮没接开票服务商：写成「自动开具」就是对顾客假承诺，驳回与等待都会被当成 bug -->
            <text class="rules__hi">本轮由商户人工开票：提交后由门店线下开具电子发票并回填发票号，
              不是系统自动开具。长时间停在「待开票 / 开票中」请直接联系门店。</text>
          </view>
          <view class="sheet__foot">
            <view class="btn-main" @click="closeSheet">知道了</view>
          </view>
        </template>

        <!-- 选抬头 -->
        <template v-else-if="sheet === 'pick'">
          <view class="sheet__head">
            <text class="sheet__title">选择抬头</text>
            <text v-if="pending" class="sheet__sub num">¥{{ yuan(pending.amount) }}</text>
          </view>
          <scroll-view class="sheet__body" scroll-y>
            <view v-for="item in titles" :key="item.id" class="prow" @click="submitApply(item.id)">
              <view class="prow__main">
                <view class="prow__line">
                  <text class="prow__name">{{ item.title }}</text>
                  <text class="row__kind">{{ kindLabel(item.kind) }}</text>
                  <text v-if="item.isDefault" class="trow__default">默认</text>
                </view>
                <text class="prow__meta num">{{ item.taxNo ? `税号 ${item.taxNo}` : `邮箱 ${item.email}` }}</text>
              </view>
              <LineIcon name="right" :size="16" tone="sub" />
            </view>
            <view v-if="!titles.length" class="tip tip--sheet">
              <text>还没有可用抬头</text>
              <text class="tip__sub">先用下面的「个人」快速抬头，或新建一个企业抬头</text>
            </view>
          </scroll-view>
          <view class="sheet__foot picks">
            <view class="btn-ghost picks__btn" @click="quickPersonal">个人（快速）</view>
            <view class="btn-ghost picks__btn" @click="openTitleForm">新建抬头</view>
          </view>
        </template>

        <!-- 抬头表单 -->
        <template v-else>
          <view class="sheet__head">
            <text class="sheet__title">新增抬头</text>
          </view>
          <view class="sheet__close" @click="closeSheet">
            <LineIcon name="close" :size="18" tone="sub" />
          </view>
          <scroll-view class="sheet__body" scroll-y>
            <view class="field field--stack">
              <text class="field__label">抬头类型</text>
              <view class="chips">
                <view class="chip chips__item" :class="{ 'is-on': titleForm.kind === 'personal' }" @click="pickKind('personal')">
                  <text>个人</text>
                </view>
                <view class="chip chips__item" :class="{ 'is-on': titleForm.kind === 'enterprise' }" @click="pickKind('enterprise')">
                  <text>企业</text>
                </view>
              </view>
            </view>

            <view class="field">
              <text class="field__label">抬头名称</text>
              <input
                v-model="titleForm.title"
                class="field__input"
                placeholder="个人可填姓名，企业填全称"
                placeholder-class="field__ph"
                maxlength="64"
              />
            </view>

            <view v-if="titleForm.kind === 'enterprise'" class="field">
              <text class="field__label">税号</text>
              <input
                v-model="titleForm.taxNo"
                class="field__input"
                type="text"
                placeholder="15 / 18 / 20 位，数字或大写字母"
                placeholder-class="field__ph"
                maxlength="20"
              />
            </view>

            <view class="field">
              <text class="field__label">邮箱</text>
              <input
                v-model="titleForm.email"
                class="field__input"
                type="text"
                placeholder="接收电子发票的邮箱"
                placeholder-class="field__ph"
                maxlength="64"
              />
            </view>

            <view class="field">
              <text class="field__label">设为默认</text>
              <view class="switch" :class="{ 'is-on': titleForm.isDefault }" @click="titleForm.isDefault = !titleForm.isDefault">
                <view class="switch__dot" />
              </view>
              <text class="field__tail">第一个抬头会自动设为默认</text>
            </view>

            <text class="hint">邮箱必填：本轮发票由门店人工开具，开好后按这个地址把电子发票发给你。抬头最多存 20 个。</text>
          </scroll-view>
          <view class="sheet__foot">
            <view class="btn-main" :class="{ 'is-off': submitting }" @click="saveTitle">
              {{ submitting ? '正在保存…' : '保存抬头' }}
            </view>
          </view>
        </template>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.invoice {
  min-height: 100vh;
  padding: 8rpx var(--content-pad, 28rpx) 60rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.titles {
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &.is-open {
    padding-bottom: 20rpx;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx 0;
  }

  &__label {
    font-size: 28rpx;
    font-weight: 600;
  }

  &__peek {
    display: flex;
    align-items: center;
    gap: 10rpx;
    min-width: 0;
  }

  &__value {
    font-size: 24rpx;
    color: var(--ink-2, #{$n-500});

    &--none {
      color: var(--ink-2, #{$n-400});
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  &__add {
    height: 72rpx;
    line-height: 70rpx;
    font-size: 26rpx;
  }
}

.trow {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  border-radius: var(--radius, 16px);
  background-color: var(--card-bg, rgba(255, 255, 255, 0.7));

  &--empty {
    padding: 20rpx 24rpx;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__line {
    display: flex;
    align-items: baseline;
    gap: 12rpx;
  }

  &__name {
    font-size: 28rpx;
    font-weight: 600;
  }

  &__kind {
    font-size: 20rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__default {
    font-size: 22rpx;
    font-weight: 600;
    color: var(--brand, #{$brand});
  }

  &__meta {
    display: block;
    margin-top: 6rpx;
    font-size: 22rpx;
    color: var(--ink-2, #{$n-400});
  }
}

.tabs {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: 8rpx 0 20rpx;

  &__items {
    flex: 1;
    display: flex;
    gap: 12rpx;
  }

  &__item {
    padding: 12rpx 28rpx;
    border-radius: 999rpx;
    background-color: var(--card-bg, rgba(255, 255, 255, 0.7));
    font-size: 26rpx;
    color: var(--ink-2, #{$n-500});

    &.is-on {
      background-color: var(--brand, #{$brand});
      color: #fff;
      font-weight: 600;
    }
  }

  &__rule {
    flex: none;
    font-size: 24rpx;
    color: var(--brand, #{$brand});
  }
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--card-gap, 8px);
}

.row {
  box-sizing: border-box;
  width: 100%;
  padding: 28rpx 28rpx 24rpx;

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }

  &__store {
    display: flex;
    align-items: center;
    gap: 10rpx;
    min-width: 0;
  }

  &__name {
    font-size: 30rpx;
    font-weight: 600;
  }

  &__kind {
    padding: 2rpx 12rpx;
    border-radius: 999rpx;
    background-color: var(--divider, #{$n-200});
    font-size: 20rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__status {
    flex: none;
    font-size: 24rpx;
    font-weight: 600;
    color: var(--brand-sub, #{$brand-sub});
  }

  &__money {
    flex: none;
    font-size: 32rpx;
    font-weight: 700;
    color: var(--brand, #{$brand});
  }

  &__no {
    display: block;
    margin-top: 10rpx;
    font-size: 22rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__note {
    display: block;
    margin-top: 12rpx;
    font-size: 22rpx;
    line-height: 1.6;
    color: var(--ink-2, #{$n-500});
  }

  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    margin-top: 20rpx;
    padding-top: 20rpx;
    border-top: 1rpx solid var(--divider, #{$n-200});
  }

  &__days {
    flex: 1;
    min-width: 0;
    font-size: 22rpx;
    line-height: 1.5;
    color: var(--ink-2, #{$n-500});
  }
}

/* 全局 .btn-ghost 是给整行按钮用的，这里要的是行内小胶囊，靠双类名压过它 */
.row__btn.btn-ghost {
  flex: none;
  height: 64rpx;
  line-height: 62rpx;
  padding: 0 32rpx;
  font-size: 26rpx;
}

.tip {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 120rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: var(--ink-2, #{$n-500});

  &--sheet {
    padding: 60rpx 0;
  }

  &__retry {
    color: var(--brand, #{$brand});
  }

  &__sub {
    font-size: 22rpx;
    line-height: 1.6;
    color: var(--ink-2, #{$n-400});
  }
}

.end {
  display: block;
  margin-top: 36rpx;
  text-align: center;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.op {
  flex: none;
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet__sub {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--brand, #{$brand});
}

.rules {
  display: flex;
  flex-direction: column;
  gap: 14rpx;

  &__line {
    font-size: 26rpx;
    line-height: 1.7;
    color: var(--ink, #{$n-900});
  }

  &__hi {
    margin-top: 8rpx;
    padding: 20rpx 24rpx;
    border-radius: var(--radius, 16px);
    background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
    font-size: 22rpx;
    line-height: 1.7;
    color: var(--brand-sub, #{$brand-sub});
  }
}

.prow {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__line {
    display: flex;
    align-items: baseline;
    gap: 12rpx;
  }

  &__name {
    font-size: 28rpx;
    font-weight: 600;
  }

  &__meta {
    display: block;
    margin-top: 6rpx;
    font-size: 22rpx;
    color: var(--ink-2, #{$n-400});
  }
}

.picks {
  display: flex;
  gap: 20rpx;

  &__btn {
    flex: 1;
  }
}

.field {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &--stack {
    flex-direction: column;
    align-items: flex-start;
    gap: 16rpx;
  }

  &__label {
    flex: none;
    width: 140rpx;
    font-size: 26rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__input {
    flex: 1;
    min-width: 0;
    font-size: 28rpx;
  }

  &__tail {
    flex: 1;
    text-align: right;
    font-size: 20rpx;
    color: var(--ink-2, #{$n-400});
  }

  &__ph {
    color: var(--ink-2, #{$n-400});
  }
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;

  &__item {
    font-size: 26rpx;
  }
}

/* 原生 switch 只能传色值字面量，吃不到 var(--brand)，换肤会脱节，所以自绘 */
.switch {
  box-sizing: border-box;
  width: 88rpx;
  height: 48rpx;
  padding: 4rpx;
  border-radius: 999rpx;
  background-color: var(--divider, #{$n-200});
  transition: background-color 0.2s;

  &__dot {
    width: 40rpx;
    height: 40rpx;
    border-radius: 50%;
    background-color: #fff;
  }

  &.is-on {
    background-color: var(--brand, #{$brand});

    .switch__dot {
      margin-left: 40rpx;
    }
  }
}

.hint {
  display: block;
  padding: 12rpx 0 4rpx;
  font-size: 20rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-400});
}
</style>
