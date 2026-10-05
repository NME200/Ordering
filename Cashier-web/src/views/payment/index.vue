<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Picture, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchPaymentChannels, fetchPayments, refundPayment } from '@shared/api/payment';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { useUserStore } from '@/store/modules/user';
import {
  PaymentChannel,
  PaymentStatus,
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_STATUS_LABELS,
  Permission,
  RefundStatus,
} from '@shared/types/enums';
import type { Payment, PaymentQuery } from '@shared/types/payment';
import { fenToYuan, formatDateTime, orEmpty } from '@shared/utils/format';

const userStore = useUserStore();

/** 退款是资金动作：收银员只有 payment:read，看不到退款入口 */
const canRefund = computed(() => userStore.hasPermission(Permission.PAYMENT_REFUND));

/* ---------------- 渠道选项 ---------------- */

const channels = ref<PaymentChannel[]>([]);

onMounted(async () => {
  try {
    const list = await fetchPaymentChannels();
    channels.value = list.map((item) => item.channel);
  } catch {
    channels.value = [PaymentChannel.OFFLINE, PaymentChannel.MOCK];
  }
});

/* ---------------- 列表 ---------------- */

const defaultQuery: PaymentQuery = {
  page: 1,
  pageSize: 12,
  channel: undefined,
  status: undefined,
  keyword: '',
  startTime: undefined,
  endTime: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(
  fetchPayments,
  defaultQuery,
);

function rowAt(index: number): Payment {
  return list.value[index];
}

const timeRange = ref<[string, string] | null>(null);

watch(timeRange, (range) => {
  query.startTime = range ? new Date(range[0].replace(' ', 'T')).toISOString() : undefined;
  query.endTime = range ? new Date(range[1].replace(' ', 'T')).toISOString() : undefined;
  search();
});

const isFiltered = computed(
  () =>
    Boolean(query.keyword) ||
    query.channel !== undefined ||
    query.status !== undefined ||
    timeRange.value !== null,
);

function handlePageChange(page: number): void {
  query.page = page;
  void load();
}

function handlePageSizeChange(size: number): void {
  query.pageSize = size;
  query.page = 1;
  void load();
}

function handleReset(): void {
  timeRange.value = null;
  reset();
}

/* ---------------- 收款方式配色 ---------------- */

const channelAccents: Record<string, string> = {
  [PaymentChannel.OFFLINE]: 'var(--success-500)',
  [PaymentChannel.WECHAT]: 'var(--brand-500)',
  [PaymentChannel.ALIPAY]: 'var(--info-500)',
  [PaymentChannel.MOCK]: 'var(--warning-500)',
};

/** 只有「支付成功且未退过款」的流水才允许退款 */
function refundable(payment: Payment): boolean {
  return (
    canRefund.value &&
    payment.status === PaymentStatus.SUCCESS &&
    (payment.refundStatus === RefundStatus.NONE || payment.refundStatus === RefundStatus.FAILED)
  );
}

const refunding = ref(false);

async function handleRefund(payment: Payment): Promise<void> {
  let reason = '';
  try {
    const result = await ElMessageBox.prompt(
      `将退还订单 ${payment.orderNo} 的全部款项 ¥ ${fenToYuan(payment.amount)}。当前只支持整单全额退款。`,
      '发起退款',
      {
        confirmButtonText: '确认退款',
        cancelButtonText: '再想想',
        inputPlaceholder: '退款原因（选填）',
        inputValidator: (value: string) => (value.length > 128 ? '原因最长 128 个字符' : true),
      },
    );
    reason = result.value ?? '';
  } catch {
    return;
  }

  refunding.value = true;
  try {
    await refundPayment(payment.id, { reason: reason.trim() || undefined });
    ElMessage.success('退款已提交');
    await load();
  } finally {
    refunding.value = false;
  }
}

const statusTagType: Record<number, 'primary' | 'success' | 'info' | 'warning' | 'danger'> = {
  [PaymentStatus.PENDING]: 'warning',
  [PaymentStatus.SUCCESS]: 'success',
  [PaymentStatus.FAILED]: 'danger',
  [PaymentStatus.CLOSED]: 'info',
};

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="terminal-page">
    <PageHeader
      title="收款记录"
      description="按支付单维度记录每一笔收款与退款；收银台只读，退款需要门店管理员权限"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
        <el-select v-model="query.channel" class="filters__field" placeholder="全部渠道" clearable>
          <el-option
            v-for="channel in channels"
            :key="channel"
            :label="PAYMENT_CHANNEL_LABELS[channel]"
            :value="channel"
          />
        </el-select>

        <el-select v-model="query.status" class="filters__field" placeholder="全部状态" clearable>
          <el-option :value="PaymentStatus.PENDING" label="待支付" />
          <el-option :value="PaymentStatus.SUCCESS" label="支付成功" />
          <el-option :value="PaymentStatus.FAILED" label="支付失败" />
          <el-option :value="PaymentStatus.CLOSED" label="已关闭" />
        </el-select>

        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="支付单号 / 订单号"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />

        <el-date-picker
          v-model="timeRange"
          class="filters__field filters__field--wide"
          type="datetimerange"
          value-format="YYYY-MM-DD HH:mm:ss"
          range-separator="至"
          start-placeholder="支付起"
          end-placeholder="支付止"
          clearable
        />

        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="支付单号" min-width="190">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main num">{{ row.paymentNo }}</span>
              <span class="cell-stack__sub num">{{ row.orderNo }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="渠道" width="130">
          <template #default="{ $index }">
            <span class="channel">
              <span
                class="channel__dot"
                :style="{ backgroundColor: channelAccents[rowAt($index).channel] }"
              />
              {{ rowAt($index).channelLabel || PAYMENT_CHANNEL_LABELS[rowAt($index).channel] }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="金额" width="130" align="right">
          <template #default="{ $index }">
            <span class="num amount">¥ {{ fenToYuan(rowAt($index).amount) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="110" align="center">
          <template #default="{ $index }">
            <el-tag :type="statusTagType[rowAt($index).status]" effect="light" size="small" round>
              {{ rowAt($index).statusLabel || PAYMENT_STATUS_LABELS[rowAt($index).status] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="退款" width="150">
          <template #default="{ $index }">
            <div v-if="rowAt($index).refundStatus !== RefundStatus.NONE" class="cell-stack">
              <span class="cell-stack__main">{{ rowAt($index).refundStatusLabel }}</span>
              <span class="cell-stack__sub num">
                ¥ {{ fenToYuan(rowAt($index).refundAmount ?? rowAt($index).amount) }}
              </span>
            </div>
            <span v-else class="empty-cell">—</span>
          </template>
        </el-table-column>

        <el-table-column label="支付时间" width="170">
          <template #default="{ $index }">
            <span class="num muted">
              {{
                rowAt($index).paidAt
                  ? formatDateTime(rowAt($index).paidAt)
                  : orEmpty(rowAt($index).failReason)
              }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ $index }">
            <el-button
              v-if="refundable(rowAt($index))"
              link
              type="danger"
              :disabled="refunding"
              @click="handleRefund(rowAt($index))"
            >
              退款
            </el-button>
            <span v-else class="empty-cell">—</span>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty
            :filtered="isFiltered"
            hint="收银台每完成一次「现金收款」，这里就会多一条线下收款流水"
          />
        </template>
      </el-table>

      <TablePagination
        :total="total"
        :page="query.page"
        :page-size="query.pageSize"
        @page-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
    </section>

    <p class="note">
      <el-icon class="note__icon"><Picture /></el-icon>
      <span>
        金额单位统一为「元」显示、以「分」存储；一笔订单可能对应多张支付单（关闭后重试），
        因此这里按支付单而非订单计数。
      </span>
    </p>
  </div>
</template>

<style scoped lang="scss">
.channel {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--text-regular);

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    background-color: var(--neutral-300);
  }
}

.amount {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background-color: var(--neutral-100);
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);

  &__icon {
    margin-top: 2px;
    font-size: 14px;
    color: var(--neutral-400);
  }
}
</style>
