<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * 大屏外壳：16:9 设计稿 + 等比缩放适配。
 *
 * 为什么是「按 1920×1080 画好再整体 scale」而不是写一堆响应式断点：
 * 屏要挂在不了解的电视 / 投影上，断点方案每换一块屏幕都要回来改一遍；
 * 整体缩放只保证一件事 —— 版式关系永远不变，只是变大变小。
 *
 * 深色与字号也刻意**不跟后台主题变量走**：后台是白天办公用的，大屏是几米外看的，
 * 两套视觉凑在一起只会两边都难看。
 */
const props = defineProps<{
  title: string;
  /** 统计范围，如「示例餐饮」「三新路店」「全平台」 */
  subtitle?: string;
  /** 最近一次成功刷新的时刻；为空表示还没拿到数据 */
  updatedAt?: string;
  /** 最近一次失败的原因，非空时右上角亮灰点并显示小字 */
  error?: string;
}>();

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

const scale = ref(1);
const clock = ref('');
let ticker: ReturnType<typeof setInterval> | null = null;

function fit(): void {
  scale.value = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
}

function tick(): void {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  clock.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function goFullscreen(): void {
  const element = document.documentElement;
  if (document.fullscreenElement) {
    void document.exitFullscreen?.();
    return;
  }
  void element.requestFullscreen?.().catch(() => undefined);
}

const stale = computed(() => Boolean(props.error));

onMounted(() => {
  fit();
  tick();
  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', fit);
  ticker = setInterval(tick, 1000);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', fit);
  document.removeEventListener('fullscreenchange', fit);
  if (ticker) {
    clearInterval(ticker);
  }
});
</script>

<template>
  <div class="screen-stage">
    <div class="screen" :style="{ transform: `scale(${scale})` }">
      <header class="screen__head">
        <div class="screen__heading">
          <h1 class="screen__title">{{ title }}</h1>
          <p v-if="subtitle" class="screen__subtitle">{{ subtitle }}</p>
        </div>
        <div class="screen__meta">
          <span class="screen__dot" :class="{ 'is-stale': stale }" />
          <span class="screen__updated">
            {{ stale ? '数据没刷新成功，画面是上一次的' : `数据更新于 ${updatedAt || '—'}` }}
          </span>
          <strong class="screen__clock">{{ clock }}</strong>
          <button type="button" class="screen__fs" @click="goFullscreen">全屏</button>
        </div>
      </header>

      <main class="screen__body">
        <slot />
      </main>

      <p v-if="error" class="screen__error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
/*
 * 大屏配色在这里自成一套（CSS 变量挂在 .screen 上，子组件直接 var() 取用）。
 * 后台的 tokens.scss 是浅色办公向的，几米外看屏要的是高对比深色，两者不通用。
 */
.screen-stage {
  position: fixed;
  inset: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #05080f;
}

.screen {
  --screen-ink: #e8eefb;
  --screen-ink-2: #8fa0c0;
  --screen-line: rgba(140, 165, 205, 0.18);
  --screen-panel: rgba(19, 28, 48, 0.72);
  --screen-brand: #f0a94b;
  --screen-cool: #4fb0e5;
  --screen-ok: #3ecf8e;
  --screen-warn: #e2a83a;
  --screen-num: 'DIN Alternate', 'Bahnschrift', 'Segoe UI', system-ui, sans-serif;

  position: relative;
  box-sizing: border-box;
  width: 1920px;
  height: 1080px;
  flex: none;
  padding: 34px 40px 28px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  color: var(--screen-ink);
  background:
    radial-gradient(1200px 620px at 12% -10%, rgba(46, 110, 220, 0.22), transparent 60%),
    radial-gradient(900px 520px at 92% 6%, rgba(240, 169, 75, 0.14), transparent 62%),
    linear-gradient(160deg, #0a1120 0%, #070c17 55%, #05080f 100%);
}

.screen__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--screen-line);
}

.screen__title {
  margin: 0;
  font-size: 34px;
  font-weight: 700;
  letter-spacing: 2px;
}

.screen__subtitle {
  margin: 8px 0 0;
  font-size: 16px;
  color: var(--screen-ink-2);
}

.screen__meta {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 15px;
  color: var(--screen-ink-2);
}

.screen__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--screen-ok);
  box-shadow: 0 0 12px rgba(62, 207, 142, 0.8);

  &.is-stale {
    background-color: var(--screen-warn);
    box-shadow: 0 0 12px rgba(226, 168, 58, 0.8);
  }
}

.screen__clock {
  font-family: var(--screen-num);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--screen-ink);
  font-variant-numeric: tabular-nums;
}

.screen__fs {
  padding: 6px 16px;
  border: 1px solid var(--screen-line);
  border-radius: 4px;
  background-color: transparent;
  color: var(--screen-ink-2);
  font-size: 14px;
  cursor: pointer;

  &:hover {
    border-color: var(--screen-brand);
    color: var(--screen-brand);
  }
}

.screen__body {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 20px;
}

.screen__error {
  position: absolute;
  right: 40px;
  bottom: 10px;
  margin: 0;
  font-size: 13px;
  color: var(--screen-warn);
}
</style>
