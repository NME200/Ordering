<script setup lang="ts">
import { computed } from 'vue';
import LineIcon from './LineIcon.vue';
import type { AppTheme, LayoutSection, PreviewData } from '../../types/app-config';
import { ENUM_LABELS } from '../../types/app-config';

/**
 * 手机壳里的单个组件预览。
 *
 * ⚠️ 这是 Admin-web 用 Vue **复刻的近似样式**，不是小程序真渲染 ——
 * 两端只共用 `section.props` 与主题 token，样式细节以小程序为准。
 * 所以这里刻意不写任何业务逻辑：能显示的信息一律来自 props 与 preview 数据；
 * 图标在这里用文字占位，真机是小程序包内的线稿图标。
 */
const props = defineProps<{
  section: LayoutSection;
  theme: AppTheme;
  /** 预览用的真实数据（选了预览门店时才有） */
  preview: PreviewData;
}>();

const sp = computed(() => props.section.props);

const primary = computed(() => props.theme.primaryColor ?? '#c8752b');
const sub = computed(() => props.theme.subColor ?? '#8b5e3c');
const radius = computed(() => `${props.theme.radius ?? 16}px`);
/** 卡片底：跟着主题的不透明度走，运营一眼能看出「毛玻璃」与「纯白」的差别 */
const cardBg = computed(
  () => `rgba(255,255,255,${props.theme.cardAlpha ?? 0.7})`,
);

/** 轮播只显示第一张：预览框就那么大，动效也没意义 */
const bannerImage = computed(() => sp.value.images?.[0]?.url ?? '');

/** 宫格类组件共用一套渲染：项文案 + 图标位 */
const isGridLike = computed(() =>
  ['entryGrid', 'serviceGrid', 'orderEntry', 'benefitGrid'].includes(props.section.key),
);
const gridCols = computed(() => sp.value.cols ?? (props.section.key === 'entryGrid' ? 2 : 3));

/** 资产栏与券页签的项文案字段不一样（label vs text），统一取一个能显示的 */
function itemText(row: { text?: string; label?: string; key?: string }): string {
  return row.text || row.label || ENUM_LABELS[row.key ?? ''] || '未命名';
}

const shopPreview = computed(() =>
  (props.preview.storeName ? [props.preview.storeName, '未选预览门店时只显示这一家'] : ['门店名称'])
    .slice(0, 2),
);

const couponPreview = computed(() => [
  { amount: '¥5', rule: '满30可用', btn: sp.value.btnText || '立即使用' },
  { amount: '¥10', rule: '满50可用', btn: sp.value.btnText || '立即使用' },
]);
</script>

