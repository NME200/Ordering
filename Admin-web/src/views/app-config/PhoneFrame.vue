<script setup lang="ts">
import { computed } from 'vue';
import LineIcon from './LineIcon.vue';
import type { AppConfigPageKey, AppTheme } from '../../types/app-config';
import { PAGE_META } from '../../types/app-config';

/**
 * 手机外壳（11.1 / 11.2 里那台机子）。
 *
 * 只画外壳：状态栏、标题、内容槽、底部三个 Tab。
 * 底色与主色跟着主题走 —— 运营在主题面板改一个色，这里立刻能看出来，
 * 不然「改完看不出效果」就只能靠发布到线上验证。
 *
 * 尺寸走 CSS 变量（`--phone-w` / `--phone-h`）由外层定：画布区很高，
 * 机身写死 340×560 就会像贴在墙上的邮票，四周全是空白。
 */
const props = defineProps<{
  theme: AppTheme;
  page: AppConfigPageKey;
  /** 撑满外层高度：画布里用，工作台里按内容自然高 */
  fill?: boolean;
}>();

const background = computed(() => props.theme.bgColor ?? '#faf8f6');
const primary = computed(() => props.theme.primaryColor ?? '#c8752b');
const ink = computed(() => props.theme.textColor ?? '#3a322c');
const title = computed(() => PAGE_META[props.page].label);

/** 底部三个 Tab 与小程序 pages.json 一致；选中色是编译期写死的，这里只作示意 */
const TABS = [
  { icon: 'home', text: '首页' },
  { icon: 'order', text: '订单' },
  { icon: 'user', text: '我的' },
];
</script>

<template>
  <div class="phone" :class="{ 'is-fill': fill }">
    <div class="phone__notch" />
    <div class="phone__status">
      <span class="num">9:41</span>
      <span class="phone__dots">•••</span>
    </div>
    <div class="phone__nav" :style="{ background, color: ink }">{{ title }}</div>
    <div class="phone__body" :style="{ background }">
      <slot />
    </div>
    <div class="phone__tabs">
      <div
        v-for="(tab, index) in TABS"
        :key="tab.text"
        class="phone__tab"
        :style="{ color: index === 0 ? primary : '#9a908a' }"
      >
        <LineIcon :name="tab.icon" :size="19" :color="index === 0 ? primary : '#c3bab2'" />
        <span>{{ tab.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.phone {
  /* 尺寸由外层用 CSS 变量传进来；这里只给默认值，
     绝不在本机元素上声明同名变量 —— 自己声明会盖掉继承来的，外层就调不动了 */
  display: flex;
  flex-direction: column;
  width: var(--phone-w, 390px);
  height: var(--phone-h, 780px);
  max-width: 100%;
  border: 9px solid #241d1a;
  border-radius: 46px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 20px 44px -20px rgba(36, 29, 26, 0.5);
}

/* 画布里跟随容器高度，别让机身下面空一截 */
.phone.is-fill {
  height: 100%;
  min-height: 560px;
}

.phone__notch {
  height: 20px;
  background-color: #fff;
}

.phone__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 2px;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.phone__dots {
  letter-spacing: 1px;
  opacity: 0.5;
}

.phone__nav {
  padding: 10px 0;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
}

.phone__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 12px 18px;
}

.phone__tabs {
  display: flex;
  border-top: 1px solid var(--neutral-200);
  background-color: #fff;
  padding-bottom: 5px;
}

.phone__tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 0 10px;
  font-size: 11px;
}
</style>
