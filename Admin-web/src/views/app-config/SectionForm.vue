<script setup lang="ts">
import { computed } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';
import type { LayoutSection, PreviewData } from '../../types/app-config';
import { SECTION_META } from '../../types/app-config';

/**
 * 选中组件的属性表单。
 *
 * 字段直接绑在 `section.props` 上 —— 那是画布里那份真实对象，改一个字符预览就跟着变。
 * 服务端会按组件 key 再校验一遍白名单字段，所以面板放出去的字段不会变成脏数据。
 */
const props = defineProps<{
  section: LayoutSection;
  preview: PreviewData;
  readonly: boolean;
}>();

const label = computed(() => SECTION_META[props.section.key]?.label ?? props.section.key);

const dishOptions = computed(() =>
  props.preview.dishes.map((dish) => ({ value: dish.id, label: dish.name })),
);

function addImage(): void {
  const rows = props.section.props.images ?? [];
  if (rows.length >= 5) {
    return;
  }
  props.section.props.images = [...rows, { url: '', link: '' }];
}

function removeImage(index: number): void {
  const next = [...(props.section.props.images ?? [])];
  next.splice(index, 1);
  props.section.props.images = next;
}
</script>

<template>
  <div class="section-form">
    <h3 class="section-form__title">
      {{ label }}
      <span class="section-form__sub">改动只影响画布里选中的这一个位置</span>
    </h3>

    <el-form label-position="top" :disabled="readonly">
      <!-- 首页轮播 -->
      <template v-if="section.key === 'banner'">
        <el-form-item label="轮播图片（最多 5 张）">
          <div class="image-list">
            <div
              v-for="(row, rowIndex) in section.props.images ?? []"
              :key="rowIndex"
              class="image-row"
            >
              <span class="image-row__index num">{{ rowIndex + 1 }}</span>
              <el-input v-model="row.url" placeholder="图片地址，https: 开头" />
              <el-input v-model="row.link" class="image-row__link" placeholder="跳转路径（选填）" />
              <el-button :icon="Delete" link type="danger" @click="removeImage(rowIndex)" />
            </div>
            <el-button
              :icon="Plus"
              link
              type="primary"
              :disabled="readonly || (section.props.images ?? []).length >= 5"
              @click="addImage"
            >
              添加图片
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="高度（px）">
          <el-slider v-model="section.props.height" :min="120" :max="400" show-input size="small" />
        </el-form-item>
        <el-form-item label="圆角（px）">
          <el-slider v-model="section.props.radius" :min="0" :max="24" show-input size="small" />
        </el-form-item>
      </template>

      <!-- 公告栏 -->
      <template v-else-if="section.key === 'notice'">
        <el-form-item label="公告文字">
          <el-input v-model="section.props.text" type="textarea" :rows="2" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item label="底色 / 文字色">
          <el-color-picker v-model="section.props.bgColor" size="small" />
          <el-color-picker v-model="section.props.textColor" size="small" />
        </el-form-item>
        <el-form-item label="图标地址">
          <el-input v-model="section.props.iconUrl" placeholder="https://… 选填" clearable />
        </el-form-item>
      </template>

      <!-- 分类导航 -->
      <template v-else-if="section.key === 'categoryNav'">
        <el-form-item label="标题">
          <el-input v-model="section.props.title" maxlength="16" show-word-limit />
        </el-form-item>
        <el-form-item label="每行个数">
          <el-radio-group v-model="section.props.columns">
            <el-radio :value="4">4 个</el-radio>
            <el-radio :value="5">5 个</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="末尾显示「全部」">
          <el-switch v-model="section.props.showAll" />
        </el-form-item>
      </template>

      <!-- 热销推荐位 -->
      <template v-else-if="section.key === 'hotDishes'">
        <el-form-item label="标题">
          <el-input v-model="section.props.title" maxlength="16" show-word-limit />
        </el-form-item>
        <el-form-item label="取菜方式">
          <el-radio-group v-model="section.props.source">
            <el-radio value="recommend">自动取推荐菜</el-radio>
            <el-radio value="manual">手选菜品</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="section.props.source === 'manual'" label="手选菜品（最多 12 个）">
          <el-select
            v-model="section.props.dishIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="请先在顶部选择预览门店"
            style="width: 100%"
          >
            <el-option v-for="item in dishOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <p v-if="dishOptions.length === 0" class="section-form__sub">
            没选预览门店就没有菜品候选 —— 菜单是按门店取的。
          </p>
        </el-form-item>
        <el-form-item label="显示价格">
          <el-switch v-model="section.props.showPrice" />
        </el-form-item>
      </template>
    </el-form>
  </div>
</template>

<style scoped lang="scss">
.section-form {
  padding: 0 var(--space-4) var(--space-4);

  &__title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 0 var(--space-2);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__sub {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-placeholder);
  }
}

.image-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-row {
  display: flex;
  align-items: center;
  gap: 6px;

  &__index {
    width: 16px;
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__link {
    width: 130px;
    flex: none;
  }
}
</style>
