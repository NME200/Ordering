<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { createPosOrder, fetchOrder, markOrderOfflinePaid } from '@shared/api/order';
import { BusinessError } from '@shared/utils/request';
import type { CreatePosOrderPayload, Order } from '@shared/types/order';
import { useDraftStore } from '@/store/modules/draft';
import type { Dish } from '@shared/types/dish';
import { activeSpecGroups } from '@/hooks/usePosMenu';
import { MAX_ORDER_LINES } from '@/constants/pos-limits';
import { ORDER_DISH_UNAVAILABLE } from '@/constants/error-codes';
import MenuBoard from './components/MenuBoard.vue';
import SpecPicker from './components/SpecPicker.vue';
import TicketPanel from './components/TicketPanel.vue';
import OpenSlip from './components/OpenSlip.vue';
import type { CheckoutMode, SpecSelection } from '@/types/pos';

const draftStore = useDraftStore();

const boardRef = ref<InstanceType<typeof MenuBoard> | null>(null);

/* ---------------- 规格弹窗 ---------------- */

const pickerVisible = ref(false);
const pickedDish = ref<Dish | null>(null);

/** 点击菜品：无生效规格直接加购，有规格先弹窗 */
function handlePick(dish: Dish): void {
  if (activeSpecGroups(dish).length === 0) {
    addDish(dish, [], 1);
    return;
  }
  pickedDish.value = dish;
  pickerVisible.value = true;
}

function handleSpecConfirm(payload: SpecSelection): void {
  const dish = pickedDish.value;
  if (!dish) {
    return;
  }
  addDish(dish, payload.specOptionIds, payload.quantity);
}

function addDish(dish: Dish, specOptionIds: number[], quantity: number): void {
  const ok = draftStore.add(dish, specOptionIds, quantity);
  if (!ok) {
    ElMessage.warning(`单笔订单最多 ${MAX_ORDER_LINES} 行明细，请先结算本单`);
  }
}

/* ---------------- 开单与收款 ---------------- */

const submitting = ref<CheckoutMode | null>(null);
const slipVisible = ref(false);
const slipOrder = ref<Order | null>(null);
const slipSettled = ref(false);

/** 随单信息只在填了的时候提交：后端这些字段可空，交空串会把空写进库而不是 NULL */
function buildPayload(): CreatePosOrderPayload {
  const meta = draftStore.meta;
  return {
    // 门店不传：收银员 / 门店管理员都是门店绑定角色，服务端按 Token 解析
    items: draftStore.lines.map((line) => ({
      dishId: line.dishId,
      quantity: line.quantity,
      specOptionIds: line.specOptionIds,
    })),
    clientToken: draftStore.clientToken,
    tableNo: meta.tableNo || undefined,
    customerName: meta.customerName || undefined,
    customerPhone: meta.customerPhone || undefined,
    remark: meta.remark || undefined,
  };
}

/**
 * 开单（可选同时收款）。
 *
 * 幂等策略：`clientToken` 在同一张草稿内不变，所以
 * - 连点两次「现金收款」只会落一单；
 * - 开单成功但收款失败时，草稿**故意不清**，重试会复用已存在的订单继续收款，
 *   而不是再开一张新单（这正是收银台上最容易出的事故）。
 */
async function checkout(mode: CheckoutMode): Promise<void> {
  if (draftStore.isEmpty || submitting.value) {
    return;
  }

  submitting.value = mode;
  try {
    const created = await createPosOrder(buildPayload());
    let settled = false;

    if (mode === 'settle') {
      try {
        await markOrderOfflinePaid(created.id);
        settled = true;
      } catch {
        // 单已经开出，只是这一秒没收到钱；下面按「待收款」出小票，草稿保留
        ElMessage.warning('开单成功，但收款未完成，请到订单通道补收');
      }
    }

    // 收款后金额与状态都以服务端为准，回读一次再打小票
    slipOrder.value = await fetchOrder(created.id).catch(() => created);
    slipSettled.value = settled;
    slipVisible.value = true;

    if (settled || mode === 'hold') {
      draftStore.reset();
    }
  } catch (error) {
    // 菜单在本地缓存期间被下架：刷新菜单，让收银员重选而不是对着老磁贴反复提交
    if (error instanceof BusinessError && error.code === ORDER_DISH_UNAVAILABLE) {
      void boardRef.value?.reload();
    }
  } finally {
    submitting.value = null;
  }
}
</script>

<template>
  <div class="pos">
    <!-- 左：菜单（点菜） -->
    <MenuBoard ref="boardRef" class="pos__board" @pick="handlePick" />

    <!-- 右：票券（本单） -->
    <TicketPanel class="pos__ticket" :submitting="submitting" @checkout="checkout" />

    <SpecPicker v-model="pickerVisible" :dish="pickedDish" @confirm="handleSpecConfirm" />
    <OpenSlip v-model="slipVisible" :order="slipOrder" :settled="slipSettled" />
  </div>
</template>

<style scoped lang="scss">
.pos {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--ticket-width);
  height: 100%;
  min-height: 0;
  background-color: var(--surface);

  &__board {
    min-width: 0;
    height: 100%;
  }

  &__ticket {
    height: 100%;
  }
}

@media (max-width: 1180px) {
  .pos {
    grid-template-columns: minmax(0, 1fr) 344px;
  }
}

/* 触屏手机 / 极窄窗口：票券压到底部，菜单占满上半屏 */
@media (max-width: 860px) {
  .pos {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;

    &__ticket {
      height: auto;
      max-height: 56vh;
      border-left: none;
      border-top: 1px solid var(--border-color);
    }
  }
}
</style>