<template>
  <div class="preview-block">
    <!-- 品牌轮播 -->
    <div
      v-if="section.key === 'banner'"
      class="banner"
      :style="{ height: `${sp.height ?? 200}px`, borderRadius: `${sp.radius ?? 0}px` }"
    >
      <img v-if="bannerImage" :src="bannerImage" alt="" />
      <span v-else class="banner__ph">轮播位：还没有图片</span>
    </div>

    <!-- 搜索框 -->
    <div v-else-if="section.key === 'searchBar'" class="search" :style="{ background: cardBg }">
      <span>🔍</span>
      <span class="search__ph">{{ sp.placeholder || '搜索门店' }}</span>
    </div>

    <!-- 公告栏 -->
    <div
      v-else-if="section.key === 'notice'"
      class="notice"
      :style="{ background: sp.bgColor || 'rgba(200,117,43,.08)', color: sp.textColor || primary }"
    >
      <span>{{ sp.text || '公告位：填写一行节假日通知' }}</span>
    </div>

    <!-- 宫格类：场景入口 / 服务宫格 / 订单入口 / 会员权益 -->
    <div v-else-if="isGridLike" class="grid-block" :style="{ background: cardBg, borderRadius: radius }">
      <p v-if="sp.title" class="grid-block__title" :style="{ color: sub }">{{ sp.title }}</p>
      <div class="grid-block__grid" :style="{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }">
        <div v-for="(row, index) in sp.items ?? []" :key="index" class="grid-block__cell">
          <span class="grid-block__icon" :style="{ background: `${primary}14` }">
            <LineIcon :name="row.icon || 'store'" :size="20" :color="primary" />
          </span>
          <span class="grid-block__text">{{ itemText(row) }}</span>
        </div>
      </div>
      <p v-if="!(sp.items ?? []).length" class="grid-block__empty">还没有配置任何入口</p>
    </div>

    <!-- 门店列表 -->
    <div v-else-if="section.key === 'shopList'" class="shops">
      <p class="shops__head">
        <span :style="{ color: sub }">{{ sp.title || '附近门店' }}</span>
        <span class="shops__sort">{{ sp.sortMode === 'sales' ? '月售最高' : '距离最近' }}</span>
      </p>
      <div v-for="(name, index) in shopPreview" :key="index" class="shops__item" :style="{ background: cardBg, borderRadius: radius }">
        <span class="shops__logo" :style="{ background: `${primary}14`, color: primary }">{{ name.slice(0, 1) }}</span>
        <span class="shops__body">
          <b>{{ name }}</b>
          <i>月售 128 · {{ sp.showDistance === false ? '' : '距您 320m' }} · 09:00-21:00</i>
        </span>
        <span class="shops__enter" :style="{ borderColor: primary, color: primary }">进店</span>
      </div>
    </div>

    <!-- 领券入口 -->
    <div v-else-if="section.key === 'couponEntry'" class="line-card" :style="{ background: cardBg, borderRadius: radius }">
      <span class="line-card__icon" :style="{ background: `${primary}14` }">
        <LineIcon :name="sp.icon || 'coupon'" :size="18" :color="primary" />
      </span>
      <span class="line-card__body">
        <b>{{ sp.title || '领券中心' }}</b>
        <i :style="{ color: primary }">{{ sp.benefit || '点这里看看有什么券' }}</i>
      </span>
      <span class="line-card__arrow">›</span>
    </div>

    <!-- 用户头部 -->
    <div
      v-else-if="section.key === 'userHeader'"
      class="head"
      :style="{
        background: sp.bgType === 'image' && sp.bgImage
          ? `url(${sp.bgImage}) center/cover`
          : `linear-gradient(135deg, ${(sp.bgColors ?? [])[0] || primary}, ${(sp.bgColors ?? [])[1] || '#e8a860'})`,
      }"
    >
      <span class="head__avatar"><LineIcon name="user" :size="22" color="#ffffff" /></span>
      <span class="head__body">
        <b>未登录</b>
        <i>{{ sp.showId === false ? '' : 'ID 10044' }}{{ sp.bindPhoneTip ? ` · ${sp.bindPhoneTip}` : '' }}</i>
      </span>
    </div>

    <!-- 资产栏 -->
    <div v-else-if="section.key === 'assetBar'" class="assets" :style="{ background: cardBg, borderRadius: radius }">
      <div v-for="(row, index) in sp.items ?? []" :key="index" class="assets__i">
        <b class="num">—</b>
        <span>{{ itemText(row) }}</span>
      </div>
      <p v-if="!(sp.items ?? []).length" class="assets__empty">没有资产项</p>
    </div>

    <!-- 会员卡面 -->
    <div
      v-else-if="section.key === 'memberCard'"
      class="card-face"
      :style="{
        background: sp.bgType === 'image' && sp.bgImage
          ? `url(${sp.bgImage}) center/cover`
          : `linear-gradient(135deg, ${(sp.bgColors ?? [])[0] || '#3a2a1e'}, ${(sp.bgColors ?? [])[1] || '#8b5e3c'})`,
        borderRadius: radius,
      }"
    >
      <p class="card-face__top">
        <span>{{ sp.brandName || '品牌名' }}</span>
        <span>VIP</span>
      </p>
      <p v-if="sp.showCardNo !== false" class="card-face__no num">8801 2345 6789</p>
      <p class="card-face__bottom">
        <span>{{ sp.levelName || '会员等级' }}</span>
        <span v-if="sp.showGrowth !== false" class="card-face__growth">成长值 1280 / 2000</span>
      </p>
    </div>

    <!-- 成长任务 -->
    <div v-else-if="section.key === 'taskList'" class="tasks" :style="{ background: cardBg, borderRadius: radius }">
      <p v-if="sp.title" class="tasks__title" :style="{ color: sub }">{{ sp.title }}</p>
      <div v-for="(row, index) in sp.items ?? []" :key="index" class="tasks__i">
        <span>{{ row.text || '任务文案' }}</span>
        <b :style="{ color: primary }">{{ row.btnText || '去完成' }}</b>
      </div>
      <p v-if="!(sp.items ?? []).length" class="tasks__empty">还没有任务</p>
    </div>

    <!-- 底部按钮 -->
    <div v-else-if="section.key === 'footerButton'" class="footer-btn">
      <span class="footer-btn__i" :style="{ background: primary }">{{ sp.text || '立即开通会员' }}</span>
      <span class="footer-btn__alt">已开通时显示：{{ sp.openedText || '—' }}</span>
    </div>

    <!-- 券页签 -->
    <div v-else-if="section.key === 'couponTabs'" class="tabs">
      <span
        v-for="(row, index) in sp.items ?? []"
        :key="index"
        class="tabs__i"
        :class="{ 'is-on': index === (sp.defaultIndex ?? 0) }"
        :style="index === (sp.defaultIndex ?? 0) ? { color: primary } : {}"
      >
        {{ itemText(row) }}
      </span>
    </div>

    <!-- 券列表 -->
    <div v-else-if="section.key === 'couponList'" class="coupons">
      <div v-for="(row, index) in couponPreview" :key="index" class="coupon" :style="{ borderRadius: radius }">
        <span class="coupon__left" :style="{ background: primary }">
          <b class="num">{{ row.amount }}</b>
          <i>{{ row.rule }}</i>
        </span>
        <span class="coupon__body">
          <b>{{ preview.storeName || '门店名' }}</b>
          <i v-if="sp.showExpire !== false">2026.12.31 到期</i>
        </span>
        <span class="coupon__btn" :style="{ color: primary }">{{ row.btn }}</span>
      </div>
    </div>

    <!-- 规则入口 -->
    <div v-else-if="section.key === 'ruleEntry'" class="rule">
      <span>{{ sp.text || '使用规则' }}</span>
      <span class="rule__arrow">›</span>
    </div>

    <div v-else class="unknown">未知组件：{{ section.key }}</div>
  </div>
