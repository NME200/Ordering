<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Bowl, Files, SetUp, Shop, UserFilled } from '@element-plus/icons-vue';
import { fetchOrderStatusCount } from '@shared/api/order';
import {
  fetchDishCategoryTotal,
  fetchDishTotal,
  fetchSpecGroupTotal,
  fetchStoreTotal,
  fetchUserTotal,
} from '@shared/api/overview';
import PageHeader from '@shared/components/PageHeader.vue';
import { useUserStore } from '@/store/modules/user';
import { OrderStatus, ORDER_STATUS_LABELS, Permission } from '@shared/types/enums';

const router = useRouter();
const userStore = useUserStore();

/* ---------------- 待处理订单 ---------------- */

/**
 * 需要商户动作的订单状态。
 *
 * 「已完成 / 已取消」是终态，不占工作台；待支付通常由顾客自己完成，
 * 但需要商户关注超时单，因此也列出来。
 */
const actionableStatuses: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

/** 状态 → 视觉强调：待接单最紧急，用 danger；其余按流程推进依次降级 */
const statusAccents: Record<number, 'danger' | 'warning' | 'primary' | 'success'> = {
  [OrderStatus.PAID]: 'danger',
  [OrderStatus.PREPARING]: 'primary',
  [OrderStatus.READY]: 'success',
  [OrderStatus.PENDING_PAYMENT]: 'warning',
};

const statusCounts = ref<Record<number, number>>({});
const statusLoading = ref(true);

async function loadStatusCounts(): Promise<void> {
  statusLoading.value = true;
  try {
    const list = await fetchOrderStatusCount();
    const next: Record<number, number> = {};
    list.forEach((item) => {
      next[item.status] = item.count;
    });
    statusCounts.value = next;
  } catch {
    statusCounts.value = {};
  } finally {
    statusLoading.value = false;
  }
}

function goOrders(status: OrderStatus): void {
  void router.push({ path: '/orders', query: { status: String(status) } });
}

/* ---------------- 经营规模 ---------------- */

interface ScaleTile {
  key: string;
  label: string;
  hint: string;
  to: string;
  permission: Permission;
  loader: () => Promise<number>;
}

const scaleTiles: ScaleTile[] = [
  {
    key: 'store',
    label: '门店',
    hint: '在营门店数',
    to: '/stores',
    permission: Permission.STORE_READ,
    loader: fetchStoreTotal,
  },
  {
    key: 'user',
    label: '员工账号',
    hint: '含各角色',
    to: '/accounts',
    permission: Permission.USER_READ,
    loader: fetchUserTotal,
  },
  {
    key: 'dish',
    label: '菜品',
    hint: '含上架与下架',
    to: '/dishes',
    permission: Permission.DISH_READ,
    loader: fetchDishTotal,
  },
  {
    key: 'category',
    label: '菜品分类',
    hint: '菜单一级分组',
    to: '/dish-categories',
    permission: Permission.CATEGORY_READ,
    loader: fetchDishCategoryTotal,
  },
  {
    key: 'spec',
    label: '规格组',
    hint: '商户级共享',
    to: '/spec-groups',
    permission: Permission.SPEC_READ,
    loader: fetchSpecGroupTotal,
  },
];

const visibleScaleTiles = computed(() =>
  scaleTiles.filter((tile) => userStore.hasPermission(tile.permission)),
);

const scaleLoading = ref(true);
const scaleTotals = ref<Record<string, number | null>>({});

const scaleIconMap: Record<string, typeof Bowl> = {
  store: Shop,
  user: UserFilled,
  dish: Bowl,
  category: Files,
  spec: SetUp,
};

/* ---------------- 账号与问候 ---------------- */

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

/** 待处理订单总数（不含终态），用于问候语下方的一句话提示 */
const pendingTotal = computed(() =>
  actionableStatuses.reduce((sum, status) => sum + (statusCounts.value[status] ?? 0), 0),
);

onMounted(async () => {
  const scaleResults = await Promise.allSettled(
    visibleScaleTiles.value.map((tile) => tile.loader()),
  );
  const next: Record<string, number | null> = {};
  scaleResults.forEach((result, index) => {
    const tile = visibleScaleTiles.value[index];
    next[tile.key] = result.status === 'fulfilled' ? result.value : null;
  });
  scaleTotals.value = next;
  scaleLoading.value = false;

  await loadStatusCounts();
});
</script>

