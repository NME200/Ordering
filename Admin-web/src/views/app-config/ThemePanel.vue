<script setup lang="ts">
import { computed } from 'vue';
import type { AppTheme } from '../../types/app-config';

/**
 * 主题设置（11.1 下半张卡片）。
 *
 * 一行一个 token，左边名字右边控件 —— 这是参考稿的排法，
 * 比 el-form 的 top-label 更省纵向空间，也更好一眼扫完。
 * 色值一律用色板 + 十六进制输入两种入口，运营从设计稿抄色值时不用点选。
 */
const props = defineProps<{
  theme: AppTheme;
  readonly: boolean;
}>();

const emit = defineEmits<{ reset: [] }>();

/** 透明度后端要 0-1 两位小数，界面按百分比读写，少让运营算一次除法 */
const alphaPercent = computed({
  get: () => Math.round((props.theme.cardAlpha ?? 0.7) * 100),
  set: (value: number) => {
    props.theme.cardAlpha = Number((value / 100).toFixed(2));
  },
});

const FIELDS: { key: keyof AppTheme; label: string; kind: 'color' | 'number' | 'text'; hint?: string }[] = [
  { key: 'primaryColor', label: '主色调', kind: 'color', hint: '按钮 / 价格 / 选中态' },
  { key: 'subColor', label: '辅助色', kind: 'color', hint: '标题与次级强调' },
  { key: 'bgColor', label: '页面背景色', kind: 'color' },
  { key: 'textColor', label: '正文文字', kind: 'color' },
  { key: 'subTextColor', label: '次要文字', kind: 'color', hint: '月售 / 时间 / 说明' },
  { key: 'dividerColor', label: '分割线', kind: 'color' },
  { key: 'radius', label: '卡片圆角', kind: 'number', hint: '0 - 32 px' },
  { key: 'cardGap', label: '卡片间距', kind: 'number', hint: '0 - 24 px' },
  { key: 'sectionGap', label: '区块间距', kind: 'number', hint: '0 - 32 px' },
  { key: 'pageMargin', label: '页边距', kind: 'number', hint: '0 - 32 px' },
  { key: 'tabbarSkin', label: 'TabBar 皮肤', kind: 'text', hint: '只下发用哪一套' },
];
</script>

<template>
  <div class="theme">
    <div class="theme__head">
      <h3 class="theme__title">主题设置</h3>
      <el-button link type="primary" :disabled="readonly" @click="emit('reset')">恢复默认</el-button>
    </div>

    <div class="theme__row">
      <span class="theme__label">卡片透明度</span>
      <div class="theme__control">
        <el-input-number
          v-model="alphaPercent"
          :min="0"
          :max="100"
          :step="5"
          size="small"
          controls-position="right"
          :disabled="readonly"
        />
        <el-slider v-model="alphaPercent" :min="0" :max="100" :step="5" :show-tooltip="false" :disabled="readonly" />
      </div>
      <span class="theme__hint">对应设计稿的半透明白毛玻璃，100% 就是纯白卡片</span>
    </div>

    <div v-for="field in FIELDS" :key="field.key" class="theme__row">
      <span class="theme__label">{{ field.label }}</span>
      <div class="theme__control">
        <template v-if="field.kind === 'color'">
          <el-color-picker
            v-model="(theme[field.key] as string | undefined)"
            size="small"
            :disabled="readonly"
            :predefine="['#c8752b', '#8b5e3c', '#faf8f6', '#3a322c', '#9a908a', '#efebe7']"
          />
          <el-input v-model="(theme[field.key] as string | undefined)" class="theme__hex" size="small" :disabled="readonly" placeholder="#RRGGBB" />
        </template>
        <el-input-number
          v-else-if="field.kind === 'number'"
          v-model="(theme[field.key] as number | undefined)"
          :min="0"
          :max="32"
          size="small"
          controls-position="right"
          :disabled="readonly"
        />
        <el-input v-else v-model="theme[field.key]" size="small" maxlength="24" :disabled="readonly" />
      </div>
      <span v-if="field.hint" class="theme__hint">{{ field.hint }}</span>
    </div>

    <p class="theme__foot">
      四页共享同一套主题，所以换肤永远是一次发布；tabBar 图标是小程序包内静态资源，
      这里只能选「用哪一套」，新增一套要随小程序发版。
    </p>
  </div>
</template>

<style scoped lang="scss">
.theme {
  display: flex;
  flex-direction: column;
  /* 与 SectionForm 同一套内边距，两个签的左边缘才对得齐 */
  padding: var(--space-3) var(--space-4) 0;
}

.theme__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.theme__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 属性栏只有 336px 宽：说明文字必须独占一行，
   挤在控件右边只会被折成三行，整面板看起来像没显示全 */
.theme__row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  column-gap: 10px;
  row-gap: 1px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--neutral-200);
}

.theme__label {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.theme__control {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.theme__control :deep(.el-color-picker),
.theme__control :deep(.el-input-number) {
  flex: none;
}

.theme__control :deep(.el-input-number) {
  width: 96px;
}

.theme__control :deep(.el-slider) {
  flex: 1;
  min-width: 0;
  margin: 0 6px 0 2px;
}

.theme__hex {
  flex: 1;
  min-width: 0;
}

.theme__hint {
  grid-column: 1 / -1;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-placeholder);
}

.theme__foot {
  margin: var(--space-3) 0 0;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-placeholder);
}
</style>
