<script setup lang="ts">
/**
 * 页面标题区：标题 + 说明 + 右侧操作位。
 * 各业务页面统一使用，保证标题层级与留白一致。
 */
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <header class="page-head">
    <div class="page-head__text">
      <h1 class="page-head__title">{{ title }}</h1>
      <p v-if="description" class="page-head__desc">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped lang="scss">
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;

  &__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__title {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: -0.01em;
    color: var(--text-primary);
  }

  &__desc {
    font-size: 13px;
    color: var(--text-secondary);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
}
</style>
