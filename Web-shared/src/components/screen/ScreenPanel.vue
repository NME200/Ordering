<script setup lang="ts">
/**
 * 大屏的一块面板。
 *
 * 只负责「标题 + 内容区 + 右下角可选说明」这层壳，不关心里面放图表还是列表 ——
 * 两块屏（商家 / 平台）的排布完全不同，能复用的只有这个壳。
 */
defineProps<{
  title: string;
  /** 标题右侧的小字，一般放口径说明，如「按支付时间归日」 */
  hint?: string;
}>();
</script>

<template>
  <section class="panel">
    <header class="panel__head">
      <h2 class="panel__title">{{ title }}</h2>
      <span v-if="hint" class="panel__hint">{{ hint }}</span>
    </header>
    <div class="panel__body">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">
.panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 18px 12px;
  border: 1px solid var(--screen-line);
  border-radius: 8px;
  background-color: var(--screen-panel);
  overflow: hidden;

  /* 左上角一道亮边，让一块块面板在深色底上分得开 */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 42px;
    height: 2px;
    background: linear-gradient(90deg, var(--screen-brand), transparent);
  }
}

.panel__head {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.panel__title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--screen-ink);
}

.panel__hint {
  font-size: 12px;
  color: var(--screen-ink-2);
}

.panel__body {
  flex: 1;
  min-height: 0;
}
</style>
