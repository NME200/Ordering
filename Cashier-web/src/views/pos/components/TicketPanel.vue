<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Delete } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { useDraftStore, type DraftMeta } from '@/store/modules/draft';
import { MAX_ORDER_LINES, MAX_QUANTITY_PER_LINE } from '@/constants/pos-limits';
import { fenToYuan } from '@shared/utils/format';
import type { CheckoutMode } from '@/types/pos';

const props = defineProps<{ submitting: CheckoutMode | null }>();

const emit = defineEmits<{ (e: 'checkout', mode: CheckoutMode): void }>();

const draftStore = useDraftStore();

const busy = computed(() => props.submitting !== null);

/**
 * 随单字段的读写代理。
 * 模板里 `v-model` 直接写 store 会绕过 actions（项目约定不允许），
 * 所以每个字段包一层 computed，写入统一走 setMeta。
 */
function metaField(key: keyof DraftMeta) {
  return computed({
    get: () => draftStore.meta[key],
    set: (value: string) => draftStore.setMeta(key, value),
  });
}

const tableNo = metaField('tableNo');
const customerName = metaField('customerName');
const customerPhone = metaField('customerPhone');
const remark = metaField('remark');

/** 合计变化时脉冲一次：给「按到了」的即时反馈，而不是让人怀疑没加上 */
const pulsing = ref(false);
let pulseTimer: number | undefined;

watch(
  () => draftStore.totalAmount,
  () => {
    pulsing.value = true;
    window.clearTimeout(pulseTimer);
    pulseTimer = window.setTimeout(() => {
      pulsing.value = false;
    }, 320);
  },
);

onBeforeUnmount(() => {
  window.clearTimeout(pulseTimer);
});

async function clearDraft(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `本单已录入 ${draftStore.lineCount} 行、共 ${draftStore.dishCount} 件，清空后不可恢复。`,
      '清空本单',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '继续录入' },
    );
  } catch {
    return;
  }
  draftStore.reset();
}
</script>

<template>
  <aside class="ticket">
    <header class="ticket__head">
      <div>
        <p class="ticket__title">本单</p>
        <p class="ticket__sub num">{{ draftStore.lineCount }} 行 · {{ draftStore.dishCount }} 件</p>
      </div>
      <button
        class="ticket__clear"
        type="button"
        :disabled="draftStore.isEmpty || busy"
        title="清空本单"
        @click="clearDraft"
      >
        <el-icon><Delete /></el-icon>
        <span>清空</span>
      </button>
    </header>

    <div class="receipt-edge" aria-hidden="true" />

    <div class="ticket__lines">
      <div v-if="draftStore.isEmpty" class="ticket__empty">
        <svg viewBox="0 0 120 84" fill="none" aria-hidden="true">
          <path
            d="M30 14h60v58l-10-6-10 6-10-6-10 6-10-6-10 6V14Z"
            stroke="var(--neutral-300)"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="M42 30h36M42 42h24"
            stroke="var(--neutral-200)"
            stroke-width="2"
            stroke-linecap="round"
          />
          <circle cx="82" cy="58" r="13" stroke="var(--brand-300)" stroke-width="2" />
          <path
            d="M82 52v6l4 3"
            stroke="var(--brand-400)"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <p>还没点菜</p>
        <span>左侧点一下菜品就进单；带规格的会先弹规格选择。</span>
      </div>

      <ul v-else class="ticket__list">
        <li v-for="line in draftStore.lines" :key="line.key" class="line">
          <div class="line__main">
            <span class="line__name">{{ line.dishName }}</span>
            <span class="line__subtotal num"
              >¥ {{ fenToYuan((line.unitPrice + line.specAmount) * line.quantity) }}</span
            >
          </div>

          <div class="line__foot">
            <span class="line__spec">
              <template v-if="line.specSummary">{{ line.specSummary }} · </template>
              <span class="num">¥ {{ fenToYuan(line.unitPrice + line.specAmount) }}</span> /份
            </span>

            <span class="line__stepper">
              <button
                class="line__step"
                type="button"
                :disabled="busy"
                aria-label="减少一份"
                @click="draftStore.setQuantity(line.key, line.quantity - 1)"
              >
                −
              </button>
              <input
                class="line__qty num"
                type="number"
                min="1"
                :max="MAX_QUANTITY_PER_LINE"
                :value="line.quantity"
                :disabled="busy"
                :aria-label="`${line.dishName} 份数`"
                @change="
                  draftStore.setQuantity(
                    line.key,
                    Number(($event.target as HTMLInputElement).value),
                  )
                "
              />
              <button
                class="line__step"
                type="button"
                :disabled="busy"
                aria-label="增加一份"
                @click="draftStore.setQuantity(line.key, line.quantity + 1)"
              >
                +
              </button>
            </span>
          </div>
        </li>
      </ul>
    </div>

    <!-- 随单信息：后端全部可选，这里只在填了的时候才提交 -->
    <div class="ticket__meta">
      <div class="meta-grid">
        <label class="meta-field">
          <span>桌号</span>
          <input v-model="tableNo" maxlength="16" placeholder="如 A12" />
        </label>
        <label class="meta-field">
          <span>称呼</span>
          <input v-model="customerName" maxlength="32" placeholder="顾客称呼" />
        </label>
        <label class="meta-field meta-field--wide">
          <span>手机号</span>
          <input
            v-model="customerPhone"
            maxlength="20"
            inputmode="tel"
            placeholder="叫号 / 联系用"
          />
        </label>
        <label class="meta-field meta-field--full">
          <span>备注</span>
          <input v-model="remark" maxlength="255" placeholder="如「不要葱」" />
        </label>
      </div>
      <p v-if="draftStore.lineCount >= MAX_ORDER_LINES" class="meta-limit">
        已达单笔上限 {{ MAX_ORDER_LINES }} 行，请先结算本单。
      </p>
    </div>

    <footer class="ticket__foot">
      <div class="ticket__total" :class="{ 'is-pulsing': pulsing }">
        <span class="ticket__total-label">应收</span>
        <strong class="num"> <i>¥</i>{{ fenToYuan(draftStore.totalAmount) }} </strong>
      </div>

      <div class="ticket__actions">
        <button
          class="bigbtn bigbtn--ghost"
          type="button"
          :disabled="draftStore.isEmpty || busy"
          @click="emit('checkout', 'hold')"
        >
          <span class="bigbtn__label">先开单</span>
          <span class="bigbtn__hint">稍后收款</span>
        </button>
        <button
          class="bigbtn bigbtn--primary"
          type="button"
          :disabled="draftStore.isEmpty || busy"
          @click="emit('checkout', 'settle')"
        >
          <span class="bigbtn__label">
            {{ props.submitting === 'settle' ? '正在收款…' : '现金收款' }}
          </span>
          <span class="bigbtn__hint">现金 / 收款码已到手</span>
        </button>
      </div>
    </footer>
  </aside>
