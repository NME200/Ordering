<script setup lang="ts">
/** 错误页通用外壳：大号状态码 + 说明 + 操作位 */
defineProps<{
  code: string;
  title: string;
  description: string;
}>();
</script>

<template>
  <div class="error-page">
    <div class="error-page__inner rise-in">
      <span class="error-page__code num">{{ code }}</span>
      <h1 class="error-page__title">{{ title }}</h1>
      <p class="error-page__desc">{{ description }}</p>
      <div class="error-page__actions">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.error-page {
  display: grid;
  place-items: center;
  min-height: 100%;
  padding: var(--space-10) var(--space-5);

  &__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 420px;
    text-align: center;
  }

  &__code {
    font-size: 76px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.04em;
    background: linear-gradient(140deg, var(--brand-400), var(--brand-700));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  &__title {
    margin-top: var(--space-4);
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__desc {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  &__actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-6);
  }
}
</style>