</template>

<style scoped lang="scss">
.preview-block {
  padding: 10px 12px;
  font-size: 12px;
  color: #3a322c;
}

.banner {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, #efe6dc, #e3d5c6);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__ph {
    color: #9a908a;
  }
}

.search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 999px;

  &__ph {
    color: #9a908a;
  }
}

.notice {
  padding: 9px 12px;
  border-radius: 10px;
  line-height: 1.5;
}

.grid-block {
  padding: 10px;

  &__title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
  }

  &__grid {
    display: grid;
    gap: 8px;
  }

  &__cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    font-size: 10px;
  }

  &__text {
    font-size: 11px;
  }

  &__empty {
    margin: 0;
    color: #9a908a;
  }
}

.shops {
  &__head {
    display: flex;
    justify-content: space-between;
    margin: 0 0 6px;
    font-weight: 600;
  }

  &__sort {
    font-weight: 400;
    color: #9a908a;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    margin-bottom: 6px;
  }

  &__logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    font-weight: 600;
  }

  &__body {
    flex: 1;
    display: flex;
    flex-direction: column;

    i {
      font-style: normal;
      font-size: 10.5px;
      color: #9a908a;
    }
  }

  &__enter {
    padding: 2px 10px;
    border: 1px solid;
    border-radius: 999px;
  }
}

.line-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }

  &__body {
    flex: 1;
    display: flex;
    flex-direction: column;

    i {
      font-style: normal;
      font-size: 10.5px;
    }
  }

  &__arrow {
    color: #9a908a;
  }
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 12px;
  border-radius: 12px;
  color: #fff;

  &__avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.25);
  }

  &__body {
    display: flex;
    flex-direction: column;

    i {
      font-style: normal;
      font-size: 10.5px;
      opacity: 0.85;
    }
  }
}

.assets {
  display: flex;
  padding: 12px 0;

  &__i {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;

    b {
      font-size: 17px;
    }

    span {
      font-size: 10.5px;
      color: #9a908a;
    }
  }

  &__empty {
    margin: 0 auto;
    color: #9a908a;
  }
}

.card-face {
  padding: 12px;
  color: #fff;

  &__top,
  &__bottom {
    display: flex;
    justify-content: space-between;
    margin: 0;
    font-size: 11px;
  }

  &__no {
    margin: 14px 0 12px;
    font-size: 16px;
    letter-spacing: 1px;
  }

  &__growth {
    opacity: 0.85;
  }
}

.tasks {
  padding: 10px;

  &__title {
    margin: 0 0 6px;
    font-weight: 600;
  }

  &__i {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
  }

  &__empty {
    margin: 0;
    color: #9a908a;
  }
}

.footer-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  &__i {
    width: 100%;
    padding: 9px 0;
    border-radius: 999px;
    text-align: center;
    color: #fff;
    font-weight: 600;
  }

  &__alt {
    font-size: 10.5px;
    color: #9a908a;
  }
}

.tabs {
  display: flex;
  gap: 14px;
  padding: 4px 2px;

  &__i {
    padding-bottom: 3px;
    color: #9a908a;

    &.is-on {
      font-weight: 600;
      border-bottom: 2px solid currentColor;
    }
  }
}

.coupons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.coupon {
  display: flex;
  align-items: center;
  overflow: hidden;
  background: #fff;
  border: 1px solid #efebe7;

  &__left {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 12px;
    color: #fff;

    b {
      font-size: 16px;
    }

    i {
      font-style: normal;
      font-size: 10px;
      opacity: 0.9;
    }
  }

  &__body {
    flex: 1;
    display: flex;
    flex-direction: column;

    i {
      font-style: normal;
      font-size: 10.5px;
      color: #9a908a;
    }
  }

  &__btn {
    padding: 3px 10px;
    border: 1px solid currentColor;
    border-radius: 999px;
    font-size: 11px;
  }
}

.rule {
  display: flex;
  justify-content: space-between;
  padding: 6px 2px;
  color: #9a908a;

  &__arrow {
    color: #c3bab2;
  }
}

.unknown {
  color: #9a908a;
}
</style>