</template>

<style scoped lang="scss">
.ticket {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: var(--paper);
  border-left: 1px solid var(--border-color);
  box-shadow: -18px 0 40px -34px rgba(36, 31, 28, 0.5);

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5) var(--space-3);
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text-primary);
  }

  &__sub {
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__clear {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-full);
    background-color: var(--surface);
    color: var(--text-secondary);
    font-size: 12.5px;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-out-quart),
      color var(--duration-fast) var(--ease-out-quart);

    &:hover:not(:disabled) {
      border-color: var(--danger-500);
      color: var(--danger-500);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .receipt-edge {
    flex-shrink: 0;
    background-color: var(--bg-app);
    transform: scaleY(-1);
  }

  &__lines {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-2) var(--space-5) var(--space-4);
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 38px 16px;
    text-align: center;

    svg {
      width: 108px;
      height: 76px;
      margin-bottom: 6px;
      opacity: 0.85;
    }

    p {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-regular);
    }

    span {
      max-width: 26ch;
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-placeholder);
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
  }

  /* ---------------- 随单信息 ---------------- */
  &__meta {
    flex-shrink: 0;
    padding: var(--space-3) var(--space-5);
    border-top: 1px dashed var(--paper-rule);
  }

  &__foot {
    flex-shrink: 0;
    padding: var(--space-4) var(--space-5) var(--space-5);
    background-color: var(--surface);
    border-top: 1px solid var(--border-color);
  }

  &__total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);

    strong {
      font-size: 32px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: -0.03em;
      color: var(--brand-600);

      i {
        margin-right: 2px;
        font-size: 17px;
        font-style: normal;
        opacity: 0.7;
      }
    }

    &-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    /* 脉冲只缩放数字，不重排 */
    &.is-pulsing strong {
      animation: amount-pulse 320ms var(--ease-out-quart);
    }
  }

  &__actions {
    display: grid;
    grid-template-columns: 0.82fr 1.18fr;
    gap: var(--space-2);
  }
}

/* ---------------- 明细行 ---------------- */
.line {
  padding: 11px 0;
  border-bottom: 1px dashed var(--paper-rule);

  &:last-child {
    border-bottom: none;
  }

  &__main {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  &__name {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__subtotal {
    flex-shrink: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: 6px;
  }

  &__spec {
    font-size: 11.5px;
    color: var(--text-placeholder);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__stepper {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  &__step {
    width: 34px;
    height: 30px;
    border: none;
    background-color: var(--neutral-50);
    color: var(--text-regular);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;

    &:hover:not(:disabled) {
      background-color: var(--brand-50);
      color: var(--brand-700);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__qty {
    width: 44px;
    height: 30px;
    border: none;
    border-left: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
    background-color: var(--surface);
    text-align: center;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-primary);
    appearance: textfield;
    -moz-appearance: textfield;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      appearance: none;
      margin: 0;
    }
  }
}

/* ---------------- 随单信息字段 ---------------- */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.meta-field {
  display: flex;
  flex-direction: column;
  gap: 3px;

  span {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--text-placeholder);
  }

  &--full {
    grid-column: 1 / -1;
  }

  input {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background-color: var(--surface);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 12.5px;
    transition:
      border-color var(--duration-fast) var(--ease-out-quart),
      box-shadow var(--duration-fast) var(--ease-out-quart);

    &::placeholder {
      color: var(--neutral-300);
    }

    &:focus {
      outline: none;
      border-color: var(--brand-500);
      box-shadow: 0 0 0 3px rgba(194, 96, 60, 0.12);
    }
  }
}

.meta-limit {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--warning-500);
}

/* ---------------- 大号动作按钮 ---------------- */
.bigbtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 58px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    transform var(--duration-fast) var(--ease-out-quart),
    box-shadow var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

  &__label {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  &__hint {
    font-size: 10.5px;
    opacity: 0.72;
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  &--ghost {
    border: 1px solid var(--border-color-strong);
    background-color: var(--surface);
    color: var(--text-regular);

    &:hover:not(:disabled) {
      border-color: var(--brand-300);
      color: var(--brand-700);
    }
  }

  &--primary {
    border: none;
    background: linear-gradient(140deg, var(--brand-500), var(--brand-700));
    color: #fff;
    box-shadow: var(--shadow-brand);

    &:hover:not(:disabled) {
      box-shadow: 0 10px 26px -10px rgba(194, 96, 60, 0.75);
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0) scale(0.99);
    }
  }
}
</style>
