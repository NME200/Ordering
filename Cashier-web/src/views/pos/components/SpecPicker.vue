<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { activeSpecGroups } from '@/hooks/usePosMenu';
import { MAX_QUANTITY_PER_LINE } from '@/constants/pos-limits';
import type { Dish } from '@shared/types/dish';
import type { SpecGroup } from '@shared/types/spec-group';
import { SpecType } from '@shared/types/enums';
import { fenToYuan, formatPriceDiff } from '@shared/utils/format';
import type { SpecSelection } from '@/types/pos';

const props = defineProps<{ modelValue: boolean; dish: Dish | null }>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'confirm', payload: SpecSelection): void;
}>();

/** 规格组 ID → 已选规格项 ID 列表（单选组长度为 0 或 1） */
const selected = ref<Record<number, number[]>>({});
const quantity = ref(1);

const groups = computed<SpecGroup[]>(() => (props.dish ? activeSpecGroups(props.dish) : []));

/** 弹窗可见性：与父级 v-model 双向绑定，关闭由组件内部统一走这里 */
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

/**
 * 每次打开都重置选择，并给「必选 + 单选」组默认勾上第一项。
 *
 * 这是收银台与点餐小程序最大的差别：杯型这种必选组，
 * 顾客在收银台多半就是要默认档，预先选中能省掉一次点击；
 * 想改的人改一下即可，比每单都要选一次快。
 */
watch(
  () => [props.modelValue, props.dish?.id] as const,
  ([open]) => {
    if (!open) {
      return;
    }
    const next: Record<number, number[]> = {};
    groups.value.forEach((group) => {
      const defaultOption =
        group.isRequired && group.type === SpecType.SINGLE ? group.options[0] : undefined;
      next[group.id] = defaultOption ? [defaultOption.id] : [];
    });
    selected.value = next;
    quantity.value = 1;
  },
  { immediate: true },
);

const chosenOptionIds = computed(() => Object.values(selected.value).flatMap((list) => list));

/** 单份实付 = 菜品现价 + 已选规格增量 */
const unitFen = computed(() => {
  const dish = props.dish;
  if (!dish) {
    return 0;
  }
  const diff = groups.value.reduce(
    (sum, group) =>
      sum +
      group.options
        .filter((option) => chosenOptionIds.value.includes(option.id))
        .reduce((acc, option) => acc + option.priceDiff, 0),
    0,
  );
  return dish.effectivePrice + diff;
});

const totalFen = computed(() => unitFen.value * quantity.value);

function toggle(group: SpecGroup, optionId: number): void {
  const current = selected.value[group.id] ?? [];
  if (group.type === SpecType.SINGLE) {
    selected.value[group.id] = [optionId];
    return;
  }
  selected.value[group.id] = current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
}

function changeQuantity(delta: number): void {
  const next = quantity.value + delta;
  if (next < 1) {
    // 减到 0 交给购物车那侧处理，弹窗里不出现 0 份
    return;
  }
  quantity.value = Math.min(next, MAX_QUANTITY_PER_LINE);
}

function close(): void {
  emit('update:modelValue', false);
}

function confirm(): void {
  const missing = groups.value.find(
    (group) => group.isRequired && (selected.value[group.id] ?? []).length === 0,
  );
  if (missing) {
    ElMessage.warning(`请选择「${missing.name}」`);
    return;
  }
  emit('confirm', { specOptionIds: chosenOptionIds.value, quantity: quantity.value });
  close();
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dish?.name ?? '选择规格'"
    width="480px"
    align-center
    append-to-body
  >
    <div v-if="dish" class="spec">
      <p class="spec__base num">
        基础价 ¥ {{ fenToYuan(dish.effectivePrice) }}
        <span v-if="dish.unit">/ {{ dish.unit }}</span>
      </p>

      <div v-for="group in groups" :key="group.id" class="spec__group">
        <div class="spec__group-head">
          <span class="spec__group-name">{{ group.name }}</span>
          <span class="spec__group-type">
            {{ group.type === SpecType.SINGLE ? '单选' : '多选' }}
            <em v-if="group.isRequired">必选</em>
          </span>
        </div>

        <div class="spec__options">
          <button
            v-for="option in group.options"
            :key="option.id"
            class="spec__option"
            :class="{ 'is-chosen': (selected[group.id] ?? []).includes(option.id) }"
            type="button"
            @click="toggle(group, option.id)"
          >
            <span class="spec__option-name">{{ option.name }}</span>
            <span v-if="option.priceDiff !== 0" class="spec__option-diff num">
              {{ formatPriceDiff(option.priceDiff) }}
            </span>
          </button>
        </div>
      </div>

      <div class="spec__qty">
        <span class="spec__qty-label">份数</span>
        <div class="stepper">
          <button
            class="stepper__btn"
            type="button"
            aria-label="减少一份"
            @click="changeQuantity(-1)"
          >
            −
          </button>
          <span class="stepper__value num">{{ quantity }}</span>
          <button
            class="stepper__btn"
            type="button"
            aria-label="增加一份"
            @click="changeQuantity(1)"
          >
            +
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="spec__foot">
        <div class="spec__foot-total">
          <span class="muted">合计</span>
          <strong class="num">¥ {{ fenToYuan(totalFen) }}</strong>
        </div>
        <div class="spec__foot-actions">
          <el-button size="large" @click="close">取消</el-button>
          <el-button type="primary" size="large" @click="confirm">加入购物车</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.spec {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__base {
    font-size: 12.5px;
    color: var(--text-secondary);

    span {
      color: var(--text-placeholder);
    }
  }

  &__group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__group-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  &__group-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__group-type {
    font-size: 11px;
    color: var(--text-placeholder);

    em {
      margin-left: 6px;
      font-style: normal;
      color: var(--brand-600);
    }
  }

  &__options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--touch-size);
    padding: 0 16px;
    border: 1px solid var(--border-color-strong);
    border-radius: var(--radius-md);
    background-color: var(--surface);
    color: var(--text-regular);
    font-size: 13.5px;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-out-quart),
      background-color var(--duration-fast) var(--ease-out-quart),
      color var(--duration-fast) var(--ease-out-quart);

    &:hover {
      border-color: var(--brand-300);
    }

    &.is-chosen {
      border-color: var(--brand-500);
      background-color: var(--brand-50);
      color: var(--brand-700);
      font-weight: 500;
    }
  }

  &__option-diff {
    font-size: 11.5px;
    opacity: 0.75;
  }

  &__qty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-2);
    border-top: 1px dashed var(--border-color);

    &-label {
      font-size: 13px;
      color: var(--text-secondary);
    }
  }

  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);

    &-total {
      display: flex;
      align-items: baseline;
      gap: 8px;

      strong {
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--brand-600);
      }
    }

    &-actions {
      display: flex;
      gap: var(--space-2);
    }
  }
}

.stepper {
  display: flex;
  align-items: center;
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-md);
  overflow: hidden;

  &__btn {
    width: 44px;
    height: 40px;
    border: none;
    background-color: var(--neutral-50);
    color: var(--text-primary);
    font-size: 19px;
    line-height: 1;
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out-quart);

    &:hover {
      background-color: var(--brand-50);
      color: var(--brand-700);
    }
  }

  &__value {
    min-width: 48px;
    text-align: center;
    font-size: 17px;
    font-weight: 600;
    color: var(--text-primary);
  }
}
</style>
