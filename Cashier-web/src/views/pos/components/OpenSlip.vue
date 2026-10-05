<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Money } from '@element-plus/icons-vue';
import type { Order } from '@shared/types/order';
import { OrderStatus } from '@shared/types/enums';
import { fenToYuan, formatDateTime } from '@shared/utils/format';

/**
 * 开单成功回执。
 *
 * 收银台上「按下收款之后发生了什么」必须一眼确认，否则收银员会重复点击。
 * 因此这里用一张小票形态把订单号 / 金额 / 收款结果说清楚，
 * 并把「继续开单」做成唯一的显眼出口。
 */
const props = defineProps<{
  modelValue: boolean;
  order: Order | null;
  /** 本次是否已完成线下收款 */
  settled: boolean;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

const router = useRouter();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

function close(): void {
  visible.value = false;
}

/** 去订单通道看这一单（待收款的单只能在那里继续收款） */
function goOrder(): void {
  close();
  void router.push({ path: '/orders', query: { keyword: props.order?.orderNo ?? '' } });
}
</script>

<template>
  <el-dialog v-model="visible" width="420px" align-center :show-close="false" append-to-body>
    <div v-if="order" class="slip">
      <span class="slip__stamp" :class="settled ? 'is-paid' : 'is-hold'">
        <el-icon><component :is="settled ? Money : ArrowLeft" /></el-icon>
        <b>{{ settled ? '已收款' : '待收款' }}</b>
      </span>

      <p class="slip__brand">Ordering · 收银台</p>
      <p class="slip__no num">{{ order.orderNo }}</p>

      <div class="receipt-rule slip__rule" />

      <ul class="slip__items">
        <li v-for="item in order.items" :key="item.id" class="slip__item">
          <span class="slip__item-name">
            {{ item.dishName }}
            <em v-if="item.specSummary">{{ item.specSummary }}</em>
          </span>
          <span class="num">{{ item.quantity }}</span>
          <span class="num">¥ {{ fenToYuan(item.subtotal) }}</span>
        </li>
      </ul>

      <div class="receipt-rule slip__rule" />

      <dl class="slip__foot">
        <div class="slip__row">
          <dt>件数</dt>
          <dd class="num">{{ order.itemCount }} 件</dd>
        </div>
        <div v-if="order.tableNo" class="slip__row">
          <dt>桌号</dt>
          <dd>{{ order.tableNo }}</dd>
        </div>
        <div v-if="order.remark" class="slip__row">
          <dt>备注</dt>
          <dd>{{ order.remark }}</dd>
        </div>
        <div class="slip__row">
          <dt>下单时间</dt>
          <dd class="num">{{ formatDateTime(order.createdAt) }}</dd>
        </div>
      </dl>

      <div class="slip__total">
        <span>{{ settled ? '实收' : '应收' }}</span>
        <strong class="num"
          >¥
          {{
            fenToYuan(settled ? (order.paidAmount ?? order.payableAmount) : order.payableAmount)
          }}</strong
        >
      </div>

      <p v-if="!settled" class="slip__warn">
        {{
          order.status === OrderStatus.PENDING_PAYMENT
            ? '这一单停在「待支付」，收到钱后到订单通道点「收款」即可。'
            : '这一单已开出，当前状态无需再收款。'
        }}
      </p>
    </div>

    <template #footer>
      <div class="slip__actions">
        <el-button size="large" @click="goOrder">查看这一单</el-button>
        <el-button type="primary" size="large" @click="close">继续开单</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.slip {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-2) var(--space-2) var(--space-4);

  &__brand {
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--text-placeholder);
  }

  &__no {
    margin-top: 2px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--text-primary);
  }

  &__rule {
    margin: var(--space-3) 0;
  }

  /* 印章：稍微压住内容，像真盖上去的 */
  &__stamp {
    position: absolute;
    right: 4px;
    top: -6px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 12px;
    border: 2px solid currentColor;
    border-radius: var(--radius-sm);
    font-size: 13px;
    transform: rotate(-4deg);
    animation: stamp-in 360ms var(--ease-out-expo) both;

    &.is-paid {
      color: var(--success-500);
      background-color: rgba(63, 143, 99, 0.08);
    }

    &.is-hold {
      color: var(--warning-500);
      background-color: rgba(184, 128, 31, 0.08);
    }
  }

  &__items {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  &__item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px 78px;
    align-items: baseline;
    gap: 8px;
    font-size: 12.5px;
    color: var(--text-regular);

    &-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      em {
        margin-left: 4px;
        font-size: 11px;
        font-style: normal;
        color: var(--text-placeholder);
      }
    }

    span:nth-child(2) {
      text-align: center;
    }

    span:last-child {
      text-align: right;
    }
  }

  &__foot {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    font-size: 12px;

    dt {
      color: var(--text-placeholder);
    }

    dd {
      margin: 0;
      color: var(--text-regular);
      text-align: right;
    }
  }

  &__total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-4);
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 2px solid var(--text-primary);

    span {
      font-size: 13px;
      font-weight: 600;
    }

    strong {
      font-size: 26px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
  }

  &__warn {
    margin-top: var(--space-3);
    padding: 9px 12px;
    border-left: 3px solid var(--warning-500);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    background-color: var(--warning-100);
    font-size: 12px;
    line-height: 1.65;
    color: #7a5613;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
}
</style>
