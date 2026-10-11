<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { fetchInvoices, handleInvoice } from '@/api/invoice';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { Permission } from '@shared/types/enums';
import { fenToYuan, formatDateTime, orEmpty } from '@shared/utils/format';
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_OPTIONS,
  INVOICE_STATUS_TAG_TYPES,
  INVOICE_TITLE_KIND_LABELS,
} from '@/types/invoice';
import type {
  InvoiceHandleStatus,
  InvoiceQuery,
  InvoiceRow,
  InvoiceStatus,
  InvoiceTitleKind,
} from '@/types/invoice';
import { useUserStore } from '@/store/modules/user';

/**
 * 开票申请受理。
 *
 * 本轮**没有接开票服务商**：顾客提交后由商户线下开电子发票，再回到这一屏回填发票号。
 * 界面文案必须如实写这件事，不能出现「系统将自动开票」这类承诺。
 *
 * 三条服务端规则在前端先拦住（省一次 400）：置为已开票必须带发票号、驳回必须带原因、
 * 已开票不可回退。
 */
const userStore = useUserStore();
const canHandle = computed(() => userStore.hasPermission(Permission.INVOICE_UPDATE));

const defaultQuery: InvoiceQuery = { page: 1, pageSize: 10, status: undefined, keyword: '' };

const { list, total, loading, query, load, search, reset } = useListQuery(
  fetchInvoices,
  defaultQuery,
);

function rowAt(index: number): InvoiceRow {
  return list.value[index];
}

const isFiltered = computed(() => query.status !== undefined || Boolean(query.keyword));

function handlePageChange(page: number): void {
  query.page = page;
  void load();
}

function handlePageSizeChange(size: number): void {
  query.pageSize = size;
  query.page = 1;
  void load();
}

/** 待开票 / 开票中的单子才需要催办，已开票与已驳回只是留档 */
function isTodo(status: InvoiceStatus): boolean {
  return status === 'pending' || status === 'issuing';
}

/* ---------------- 受理 ---------------- */

const dialogVisible = ref(false);
const saving = ref(false);
const target = ref<InvoiceRow | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({
  status: 'issuing' as InvoiceHandleStatus,
  invoiceNo: '',
  invoiceUrl: '',
  note: '',
});

const rules = computed<FormRules<typeof form>>(() => ({
  invoiceNo:
    form.status === 'issued'
      ? [
          { required: true, message: '置为已开票必须填写发票号', trigger: 'blur' },
          { max: 64, message: '发票号最长 64 个字符', trigger: 'blur' },
        ]
      : [{ max: 64, message: '发票号最长 64 个字符', trigger: 'blur' }],
  invoiceUrl: [{ max: 255, message: '发票地址最长 255 个字符', trigger: 'blur' }],
  note:
    form.status === 'rejected'
      ? [
          { required: true, message: '驳回必须写明原因，顾客会看到这句话', trigger: 'blur' },
          { max: 255, message: '说明最长 255 个字符', trigger: 'blur' },
        ]
      : [{ max: 255, message: '说明最长 255 个字符', trigger: 'blur' }],
}));

/**
 * 可选的处理结果。
 *
 * 后端只接受 issuing / issued / rejected（pending 不是受理动作），
 * 且已开票的申请不能回退 —— 所以 issued 行只剩「更正发票号」这一项。
 */
const statusOptions = computed<{ label: string; value: InvoiceHandleStatus }[]>(() => {
  const row = target.value;
  if (!row) {
    return [];
  }
  const options: { label: string; value: InvoiceHandleStatus }[] = [
    { label: '受理（开票中）', value: 'issuing' },
    { label: '已开票（回填发票号）', value: 'issued' },
    { label: '驳回', value: 'rejected' },
  ];
  return row.status === 'issued' ? options.filter((item) => item.value === 'issued') : options;
});

function openHandle(row: InvoiceRow): void {
  target.value = row;
  form.status = row.status === 'issued' ? 'issued' : 'issuing';
  form.invoiceNo = row.invoiceNo ?? '';
  form.invoiceUrl = row.invoiceUrl ?? '';
  form.note = row.handleNote ?? '';
  dialogVisible.value = true;
}

const ACTION_TEXT: Record<InvoiceHandleStatus, string> = {
  issuing: '已受理，状态转为开票中',
  issued: '已回填发票号，状态转为已开票',
  rejected: '已驳回该申请',
};