<template>
  <div class="page">
    <PageHeader
      :title="`${greeting}，${userStore.displayName}`"
      :description="
        statusLoading
          ? '正在获取今日经营情况…'
          : pendingTotal > 0
            ? `当前有 ${pendingTotal} 笔订单需要处理`
            : '当前没有待处理订单，一切正常'
      "
    />

    <!-- 待处理订单：商户每天最先要看的东西 -->
    <section class="panel order-board">
      <header class="order-board__head">
        <h2>订单待办</h2>
        <p>点击卡片查看对应状态的订单</p>
      </header>

      <div class="order-board__grid">
        <button
          v-for="(status, index) in actionableStatuses"
          :key="status"
          class="order-card rise-in"
          :class="[`order-card--${statusAccents[status]}`]"
          :style="{ animationDelay: `${index * 45}ms` }"
          type="button"
          @click="goOrders(status)"
        >
          <span class="order-card__label">{{ ORDER_STATUS_LABELS[status] }}</span>
          <span class="order-card__value num">
            <span v-if="statusLoading" class="skeleton-line order-card__skeleton" />
            <template v-else>{{ statusCounts[status] ?? 0 }}</template>
          </span>
          <span class="order-card__unit">笔</span>
        </button>
      </div>
    </section>

    <!-- 经营规模 -->
    <section class="scale">
      <article
        v-for="(tile, index) in visibleScaleTiles"
        :key="tile.key"
        class="scale__tile rise-in"
        :style="{ animationDelay: `${index * 40}ms` }"
        role="link"
        tabindex="0"
        @click="router.push(tile.to)"
        @keyup.enter="router.push(tile.to)"
      >
        <div class="scale__head">
          <span class="scale__label">{{ tile.label }}</span>
          <el-icon class="scale__icon"><component :is="scaleIconMap[tile.key]" /></el-icon>
        </div>
        <div class="scale__value num">
          <span v-if="scaleLoading" class="skeleton-line scale__skeleton" />
          <template v-else-if="scaleTotals[tile.key] !== null">{{ scaleTotals[tile.key] }}</template>
          <span v-else class="scale__error">—</span>
        </div>
        <div class="scale__foot">{{ scaleTotals[tile.key] === null && !scaleLoading ? '数据获取失败' : tile.hint }}</div>
      </article>
    </section>
  </div>
</template>

<style scoped lang="scss">
/* ---------------- 订单待办 ---------------- */
.order-board {
  padding: var(--space-5);

  &__head {
    margin-bottom: var(--space-4);

    h2 {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }

    p {
      margin-top: 2px;
      font-size: 12px;
      color: var(--text-placeholder);
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-3);
  }
}

.order-card {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 16px 18px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background-color: var(--neutral-25);
  cursor: pointer;
  text-align: left;
  transition: transform var(--duration-base) var(--ease-out-quart),
    box-shadow var(--duration-base) var(--ease-out-quart),
    border-color var(--duration-base) var(--ease-out-quart);

  /* 左侧色条表达紧急程度，不靠刺眼的整块底色 */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 14px;
    bottom: 14px;
    width: 3px;
    border-radius: 0 3px 3px 0;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  &:active {
    transform: translateY(0) scale(0.995);
  }

  &__label {
    font-size: 13px;
    color: var(--text-secondary);
  }

  &__value {
    margin-left: auto;
    font-size: 26px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  &__unit {
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__skeleton {
    display: inline-block;
    width: 34px;
    height: 22px;
    vertical-align: middle;
  }

  &--danger::before {
    background-color: var(--danger-500);
  }

  &--warning::before {
    background-color: var(--warning-500);
  }

  &--primary::before {
    background-color: var(--brand-500);
  }

  &--success::before {
    background-color: var(--success-500);
  }

  &--danger:hover {
    border-color: rgba(192, 69, 60, 0.35);
  }

  &--warning:hover {
    border-color: rgba(184, 128, 31, 0.35);
  }

  &--primary:hover {
    border-color: var(--brand-300);
  }

  &--success:hover {
    border-color: rgba(63, 143, 99, 0.35);
  }
}

/* ---------------- 经营规模 ---------------- */
.scale {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: var(--space-4);

  &__tile {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background-color: var(--surface);
    box-shadow: var(--shadow-xs);
    cursor: pointer;
    transition: transform var(--duration-base) var(--ease-out-quart),
      box-shadow var(--duration-base) var(--ease-out-quart),
      border-color var(--duration-base) var(--ease-out-quart);

    &:hover {
      transform: translateY(-2px);
      border-color: var(--brand-200);
      box-shadow: var(--shadow-md);
    }

    &:active {
      transform: translateY(0) scale(0.995);
    }
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__label {
    font-size: 13px;
    color: var(--text-secondary);
  }

  &__icon {
    font-size: 15px;
    color: var(--brand-400);
  }

  &__value {
    font-size: 26px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  &__skeleton {
    display: inline-block;
    width: 48px;
    height: 22px;
    vertical-align: middle;
  }

  &__error {
    color: var(--neutral-300);
  }

  &__foot {
    font-size: 12px;
    color: var(--text-placeholder);
  }
}
</style>
