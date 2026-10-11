<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Delete, Edit, Plus, Refresh, Search, Tickets } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  createCoupon,
  fetchCouponRecords,
  fetchCoupons,
  removeCoupon,
  updateCoupon,
  updateCouponStatus,
} from '@/api/coupon';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { Permission } from '@shared/types/enums';
import { fenToYuanNumber, formatDate, formatDateTime, yuanToFen } from '@shared/utils/format';
import {
  COUPON_SCENE_LABELS,
  COUPON_SCENES,
  COUPON_TEMPLATE_STATUS_LABELS,
  COUPON_TEMPLATE_STATUS_OPTIONS,
  COUPON_TYPE_LABELS,
  CUSTOMER_COUPON_STATUS_LABELS,
} from '@/types/coupon';
import type {
  CouponPayload,
  CouponQuery,
  CouponScene,
  CouponTemplate,
  CouponTemplateStatus,
  CouponType,
  CustomerCouponRecord,
  CustomerCouponStatus,
} from '@/types/coupon';
import { useUserStore } from '@/store/modules/user';

/**
 * 本店优惠券模板管理。
 *
 * 三条后端硬规则在这里先拦一遍，让用户在提交前就看到原因，而不是收到一个 400：
 * 满减金额必须小于门槛（否则算出负应付）、折扣率 1~99、有效期「领取后 N 天」与
 * 「固定区间」二选一。
 *
 * 金额输入一律用「元」，提交前转「分」；券面文案（faceValue / thresholdText）直接用
 * 服务端返回值，前端不重算 —— 三端各写一份四舍五入，顾客看到的就会和核销的对不上。
 */
const userStore = useUserStore();
const canWrite = computed(() => userStore.hasPermission(Permission.COUPON_UPDATE));

/* ---------------- 列表 ---------------- */

const defaultQuery: CouponQuery = { page: 1, pageSize: 10, scene: undefined, status: undefined };

const { list, total, loading, query, load, search, reset } = useListQuery(
  fetchCoupons,
  defaultQuery,
);

/** el-table 插槽的 row 为宽松类型（EP 的 DefaultRow），按索引取回强类型行 */
function rowAt(index: number): CouponTemplate {
  return list.value[index];
}

const isFiltered = computed(() => query.scene !== undefined || query.status !== undefined);

function handlePageChange(page: number): void {
  query.page = page;
  void load();
}

function handlePageSizeChange(size: number): void {
  query.pageSize = size;
  query.page = 1;
  void load();
}

/** 有效期列：两种口径的展示完全不同，不能混成一个字符串 */
function validText(row: CouponTemplate): string {
  if (row.validDays !== null) {
    return `领取后 ${row.validDays} 天内有效`;
  }
  return `${formatDate(row.startAt)} ~ ${formatDate(row.endAt)}`;
}

function sceneHint(scene: CouponScene): string {
  return COUPON_SCENES.find((item) => item.value === scene)?.hint ?? '';
}

/* ---------------- 新建 / 编辑 ---------------- */

/** 有效期录入模式：与后端的「二选一」一一对应 */
type ValidMode = 'days' | 'range';

interface CouponForm {
  id: number | null;
  name: string;
  type: CouponType;
  /** amount 为减免金额（元）；discount 为折扣率百分数（80 = 打 8 折） */
  value: number;
  /** 使用门槛（元），0 = 无门槛 */
  threshold: number;
  /** 最多抵扣（元），0 = 不限，仅折扣券有意义 */
  maxDiscount: number;
  scene: CouponScene;
  mode: ValidMode;
  validDays: number;
  startAt: string;
  endAt: string;
  /** 发行总量（张），0 = 不限量 */
  totalCount: number;
  perLimit: number;
  description: string;
}

function createEmptyForm(): CouponForm {
  return {
    id: null,
    name: '',
    type: 'amount',
    value: 5,
    threshold: 30,
    maxDiscount: 0,
    scene: 'normal',
    mode: 'days',
    validDays: 30,
    startAt: '',
    endAt: '',
    totalCount: 0,
    perLimit: 1,
    description: '',
  };
}

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<CouponForm>(createEmptyForm());

