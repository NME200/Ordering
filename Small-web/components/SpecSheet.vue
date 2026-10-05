<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { specAmountOf, specSummaryOf } from '@/store/cart';
import { yuan } from '@/utils/format';
import type { MenuDish, SpecGroup } from '@/types/api';

/**
 * 规格选择弹层（原型 S2）。
 *
 * 必选的单选组默认选中第一项：点餐场景里「杯型」这种组不给默认值，
 * 顾客每次都要多点一下，而绝大多数人就是要第一个。
 */
const props = defineProps<{ dish: MenuDish | null }>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'confirm', payload: { dish: MenuDish; specOptionIds: number[]; quantity: number }): void;
}>();

const selected = ref<Map<number, number[]>>(new Map());
const quantity = ref(1);

function defaults(dish: MenuDish | null): Map<number, number[]> {
  const map = new Map<number, number[]>();
  if (!dish) return map;
  dish.specGroups.forEach((group) => {
    const first = group.options[0];
    map.set(group.id, group.isRequired && group.type === 0 && first ? [first.id] : []);
  });
  return map;
}

watch(() => props.dish?.id, () => {
  selected.value = defaults(props.dish);
  quantity.value = 1;
});

const groups = computed<SpecGroup[]>(() => props.dish?.specGroups ?? []);
const hasGroups = computed(() => groups.value.length > 0);

const chosenIds = computed(() => {
  const ids: number[] = [];
  selected.value.forEach((list) => ids.push(...list));
  return ids;
});

/** 单价 = 本店有效价 + 规格增量 */
const unitAmount = computed(() =>
  props.dish ? props.dish.price + specAmountOf(props.dish, chosenIds.value) : 0,
);

function isSelected(groupId: number, optionId: number): boolean {
  return (selected.value.get(groupId) ?? []).includes(optionId);
}

function toggle(groupId: number, optionId: number, type: 0 | 1): void {
  const current = selected.value.get(groupId) ?? [];
  const next = type === 0
    ? (current.includes(optionId) ? [] : [optionId])
    : (current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]);
  // 重建 Map：小程序端响应式对 Map 的原地 set 不敏感
  const map = new Map(selected.value);
  map.set(groupId, next);
  selected.value = map;
}

const missingRequired = computed(() =>
  groups.value.some((group) => group.isRequired && (selected.value.get(group.id) ?? []).length === 0),
);

function confirm(): void {
  if (!props.dish || missingRequired.value) return;
  emit('confirm', { dish: props.dish, specOptionIds: chosenIds.value, quantity: quantity.value });
}
</script>

<template>
  <view v-if="dish" class="sheet-mask" @click="emit('close')">
    <view class="sheet" @click.stop>
      <view class="sheet__head">
        <text class="sheet__title">{{ dish.name }}</text>
        <text class="sheet__close" @click="emit('close')">关闭</text>
      </view>

      <scroll-view class="sheet__body" scroll-y>
        <text v-if="dish.description" class="sheet__desc">{{ dish.description }}</text>

        <view v-if="!hasGroups" class="sheet__plain">
          <text class="sheet__plain-line">无规格 · 直接按份数加购</text>
        </view>

        <view v-for="group in groups" :key="group.id" class="spec">
          <view class="spec__head">
            <text class="spec__name">{{ group.name }}</text>
            <text class="spec__type">
              {{ group.type === 0 ? '单选' : '多选' }}{{ group.isRequired ? ' · 必选' : '' }}
            </text>
          </view>
          <view class="spec__chips">
            <view
              v-for="option in group.options"
              :key="option.id"
              class="chip"
              :class="{ 'is-on': isSelected(group.id, option.id) }"
              @click="toggle(group.id, option.id, group.type)"
            >
              <text>{{ option.name }}</text>
              <text v-if="option.priceDiff" class="chip__diff num">
                {{ option.priceDiff > 0 ? '+' : '−' }}¥{{ yuan(Math.abs(option.priceDiff)) }}
              </text>
            </view>
          </view>
        </view>

        <view class="qty">
          <text class="qty__label">数量</text>
          <view class="qty__stepper">
            <text class="qty__btn" :class="{ 'is-off': quantity <= 1 }" @click="quantity > 1 && (quantity -= 1)">−</text>
            <text class="qty__num num">{{ quantity }}</text>
            <text class="qty__btn" @click="quantity += 1">＋</text>
          </view>
        </view>
      </scroll-view>

      <view class="sheet__foot">
        <view class="sheet__submit" :class="{ 'is-off': missingRequired }" @click="confirm">
          <text>{{ missingRequired ? '还有必选规格没选' : '加入购物袋' }}</text>
          <text class="sheet__price num">¥{{ yuan(unitAmount * quantity) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.sheet-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  background-color: rgba(36, 31, 28, 0.42);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet {
  background-color: #fff;
  border-top: 1rpx solid $hair;
  border-radius: 20rpx 20rpx 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  flex-direction: column;
  max-height: 82vh;
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx 20rpx;
  border-bottom: 1rpx solid $hair;
}

.sheet__title {
  font-size: 32rpx;
  font-weight: 600;
}

.sheet__close {
  font-size: 26rpx;
  color: $n-400;
}

.sheet__body {
  flex: 1;
  padding: 24rpx 32rpx;
}

.sheet__desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: $n-500;
}

.sheet__plain {
  padding: 24rpx 0;
}

.sheet__plain-line {
  font-size: 26rpx;
  color: $n-400;
}

.spec {
  padding: 28rpx 0 4rpx;

  &__head {
    display: flex;
    align-items: baseline;
    gap: 12rpx;
  }

  &__name {
    font-size: 28rpx;
    font-weight: 600;
  }

  &__type {
    font-size: 22rpx;
    color: $n-400;
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
    margin: 18rpx 0 8rpx;
  }
}

.chip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 24rpx;
  border: 1rpx solid $n-200;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: $n-700;

  &.is-on {
    border-color: var(--brand, #{$brand-500});
    background-color: var(--brand-soft, #{$brand-50});
    color: var(--brand, #{$brand-500});
  }

  &__diff {
    font-size: 22rpx;
    color: $n-500;
  }

  &.is-on &__diff {
    color: var(--brand, #{$brand-500});
  }
}

.qty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 0 8rpx;

  &__label {
    font-size: 28rpx;
    font-weight: 600;
  }

  &__stepper {
    display: flex;
    align-items: center;
    border: 1rpx solid $n-200;
    border-radius: 999rpx;
  }

  &__btn {
    width: 64rpx;
    text-align: center;
    font-size: 32rpx;
    line-height: 60rpx;
    color: $n-700;

    &.is-off {
      color: $n-300;
    }
  }

  &__num {
    width: 56rpx;
    text-align: center;
    font-size: 28rpx;
  }
}

.sheet__foot {
  padding: 20rpx 32rpx 32rpx;
  border-top: 1rpx solid $hair;
}

.sheet__submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  height: 92rpx;
  border-radius: 999rpx;
  background-color: var(--brand, #{$brand-500});
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;

  &.is-off {
    background-color: $n-200;
    color: $n-400;
  }
}

.sheet__price {
  font-size: 30rpx;
}
</style>
