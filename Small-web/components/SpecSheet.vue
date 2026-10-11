<script lang="ts">
import { defineComponent, computed, ref, watch, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import { specAmountOf, specSummaryOf } from '@/store/cart';
import type { MenuDish } from '@/types/api';

/** 后端 SpecType：1 单选 / 2 多选（没有 0，之前按 0/1 解读会让必选单选组永远预选不上） */
const SpecType = { SINGLE: 1, MULTI: 2 } as const;

/**
 * 商品规格弹层（ui.md 第 4 节）。
 *
 * 单选组必选时默认选中第一项 —— 后端下单要校验必选组，
 * 界面留空只会让顾客在提交时被打回来，体验更差。
 * 价格随规格实时联动，加料显示 `+¥3` 这样的增量。
 */
export default defineComponent({
  name: 'SpecSheet',
  components: { LineIcon },
  props: {
    dish: { type: Object as PropType<MenuDish | null>, default: null },
  },
  emits: {
    close: () => true,
    confirm: (_payload: { dish: MenuDish; specOptionIds: number[]; quantity: number }) => true,
  },
  setup(props, { emit }) {
    const selected = ref<number[]>([]);
    const quantity = ref(1);

    watch(
      () => props.dish?.id,
      () => {
        const dish = props.dish;
        if (!dish) return;
        // 必选单选组先给个默认值，多选组一律不默认选
        selected.value = dish.specGroups
          .filter((group) => group.isRequired && group.type === SpecType.SINGLE)
          .map((group) => group.options[0]?.id)
          .filter((id): id is number => id !== undefined);
        quantity.value = 1;
      },
      { immediate: true },
    );

    const unitPrice = computed(() => {
      const dish = props.dish;
      if (!dish) return 0;
      return dish.price + specAmountOf(dish, selected.value);
    });
    const total = computed(() => unitPrice.value * quantity.value);

    function toggle(groupId: number, optionId: number, multiple: boolean): void {
      if (multiple) {
        selected.value = selected.value.includes(optionId)
          ? selected.value.filter((id) => id !== optionId)
          : [...selected.value, optionId];
        return;
      }
      // 单选组里再点已选项等于取消，会让必选组变空 —— 所以直接忽略
      if (selected.value.includes(optionId)) {
        const group = props.dish?.specGroups.find((item) => item.id === groupId);
        if (group?.isRequired) return;
        selected.value = selected.value.filter((id) => id !== optionId);
        return;
      }
      const ids = props.dish?.specGroups.find((item) => item.id === groupId)?.options.map((o) => o.id) ?? [];
      selected.value = [...selected.value.filter((id) => !ids.includes(id)), optionId];
    }

    function add(): void {
      const dish = props.dish;
      if (!dish) return;
      const missing = dish.specGroups.find(
        (group) => group.isRequired && group.type === SpecType.SINGLE && !selected.value.some((id) => group.options.some((o) => o.id === id)),
      );
      if (missing) {
        uni.showToast({ title: `请选${missing.name}`, icon: 'none' });
        return;
      }
      emit('confirm', { dish, specOptionIds: [...selected.value], quantity: quantity.value });
    }

    return { selected, quantity, unitPrice, total, toggle, add, SpecType };
  },
});
</script>

<template>
  <view v-if="dish" class="sheet-mask" @click="$emit('close')">
    <view class="sheet" @click.stop>
      <view class="sheet__handle" />

      <view class="goods">
        <view class="goods__pic">
          <image v-if="dish.imageUrl" class="goods__img" :src="dish.imageUrl" mode="aspectFill" />
          <text v-else class="goods__initial">{{ dish.name.slice(0, 1) }}</text>
        </view>
        <view class="goods__body">
          <text class="goods__name">{{ dish.name }}</text>
          <text class="goods__price num"><text class="goods__cny">¥</text>{{ (unitPrice / 100).toFixed(2) }}</text>
          <text v-if="dish.monthlySales > 0" class="goods__sales num">月售 {{ dish.monthlySales }}</text>
        </view>
        <view class="sheet__close">
          <LineIcon name="close" :size="20" tone="sub" @click="$emit('close')" />
        </view>
      </view>

      <scroll-view class="groups" scroll-y>
        <view v-for="group in dish.specGroups" :key="group.id" class="group">
          <text class="group__title">
            {{ group.name }}
            <text v-if="group.isRequired" class="group__req">必选</text>
          </text>
          <view class="group__options">
            <view
              v-for="option in group.options"
              :key="option.id"
              class="chip group__chip"
              :class="{ 'is-on': selected.includes(option.id) }"
              @click="toggle(group.id, option.id, group.type === SpecType.MULTI)"
            >
              <text>{{ option.name }}</text>
              <text v-if="option.priceDiff" class="group__diff num">
                {{ option.priceDiff > 0 ? '+' : '-' }}¥{{ (Math.abs(option.priceDiff) / 100).toFixed(0) }}
              </text>
            </view>
          </view>
        </view>
        <view class="groups__pad" />
      </scroll-view>

      <view class="sheet__foot">
        <view class="stepper">
          <view class="stepper__btn" :class="{ 'is-off': quantity <= 1 }" @click="quantity > 1 && quantity--">
            <LineIcon name="minus" :size="16" color="#3a322c" />
          </view>
          <text class="stepper__value num">{{ quantity }}</text>
          <view class="stepper__btn" @click="quantity++">
            <LineIcon name="plus" :size="16" color="#3a322c" />
          </view>
        </view>
        <view class="btn-main confirm" @click="add">
          加入购物车 ¥{{ (total / 100).toFixed(2) }}
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.goods {
  position: relative;
  display: flex;
  gap: 20rpx;
  padding: 24rpx 32rpx 8rpx;
}

.goods__pic {
  width: 160rpx;
  height: 160rpx;
  flex: none;
  border-radius: var(--radius-tile, 12px);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
}

.goods__img {
  width: 100%;
  height: 100%;
}

.goods__initial {
  font-size: 52rpx;
  color: var(--brand, #c8752b);
}

.goods__body {
  flex: 1;
  min-width: 0;
  padding-top: 6rpx;
}

.goods__name {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
}

.goods__price {
  display: block;
  margin-top: 10rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: var(--brand, #c8752b);
}

.goods__cny {
  font-size: 24rpx;
  margin-right: 2rpx;
}

.goods__sales {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.groups {
  max-height: 44vh;
  padding: 8rpx 32rpx 0;
}

.group {
  padding: 20rpx 0 4rpx;
}

.group__title {
  display: block;
  margin-bottom: 16rpx;
  font-size: 26rpx;
  color: var(--ink-2, #{$n-500});
}

.group__req {
  margin-left: 8rpx;
  font-size: 20rpx;
  color: var(--brand, #c8752b);
}

.group__options {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.group__chip {
  font-size: 26rpx;
}

.group__diff {
  opacity: 0.8;
}

.groups__pad {
  height: 16rpx;
}

.sheet__foot {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 20rpx 32rpx 32rpx;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background-color: #fff;
  border: 1rpx solid var(--divider, #{$n-200});
}

.stepper__btn {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stepper__btn.is-off {
  opacity: 0.35;
}

.stepper__value {
  min-width: 48rpx;
  text-align: center;
  font-size: 30rpx;
  font-weight: 600;
}

.confirm {
  flex: 1;
}
</style>
