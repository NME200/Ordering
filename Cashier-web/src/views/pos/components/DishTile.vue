<script setup lang="ts">
import { computed } from 'vue';
import { Picture } from '@element-plus/icons-vue';
import type { Dish } from '@shared/types/dish';
import { fenToYuan } from '@shared/utils/format';

/**
 * 菜品磁贴：收银台上唯一该存在的「菜品」形态。
 *
 * 触屏 + 站立操作，所以整块可点、尺寸不小于 44px 的触控目标，
 * 已加购的份数直接压在按钮上，无需打开任何二级界面就能确认。
 */
const props = defineProps<{
  dish: Dish;
  /** 已加入本单的份数（0 表示未加购） */
  inCart: number;
  /** 是否需要选规格（true 时点击进规格弹窗，而非直接加购） */
  hasSpecs: boolean;
  /** 入场错峰用的序号 */
  index: number;
  /** 本店沽清：仍然显示（收银员要知道是卖完了，不是没这道菜），但点不动 */
  soldOut?: boolean;
}>();

const emit = defineEmits<{ (e: 'pick', dish: Dish): void }>();

function pick(): void {
  if (props.soldOut) {
    return;
  }
  emit('pick', props.dish);
}

/**
 * 无图时的底色：用商户 ID 取一个稳定的暖调，
 * 保证同一个菜每次刷新颜色一致（随机色会让菜单看起来在跳）。
 */
const placeholderTone = computed(() => {
  const tones = [
    'linear-gradient(135deg, #f3dfd8, #edcfc5)',
    'linear-gradient(135deg, #fbf3e2, #f3dfd8)',
    'linear-gradient(135deg, #eaf5ef, #f1eeeb)',
    'linear-gradient(135deg, #f7f5f3, #f9efec)',
  ];
  return tones[props.dish.id % tones.length];
});

const initial = computed(() => props.dish.name.slice(0, 1));
</script>

<template>
  <button
    class="tile"
    type="button"
    :disabled="soldOut"
    :style="{ animationDelay: `${Math.min(props.index, 18) * 22}ms` }"
    :aria-label="`${dish.name}，${fenToYuan(dish.effectivePrice)} 元${soldOut ? '，本店已售罄' : ''}${hasSpecs ? '，需选择规格' : ''}`"
    @click="pick"
  >
    <span class="tile__media">
      <el-image v-if="dish.imageUrl" class="tile__img" :src="dish.imageUrl" fit="cover" lazy>
        <template #error>
          <span class="tile__fallback" :style="{ background: placeholderTone }">
            <el-icon><Picture /></el-icon>
          </span>
        </template>
      </el-image>
      <span v-else class="tile__fallback" :style="{ background: placeholderTone }">
        {{ initial }}
      </span>

      <span v-if="dish.isRecommend" class="tile__flag tile__flag--recommend">招牌</span>
      <span v-if="hasSpecs" class="tile__flag tile__flag--spec">规格</span>
      <span v-if="soldOut" class="tile__flag tile__flag--sold-out">售罄</span>
    </span>

    <span class="tile__body">
      <span class="tile__name">{{ dish.name }}</span>
      <span class="tile__price num"> <i>¥</i>{{ fenToYuan(dish.effectivePrice) }} </span>
    </span>

    <span class="tile__action" :class="{ 'is-filled': inCart > 0 }">
      <template v-if="inCart > 0">
        <span class="num">{{ inCart }}</span>
      </template>
      <svg v-else viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          d="M12 6v12M6 12h12"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        />
      </svg>
    </span>
  </button>
</template>

<style scoped lang="scss">
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 152px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background-color: var(--surface);
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  animation: tile-in var(--duration-base) var(--ease-out-expo) both;
  transition:
    transform var(--duration-fast) var(--ease-out-quart),
    box-shadow var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);

  &:hover {
    border-color: var(--brand-300);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  /* 触屏反馈：按下即缩小，抬起来才结算 */
  &:active {
    transform: scale(0.975);
    box-shadow: var(--shadow-xs);
  }

  /* 本店沽清：留在菜单上（收银员要能区分「卖完了」和「没这道菜」），但点不动 */
  &:disabled {
    cursor: not-allowed;
    opacity: 0.66;
    filter: saturate(0.4);
  }

  &:disabled:hover {
    border-color: var(--border-color);
    box-shadow: none;
    transform: none;
  }

  &__media {
    position: relative;
    display: block;
    height: 84px;
    flex-shrink: 0;
    background-color: var(--neutral-50);
  }

  &__img {
    width: 100%;
    height: 100%;
    display: block;
  }

  &__fallback {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    font-size: 26px;
    font-weight: 600;
    color: var(--brand-700);
    opacity: 0.75;

    .el-icon {
      font-size: 20px;
      color: var(--neutral-300);
    }
  }

  &__flag {
    position: absolute;
    top: 8px;
    padding: 2px 7px;
    border-radius: var(--radius-full);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.02em;
    backdrop-filter: blur(2px);

    &--recommend {
      left: 8px;
      background-color: rgba(194, 96, 60, 0.9);
      color: #fff;
    }

    &--spec {
      right: 8px;
      background-color: rgba(32, 26, 23, 0.6);
      color: rgba(255, 255, 255, 0.9);
    }

    /* 与「规格」标错开位置，放图片右下角 */
    &--sold-out {
      right: 8px;
      bottom: 8px;
      background-color: rgba(194, 96, 60, 0.94);
      color: #fff;
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px 12px;
    min-width: 0;
  }

  &__name {
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.35;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__price {
    margin-top: 2px;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--brand-600);

    i {
      margin-right: 1px;
      font-size: 11px;
      font-style: normal;
      opacity: 0.7;
    }
  }

  /* 右下角的加购按钮 / 已选份数 */
  &__action {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-full);
    background-color: var(--neutral-100);
    color: var(--neutral-600);
    font-size: 14px;
    font-weight: 600;
    transition:
      background-color var(--duration-fast) var(--ease-out-quart),
      color var(--duration-fast) var(--ease-out-quart),
      transform var(--duration-fast) var(--ease-out-quart);

    &.is-filled {
      background: linear-gradient(140deg, var(--brand-500), var(--brand-700));
      color: #fff;
      box-shadow: 0 6px 14px -8px rgba(194, 96, 60, 0.9);
    }
  }

  &:hover &__action {
    transform: scale(1.08);
  }
}
</style>
