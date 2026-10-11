<script setup lang="ts">
import { computed } from 'vue';
import LineIcon from './LineIcon.vue';
import { APP_ICON_KEYS, ICON_LABELS } from '../../types/app-config';
import type { AppIconKey } from '../../types/app-config';

/**
 * 内置图标选择器。
 *
 * 只列 `APP_ICON_KEYS` 那 26 个 —— 图标是小程序包内静态资源，
 * 后端下发不了新图标，所以这里也没有「上传自定义图标」的入口（11.3 稿里有，
 * 那是做不了的：顾客小程序不发版就看不到新图）。
 */
const props = defineProps<{
  modelValue?: string;
  color?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: AppIconKey] }>();

const current = computed(() => props.modelValue || 'store');

function pick(key: AppIconKey): void {
  emit('update:modelValue', key);
}
</script>

<template>
  <el-popover placement="bottom-start" :width="312" trigger="click" popper-class="icon-pop">
    <template #reference>
      <button type="button" class="trigger" :disabled="disabled">
        <LineIcon :name="current" :size="20" :color="color ?? '#c8752b'" />
        <span class="trigger__label">{{ ICON_LABELS[current as AppIconKey] ?? current }}</span>
        <span class="trigger__caret">▾</span>
      </button>
    </template>
    <div class="grid">
      <button
        v-for="key in APP_ICON_KEYS"
        :key="key"
        type="button"
        class="cell"
        :class="{ 'is-on': key === current }"
        :title="ICON_LABELS[key]"
        @click="pick(key)"
      >
        <LineIcon :name="key" :size="22" :color="key === current ? '#ffffff' : color ?? '#c8752b'" />
      </button>
    </div>
  </el-popover>
</template>

<style scoped lang="scss">
.trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--surface);
  cursor: pointer;
  color: var(--text-primary);
}

.trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.trigger__label {
  flex: 1;
  text-align: left;
  font-size: 12.5px;
}

.trigger__caret {
  color: var(--text-placeholder);
  font-size: 11px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--surface);
  cursor: pointer;
}

.cell:hover {
  border-color: var(--brand-400);
}

.cell.is-on {
  border-color: var(--brand-500);
  background-color: var(--brand-500);
}
</style>