async function handleSubmit(): Promise<void> {
  const row = target.value;
  if (!row) {
    return;
  }
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  saving.value = true;
  try {
    await handleInvoice(row.id, {
      status: form.status,
      invoiceNo: form.invoiceNo.trim() || undefined,
      invoiceUrl: form.invoiceUrl.trim() || undefined,
      note: form.note.trim() || undefined,
    });
    ElMessage.success(ACTION_TEXT[form.status]);
    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

/** 列表里的快捷动作：受理 = 只把状态推到开票中，不额外要输入 */
const accepting = ref(false);

async function quickAccept(row: InvoiceRow): Promise<void> {
  accepting.value = true;
  try {
    await handleInvoice(row.id, { status: 'issuing' });
    ElMessage.success('已受理，线下开好电子票后回来回填发票号');
    await load();
  } catch {
    // 服务端原因已由请求层弹出
  } finally {
    accepting.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="开票申请"
      description="顾客在小程序提交的开票申请。本轮未接入开票服务商，由本店线下开好电子发票后回到这里回填发票号；已开票的申请不能回退"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
        <el-select v-model="query.status" class="filters__field" placeholder="全部状态" clearable>
          <el-option
            v-for="option in INVOICE_STATUS_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索订单号 / 抬头"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />

        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="订单 / 金额" min-width="180">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main num">¥ {{ fenToYuan(row.amount) }}</span>
              <span class="cell-stack__sub num">订单 {{ row.orderNo }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="抬头" min-width="220">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main">
                <el-tag effect="plain" size="small" round>
                  {{ INVOICE_TITLE_KIND_LABELS[row.kind as InvoiceTitleKind] }}
                </el-tag>
                {{ row.title }}
              </span>
              <span class="cell-stack__sub num">
                税号 {{ orEmpty(row.taxNo) }} · {{ row.email }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              :type="INVOICE_STATUS_TAG_TYPES[row.status as InvoiceStatus]"
              effect="light"
              size="small"
              round
            >
              {{ row.statusLabel || INVOICE_STATUS_LABELS[row.status as InvoiceStatus] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="发票号" min-width="160">
          <template #default="{ row }">
            <span class="num" :class="{ 'empty-cell': !row.invoiceNo }">{{ orEmpty(row.invoiceNo) }}</span>
            <p v-if="row.invoiceUrl" class="cell-note">
              <a class="link" :href="row.invoiceUrl" target="_blank" rel="noopener">电子发票下载</a>
            </p>
          </template>
        </el-table-column>

        <el-table-column label="顾客备注 / 处理说明" min-width="200">
          <template #default="{ row }">
            <div class="cell-stack">
              <span v-if="row.remark" class="cell-stack__main">{{ row.remark }}</span>
              <span v-if="row.handleNote" class="cell-stack__sub">{{ row.handleNote }}</span>
              <span v-if="!row.remark && !row.handleNote" class="cell-stack__sub">—</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="申请时间" width="170">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="num muted">{{ formatDateTime(row.createdAt) }}</span>
              <span v-if="row.handledAt" class="cell-stack__sub num">
                处理于 {{ formatDateTime(row.handledAt) }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="canHandle" label="操作" width="190" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button
                v-if="rowAt($index).status === 'pending'"
                link
                type="success"
                :disabled="accepting || saving"
                @click="quickAccept(rowAt($index))"
              >
                受理
              </el-button>
              <el-button link type="primary" @click="openHandle(rowAt($index))">
                {{ isTodo(rowAt($index).status) ? '开票 / 驳回' : '查看 · 更正' }}
              </el-button>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty
            :filtered="isFiltered"
            hint="顾客在小程序「我的发票」里对已完成订单发起申请后，会落到这一屏"
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

    <!-- 受理 -->
    <el-dialog v-model="dialogVisible" title="受理开票申请" width="560px" :close-on-click-modal="false">
      <div v-if="target" class="handle-origin">
        <div class="cell-stack">
          <span class="cell-stack__main num">订单 {{ target.orderNo }}</span>
          <span class="cell-stack__sub">
            抬头 {{ target.title }}（
            {{ INVOICE_TITLE_KIND_LABELS[target.kind] }}
            <template v-if="target.taxNo"> · 税号 {{ target.taxNo }}</template>
            ）· 收件邮箱 {{ target.email }}
          </span>
          <span class="cell-stack__sub num">
            开票金额 ¥ {{ fenToYuan(target.amount) }} · 申请于
            {{ formatDateTime(target.createdAt) }}
          </span>
          <span v-if="target.remark" class="cell-stack__sub">顾客备注：{{ target.remark }}</span>
        </div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item label="处理结果" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio v-for="option in statusOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </el-radio>
          </el-radio-group>
          <p v-if="target && target.status === 'issued'" class="form-hint">
            已开票的申请不能回退，这里只能更正发票号与下载地址。
          </p>
        </el-form-item>

        <template v-if="form.status === 'issued'">
          <el-form-item label="发票号" prop="invoiceNo">
            <el-input v-model="form.invoiceNo" placeholder="线下开好的电子发票号码" maxlength="64" />
            <p class="form-hint">
              本轮未接入开票服务商：请先在线下开好电子发票，再回到这里回填发票号，顾客才能在小程序看到「已开票」。
            </p>
          </el-form-item>
          <el-form-item label="发票地址" prop="invoiceUrl">
            <el-input v-model="form.invoiceUrl" placeholder="选填，电子发票下载 / 查看链接" maxlength="255" />
          </el-form-item>
        </template>

        <el-form-item :label="form.status === 'rejected' ? '驳回原因' : '处理说明'" prop="note">
          <el-input
            v-model="form.note"
            type="textarea"
            :rows="3"
            maxlength="255"
            show-word-limit
            :placeholder="
              form.status === 'rejected'
                ? '必填，顾客会看到这句话，例如：抬头税号校验不通过，请修正后重新提交'
                : '选填，留给顾客看的处理说明'
            "
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSubmit">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.handle-origin {
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--neutral-25);
}

.link {
  color: var(--brand-600);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
</style>
