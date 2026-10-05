<script setup lang="ts">
import type { AppTheme } from '../../types/app-config';

/**
 * 主题面板。
 *
 * `theme` 是父组件持有的响应式对象，这里直接绑它的字段
 * （与项目里各列表页把 `query` / `form` 传进子组件的同一写法）。
 */
defineProps<{
  theme: AppTheme;
  /** 只读模式：查看生效中或历史版本时禁用所有输入 */
  readonly: boolean;
}>();
</script>

<template>
  <div class="panel-form">
    <h3 class="panel-form__title">主题</h3>
    <el-form label-position="top" :disabled="readonly">
      <div class="theme-grid">
        <el-form-item label="主色">
          <el-color-picker v-model="theme.primaryColor" size="small" />
        </el-form-item>
        <el-form-item label="背景色">
          <el-color-picker v-model="theme.backgroundColor" size="small" />
        </el-form-item>
        <el-form-item label="主文字色">
          <el-color-picker v-model="theme.textPrimary" size="small" />
        </el-form-item>
        <el-form-item label="次要文字色">
          <el-color-picker v-model="theme.textSecondary" size="small" />
        </el-form-item>
      </div>

      <el-form-item label="卡片圆角（px）">
        <el-input-number v-model="theme.cardRadius" :min="0" :max="32" controls-position="right" />
      </el-form-item>

      <el-form-item label="顶部头图地址">
        <el-input v-model="theme.headerImage" placeholder="https://… 留空则不显示" clearable />
      </el-form-item>

      <el-form-item label="Logo 地址">
        <el-input v-model="theme.logoUrl" placeholder="https://… 留空则用文字" clearable />
      </el-form-item>

      <el-form-item label="TabBar 皮肤标识">
        <el-input v-model="theme.tabbarSkin" placeholder="default" maxlength="24" />
        <p class="panel-form__hint">
          tabBar 图标是小程序包内静态资源，后端只能下发「用哪一套」这个标识；
          新增一套要随小程序发版。
        </p>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped lang="scss">
.panel-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);

  &__title {
    margin: 0 0 var(--space-2);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__hint {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 1.6;
    color: var(--text-placeholder);
  }
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0 var(--space-3);
}
</style>