/** 满减面额上限（元），与后端 COUPON_VALUE_CAP 同一条线 */
const AMOUNT_CAP_YUAN = 999;
/** 抵扣上限（元），与后端 MAX_COUPON_DISCOUNT_CENT 同一条线 */
const DISCOUNT_CAP_YUAN = 1000;

/**
 * 切换券类型时把 value 复位。
 *
 * 同一个输入框在两种类型下量纲不同（元 / 百分数），留着上一个值会让用户以为
 * 「5」既是 5 元又是 5 折，宁可重置。
 */
watch(
  () => form.type,
  (type) => {
    form.value = type === 'discount' ? 90 : 5;
    if (type === 'discount') {
      form.maxDiscount = 0;
    }
  },
);

const rules = computed<FormRules<CouponForm>>(() => ({
  name: [
    { required: true, message: '请输入券名', trigger: 'blur' },
    { max: 64, message: '券名最长 64 个字符', trigger: 'blur' },
  ],
  value: [
    { required: true, message: '请填写面额 / 折扣率', trigger: 'blur' },
    {
      validator: (_rule: unknown, _value: number, callback: (error?: Error) => void) => {
        if (form.type === 'discount') {
          callback(
            form.value < 1 || form.value > 99 || !Number.isInteger(form.value)
              ? new Error('折扣率要是 1~99 的整数（80 表示打 8 折）')
              : undefined,
          );
          return;
        }
        if (form.value <= 0) {
          callback(new Error('减免金额要大于 0'));
          return;
        }
        if (form.value > AMOUNT_CAP_YUAN) {
          callback(new Error(`满减金额最大 ${AMOUNT_CAP_YUAN} 元`));
          return;
        }
        if (form.threshold > 0 && yuanToFen(form.value) >= yuanToFen(form.threshold)) {
          callback(new Error('满减金额必须小于门槛，否则会算出负应付'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  maxDiscount: [
    {
      validator: (_rule: unknown, _value: number, callback: (error?: Error) => void) => {
        if (form.type !== 'discount' || form.maxDiscount === 0) {
          callback();
          return;
        }
        callback(
          form.maxDiscount > DISCOUNT_CAP_YUAN
            ? new Error(`抵扣上限最大 ${DISCOUNT_CAP_YUAN} 元`)
            : undefined,
        );
      },
      trigger: 'blur',
    },
  ],
  validDays: [
    {
      validator: (_rule: unknown, _value: number, callback: (error?: Error) => void) => {
        if (form.mode !== 'days') {
          callback();
          return;
        }
        callback(
          form.validDays >= 1 && form.validDays <= 3650
            ? undefined
            : new Error('有效天数要在 1 ~ 3650 之间'),
        );
      },
      trigger: 'blur',
    },
  ],
  startAt: [
    {
      validator: (_rule: unknown, _value: string, callback: (error?: Error) => void) => {
        if (form.mode !== 'range') {
          callback();
          return;
        }
        callback(form.startAt ? undefined : new Error('请选择有效期开始日期'));
      },
      trigger: 'change',
    },
  ],
  endAt: [
    {
      validator: (_rule: unknown, _value: string, callback: (error?: Error) => void) => {
        if (form.mode !== 'range') {
          callback();
          return;
        }
        if (!form.endAt) {
          callback(new Error('请选择有效期结束日期'));
          return;
        }
        callback(
          new Date(form.startAt) < new Date(form.endAt)
            ? undefined
            : new Error('结束日期必须晚于开始日期'),
        );
      },
      trigger: 'change',
    },
  ],
  perLimit: [
    {
      validator: (_rule: unknown, _value: number, callback: (error?: Error) => void) => {
        callback(
          form.perLimit >= 1 && form.perLimit <= 20
            ? undefined
            : new Error('每人限领 1 ~ 20 张'),
        );
      },
      trigger: 'blur',
    },
  ],
  description: [{ max: 255, message: '使用说明最长 255 个字符', trigger: 'blur' }],
}));

const dialogTitle = computed(() => (form.id === null ? '新建优惠券' : '编辑优惠券'));

function handleDialogOpened(): void {
  formRef.value?.clearValidate();
}

function openCreate(): void {
  Object.assign(form, createEmptyForm());
  dialogVisible.value = true;
}

function openEdit(row: CouponTemplate): void {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    type: row.type,
    value: row.type === 'discount' ? row.value : fenToYuanNumber(row.value),
    threshold: fenToYuanNumber(row.threshold),
    maxDiscount: row.maxDiscount === null ? 0 : fenToYuanNumber(row.maxDiscount),
    scene: row.scene,
    mode: row.validDays !== null ? ('days' as ValidMode) : ('range' as ValidMode),
    validDays: row.validDays ?? 30,
    startAt: row.startAt ? formatDate(row.startAt) : '',
    endAt: row.endAt ? formatDate(row.endAt) : '',
    totalCount: row.totalCount,
    perLimit: row.perLimit,
    description: row.description ?? '',
  });
  dialogVisible.value = true;
}

/**
 * 表单 → 后端入参。
 *
 * 两种有效期互斥下发：同时带上 startAt 与 validDays 会被服务端判成「填了两种」直接拒绝。
 */
function buildPayload(): CouponPayload {
  const payload: CouponPayload = {
    name: form.name.trim(),
    type: form.type,
    value:
      form.type === 'discount'
        ? Math.round(form.value)
        : yuanToFen(form.value),
    threshold: yuanToFen(form.threshold),
    scene: form.scene,
    totalCount: Math.max(0, Math.round(form.totalCount)),
    perLimit: Math.round(form.perLimit),
    description: form.description.trim() || undefined,
  };
  if (form.type === 'discount' && form.maxDiscount > 0) {
    payload.maxDiscount = yuanToFen(form.maxDiscount);
  }
  if (form.mode === 'days') {
    payload.validDays = Math.round(form.validDays);
  } else {
    payload.startAt = form.startAt;
    payload.endAt = form.endAt;
  }
  return payload;
}

async function handleSave(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  saving.value = true;
  try {
    const payload = buildPayload();
    if (form.id === null) {
      await createCoupon(payload);
      ElMessage.success('券模板已创建，默认处于下架状态');
    } else {
      await updateCoupon(form.id, payload);
      ElMessage.success('券模板已更新');
    }
    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

/* ---------------- 上下架 / 删除 ---------------- */

async function handleStatusChange(row: CouponTemplate, next: boolean): Promise<void> {
  const status: CouponTemplateStatus = next ? 1 : 0;
  try {
    const updated = await updateCouponStatus(row.id, status);
    row.status = updated.status;
    ElMessage.success(next ? '券已上架' : '券已下架，已发出的顾客券不回收');
  } catch {
    // 失败保持原状态；请求层已弹出服务端原因
  }
}

async function handleDelete(row: CouponTemplate): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除券模板「${row.name}」吗？已有人领取过就删不掉，请改为下架。`,
      '删除券模板',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    );
  } catch {
    return;
  }

  try {
    await removeCoupon(row.id);
  } catch {
    // 已发券时服务端拒绝，原因已由请求层弹出
    return;
  }

  ElMessage.success('券模板已删除');
  if (list.value.length === 1 && query.page > 1) {
    query.page -= 1;
  }
  await load();
}

/* ---------------- 发放记录 ---------------- */

const recordsVisible = ref(false);
const recordsLoading = ref(false);
const recordsTemplate = ref<CouponTemplate | null>(null);
const records = ref<CustomerCouponRecord[]>([]);
const recordsTotal = ref(0);
const recordsQuery = reactive({ page: 1, pageSize: 10 });

async function loadRecords(): Promise<void> {
  const template = recordsTemplate.value;
  if (!template) {
    return;
  }
  recordsLoading.value = true;
  try {
    const page = await fetchCouponRecords(template.id, { ...recordsQuery });
    records.value = page.list;
    recordsTotal.value = page.total;
  } catch {
    // 失败时清空而不是留着别张券的记录冒充数据
    records.value = [];
    recordsTotal.value = 0;
  } finally {
    recordsLoading.value = false;
  }
}

function openRecords(row: CouponTemplate): void {
  recordsTemplate.value = row;
  recordsQuery.page = 1;
  recordsVisible.value = true;
  void loadRecords();
}

function handleRecordsPageChange(page: number): void {
  recordsQuery.page = page;
  void loadRecords();
}

function handleRecordsSizeChange(size: number): void {
  recordsQuery.pageSize = size;
  recordsQuery.page = 1;
  void loadRecords();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="优惠券"
      description="本店的券模板。上架后才会出现在顾客端；下架只停止发放，已经发到顾客手里的券仍然是他们的资产。租户范围由登录账号强制隔离"
    >
      <template #actions>
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">
          新建优惠券
        </el-button>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
        <el-select v-model="query.scene" class="filters__field" placeholder="全部场景" clearable>
          <el-option
            v-for="item in COUPON_SCENES"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-select v-model="query.status" class="filters__field" placeholder="全部状态" clearable>
          <el-option
            v-for="option in COUPON_TEMPLATE_STATUS_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="券" min-width="200">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ row.name }}</span>
              <span class="cell-stack__sub">{{ row.thresholdText }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="面额" width="110" align="center">
          <template #default="{ row }">
            <span class="coupon-face num">{{ row.faceValue }}</span>
            <p class="cell-note">{{ COUPON_TYPE_LABELS[row.type as CouponType] }}</p>
          </template>
        </el-table-column>

        <el-table-column label="场景" width="170">
          <template #default="{ row }">
            <el-tag
              :type="row.scene === 'normal' ? 'success' : 'warning'"
              effect="light"
              size="small"
              round
            >
              {{ COUPON_SCENE_LABELS[row.scene as CouponScene] }}
            </el-tag>
            <p class="cell-note">{{ sceneHint(row.scene as CouponScene) }}</p>
          </template>
        </el-table-column>

        <el-table-column label="有效期" min-width="180">
          <template #default="{ $index }">
            <span class="num">{{ validText(rowAt($index)) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="发放" width="150" align="center">
          <template #default="{ row, $index }">
            <div class="cell-stack cell-stack--center num">
              <span class="cell-stack__main">
                {{ row.receivedCount }} /
                {{ rowAt($index).totalCount === 0 ? '不限量' : rowAt($index).totalCount }}
              </span>
              <span class="cell-stack__sub">每人限领 {{ row.perLimit }} 张</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="130" align="center">
          <template #default="{ row, $index }">
            <el-switch
              v-if="canWrite"
              :model-value="row.status === 1"
              @change="(value: string | number | boolean) => handleStatusChange(rowAt($index), Boolean(value))"
            />
            <el-tag v-else :type="row.status === 1 ? 'success' : 'info'" effect="light" size="small" round>
              {{ COUPON_TEMPLATE_STATUS_LABELS[row.status as CouponTemplateStatus] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button v-if="canWrite" link type="primary" :icon="Edit" @click="openEdit(rowAt($index))">
                编辑
              </el-button>
              <el-button link type="primary" :icon="Tickets" @click="openRecords(rowAt($index))">
                记录
              </el-button>
              <el-button v-if="canWrite" link type="danger" :icon="Delete" @click="handleDelete(rowAt($index))">
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty
            :filtered="isFiltered"
            hint="先建一张券再上架：只有状态为「已上架」且场景为「领券中心」的券才会出现在小程序里"
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

    <!-- 新建 / 编辑 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="640px"
      :close-on-click-modal="false"
      @opened="handleDialogOpened"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="104px">
        <el-form-item label="券名" prop="name">
          <el-input v-model="form.name" placeholder="例如：满 30 减 5" maxlength="64" show-word-limit />
        </el-form-item>

        <el-form-item label="券类型">
          <el-radio-group v-model="form.type">
            <el-radio value="amount">满减券</el-radio>
            <el-radio value="discount">折扣券</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="form.type === 'discount' ? '折扣率' : '减免金额'" prop="value">
          <el-input-number
            v-if="form.type === 'discount'"
            v-model="form.value"
            :min="1"
            :max="99"
            :step="1"
            controls-position="right"
          />
          <el-input-number
            v-else
            v-model="form.value"
            :min="0.01"
            :max="999"
            :precision="2"
            :step="1"
            controls-position="right"
          />
          <span class="unit">{{ form.type === 'discount' ? '（80 表示打 8 折）' : '元' }}</span>
        </el-form-item>

        <el-form-item label="使用门槛" prop="threshold">
          <el-input-number
            v-model="form.threshold"
            :min="0"
            :precision="2"
            :step="10"
            controls-position="right"
          />
          <span class="unit">元，0 表示无门槛</span>
        </el-form-item>

        <el-form-item v-if="form.type === 'discount'" label="最多抵扣" prop="maxDiscount">
          <el-input-number
            v-model="form.maxDiscount"
            :min="0"
            :precision="2"
            :step="10"
            controls-position="right"
          />
          <span class="unit">元，0 表示不限</span>
          <p class="form-hint">折扣券按订单总额抵扣，不填上限时大额订单可能把毛利吃掉。</p>
        </el-form-item>

        <el-form-item label="发放场景">
          <el-radio-group v-model="form.scene">
            <el-radio v-for="item in COUPON_SCENES" :key="item.value" :value="item.value">
              {{ item.label }}
            </el-radio>
          </el-radio-group>
          <p class="form-hint">{{ sceneHint(form.scene) }}</p>
        </el-form-item>

        <el-form-item label="有效期">
          <el-radio-group v-model="form.mode">
            <el-radio value="days">领取后 N 天</el-radio>
            <el-radio value="range">固定起止日期</el-radio>
          </el-radio-group>
          <p class="form-hint">两种只能选一种，顾客领券时看到的失效时间由这里决定。</p>
        </el-form-item>

        <el-form-item v-if="form.mode === 'days'" label="有效天数" prop="validDays">
          <el-input-number v-model="form.validDays" :min="1" :max="3650" controls-position="right" />
          <span class="unit">天</span>
        </el-form-item>

        <template v-else>
          <el-form-item label="开始日期" prop="startAt">
            <el-date-picker
              v-model="form.startAt"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择开始日期"
            />
          </el-form-item>
          <el-form-item label="结束日期" prop="endAt">
            <el-date-picker
              v-model="form.endAt"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择结束日期（当天 23:59 失效）"
            />
          </el-form-item>
        </template>

        <el-form-item label="发行总量">
          <el-input-number v-model="form.totalCount" :min="0" :step="100" controls-position="right" />
          <span class="unit">张，0 表示不限量</span>
        </el-form-item>

        <el-form-item label="每人限领" prop="perLimit">
          <el-input-number v-model="form.perLimit" :min="1" :max="20" controls-position="right" />
          <span class="unit">张</span>
        </el-form-item>

        <el-form-item label="使用说明" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            maxlength="255"
            show-word-limit
            placeholder="给顾客看的使用规则，例如：仅限堂食、不与其他优惠同享"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 发放与核销记录 -->
    <el-dialog v-model="recordsVisible" title="发放与核销记录" width="760px">
      <p v-if="recordsTemplate" class="records-head">
        {{ recordsTemplate.name }} · {{ recordsTemplate.faceValue }} ·
        {{ recordsTemplate.thresholdText }}
        <span class="muted">（共 {{ recordsTotal }} 张）</span>
      </p>

      <el-table v-loading="recordsLoading" :data="records" row-key="id" stripe>
        <el-table-column label="券" min-width="160">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ row.name }}</span>
              <span class="cell-stack__sub">编号 {{ row.id }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'used'
                  ? 'success'
                  : row.status === 'expired'
                    ? 'info'
                    : row.status === 'locked'
                      ? 'warning'
                      : 'primary'
              "
              effect="light"
              size="small"
              round
            >
              {{ CUSTOMER_COUPON_STATUS_LABELS[row.status as CustomerCouponStatus] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="领取时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.receivedAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="失效时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.expireAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="核销时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ row.usedAt ? formatDateTime(row.usedAt) : '—' }}</span>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty title="还没有人领到这张券" hint="上架后顾客才能领取；新客 / 生日券由服务端自动发放" />
        </template>
      </el-table>

      <TablePagination
        :total="recordsTotal"
        :page="recordsQuery.page"
        :page-size="recordsQuery.pageSize"
        @page-change="handleRecordsPageChange"
        @size-change="handleRecordsSizeChange"
      />
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.coupon-face {
  font-size: 15px;
  font-weight: 600;
  color: var(--brand-600);
}

.cell-stack--center {
  align-items: center;
}

.unit {
  margin-left: var(--space-2);
  font-size: 12px;
  color: var(--text-placeholder);
}

.records-head {
  margin-bottom: var(--space-3);
  font-size: 13px;
  color: var(--text-regular);
}
</style>
