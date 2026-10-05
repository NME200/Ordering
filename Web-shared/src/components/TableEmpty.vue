<script setup lang="ts">
/**
 * 表格空状态。
 * 区分「暂无数据」与「筛选无结果」两种语义，并给出下一步动作提示，
 * 而不是丢一个空白表格给用户（见 impeccable：空状态应具有教育意义）。
 */
withDefaults(
  defineProps<{
    title?: string;
    hint?: string;
    filtered?: boolean;
  }>(),
  {
    title: '',
    hint: '',
    filtered: false,
  },
);
</script>

<template>
  <div class="table-empty">
    <svg class="table-empty__art" viewBox="0 0 120 84" fill="none" aria-hidden="true">
      <rect x="10" y="14" width="100" height="56" rx="10" stroke="var(--neutral-200)" stroke-width="2" />
      <path d="M10 34h100" stroke="var(--neutral-200)" stroke-width="2" />
      <path d="M34 14v56M76 14v56" stroke="var(--neutral-100)" stroke-width="2" />
      <circle cx="60" cy="52" r="12" stroke="var(--brand-300)" stroke-width="2" />
      <path d="M60 46v6l4 3" stroke="var(--brand-400)" stroke-width="2" stroke-linecap="round" />
    </svg>
    <p class="table-empty__title">
      {{ title || (filtered ? '没有符合条件的记录' : '这里还没有数据') }}
    </p>
    <p class="table-empty__hint">
      {{ hint || (filtered ? '试试调整筛选条件，或清空后重新查询' : '点击右上角的新增按钮创建第一条记录') }}
    </p>
    <div v-if="$slots.default" class="table-empty__extra">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: 34px 16px 40px;

  &__art {
    width: 120px;
    height: 84px;
    margin-bottom: var(--space-2);
    opacity: 0.9;
  }

  &__title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-regular);
  }

  &__hint {
    font-size: 13px;
    color: var(--text-placeholder);
  }

  &__extra {
    margin-top: var(--space-3);
  }
}
</style>
