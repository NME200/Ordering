<script setup lang="ts">
import { computed } from 'vue';
import type { AppTheme, LayoutSection, PreviewData } from '../../types/app-config';

/**
 * 手机壳里的单个组件预览。
 *
 * ⚠️ 这是 Admin-web 用 Vue **复刻的近似样式**，不是小程序真渲染 ——
 * 两端只共用 `section.props` 与主题 token，样式细节以小程序为准。
 * 所以这里刻意不写任何业务逻辑：能显示的信息一律来自 props 与 preview 数据。
 */
const props = defineProps<{
  section: LayoutSection;
  theme: AppTheme;
  /** 预览用的真实数据（选了预览门店时才有） */
  preview: PreviewData;
}>();

const radius = computed(() => `${props.theme.cardRadius ?? 12}px`);
const primary = computed(() => props.theme.primaryColor ?? '#c2603c');
const textPrimary = computed(() => props.theme.textPrimary ?? '#181615');

const sp = computed(() => props.section.props);

/** 轮播只显示第一张：预览框就那么大，动效也没意义 */
const bannerImage = computed(() => sp.value.images?.[0]?.url ?? '');

const navItems = computed(() => {
  const names =
    props.preview.categories.length > 0
      ? props.preview.categories
      : ['热菜', '饮品', '主食', '小食', '甜品', '汤羹'];
  const list = names.slice(0, (sp.value.columns ?? 4) - (sp.value.showAll ? 1 : 0));
  return sp.value.showAll ? [...list, '全部'] : list;
});

const hotDishes = computed(() => {
  const source = props.preview.dishes;
  if (sp.value.source === 'manual' && sp.value.dishIds?.length) {
    return source.filter((dish) => sp.value.dishIds?.includes(dish.id));
  }
  return source.slice(0, 4);
});
</script>

<template>
  <div class="preview-block">
    <!-- 首页轮播 -->
    <div
      v-if="section.key === 'banner'"
      class="banner"
      :style="{ height: `${sp.height ?? 160}px`, borderRadius: `${sp.radius ?? 12}px` }"
    >
      <img v-if="bannerImage" :src="bannerImage" alt="" />
      <span v-else class="banner__placeholder">轮播位：还没有图片</span>
    </div>

    <!-- 公告栏 -->
    <div
      v-else-if="section.key === 'notice'"
      class="notice"
      :style="{ background: sp.bgColor, color: sp.textColor }"
    >
      <img v-if="sp.iconUrl" class="notice__icon" :src="sp.iconUrl" alt="" />
      <span>{{ sp.text || '公告位：填写一行节假日通知' }}</span>
    </div>

    <!-- 分类导航 -->
    <div v-else-if="section.key === 'categoryNav'" class="nav">
      <p class="nav__title" :style="{ color: textPrimary }">{{ sp.title || '点菜' }}</p>
      <div class="nav__grid" :style="{ gridTemplateColumns: `repeat(${sp.columns ?? 4}, 1fr)` }">
        <div v-for="name in navItems" :key="name" class="nav__cell">
          <span class="nav__dot" :style="{ background: primary }" />
          <span class="nav__name">{{ name }}</span>
        </div>
      </div>
    </div>

    <!-- 热销推荐位 -->
    <div v-else-if="section.key === 'hotDishes'" class="hot">
      <p class="hot__title" :style="{ color: textPrimary }">
        {{ sp.title || '本店热销' }}
        <span v-if="sp.source === 'recommend'" class="hot__badge" :style="{ background: primary }">
          自动
        </span>
      </p>
      <div v-if="hotDishes.length" class="hot__list">
        <div v-for="dish in hotDishes" :key="dish.id" class="hot__item" :style="{ borderRadius: radius }">
          <img v-if="dish.imageUrl" :src="dish.imageUrl" alt="" />
          <span v-else class="hot__img-placeholder" />
          <p class="hot__name">{{ dish.name }}</p>
          <p v-if="sp.showPrice" class="hot__price num" :style="{ color: primary }">¥{{ (dish.price / 100).toFixed(2) }}</p>
        </div>
      </div>
      <p v-else class="hot__empty">选择预览门店后可看到真实推荐菜</p>
    </div>

    <div v-else class="unknown">未知组件：{{ section.key }}</div>
  </div>
</template>

<style scoped lang="scss">
.preview-block {
  padding: 10px 12px;
}

.banner {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, #f3dfd8, #edcfc5);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__placeholder {
    font-size: 12px;
    color: #9a8d86;
  }
}

.notice {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;

  &__icon {
    width: 14px;
    height: 14px;
    object-fit: contain;
  }
}

.nav {
  &__title {
    margin: 0 0 8px;
    font-size: 13px;
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

  &__dot {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    opacity: 0.18;
  }

  &__name {
    font-size: 11px;
    color: #6b615c;
  }
}

.hot {
  &__title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
  }

  &__badge {
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 10px;
    color: #fff;
  }

  &__list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  &__item {
    overflow: hidden;
    background: #fff;
    border: 1px solid #f1eeeb;
  }

  &__img-placeholder {
    display: block;
    width: 100%;
    height: 56px;
    background: linear-gradient(135deg, #f3dfd8, #f1eeeb);
  }

  &__item img {
    display: block;
    width: 100%;
    height: 56px;
    object-fit: cover;
  }

  &__name {
    margin: 6px 8px 0;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__price {
    margin: 2px 8px 8px;
    font-size: 12px;
    font-weight: 600;
  }

  &__empty {
    margin: 0;
    font-size: 11px;
    color: #a29790;
  }
}

.unknown {
  font-size: 12px;
  color: #a29790;
}
</style>
