<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { fetchMerchantOptions } from '@shared/api/merchant';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { Permission } from '@shared/types/enums';
import type { Merchant } from '@shared/types/merchant';
import { formatDate, formatDateTime, fenToYuanNumber, yuanToFen } from '@shared/utils/format';
import {
  createCoupon,
  fetchCouponRecords,
  fetchCoupons,
  removeCoupon,
  updateCoupon,
  updateCouponStatus,
} from '@/api/marketing';
import {
  COUPON_SCENE_LABELS,
  COUPON_SCENE_OPTIONS,
  COUPON_TEMPLATE_STATUS_OPTIONS,
  COUPON_TYPE_LABELS,
  COUPON_TYPE_OPTIONS,
  ISSUED_COUPON_STATUS_LABELS,
  ISSUED_COUPON_STATUS_TAG_TYPES,
  MAX_AMOUNT_YUAN,
  MAX_DISCOUNT_CAP_YUAN,
} from '@/types/marketing';
import type {
  CouponQuery,
  CouponScene,
  CouponTemplate,
  CouponTemplateStatus,
  CouponType,
  IssuedCoupon,
  IssuedCouponStatus,
  UpsertCouponPayload,
} from '@/types/marketing';
import { useUserStore } from '@/store/modules/user';

/**
 * 平台管理端 · 平台券管理。
 *
 * 平台的营销身份只有一件事：**配 merchantId = null 的全场通用券**。
 * 后端把写路径的归属按角色推导（平台恒为 null），所以商户的券在这里
 * 不但改不动，越界调用还会被当成「优惠券不存在」—— 页面上的禁用与原因说明
 * 就是把这条硬规则提前说给人听，而不是让运营去撞 404。
 *
 * 券面文案（faceValue / thresholdText / remain）全部用后端回的值：
 * 三端共用一份算价口径才是它的存在意义，前端再算一遍就是三个版本的真相。
 */
const userStore = useUserStore();
const canWrite = computed(() => userStore.hasPermission(Permission.COUPON_UPDATE));

/**
 * 这一行的写能力（编辑 / 上下架 / 删除 / 看发放记录）。
 *
 * 发放记录也走归属判定：后端 records 接口同样按「必须是平台券」取模板，
 * 所以对商户的券连记录都读不到，不是「只禁了编辑」。
 */
function writable(row: CouponTemplate): boolean {
  return canWrite.value && row.merchantId === null;
}

function lockReason(row: CouponTemplate): string {
  if (!canWrite.value) {
    return '当前账号没有 coupon:update 权限，只能查看';
  }
  return `这是「${merchantLabel(row.merchantId)}」自己的券，平台只有查看权 —— 改商户的券是商户的经营动作`;
}

/* ---------------- 列表 ---------------- */

const defaultQuery: CouponQuery = {
  page: 1,
  pageSize: 10,
  scene: undefined,
  status: undefined,
  platformOnly: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(fetchCoupons, defaultQuery);

/** el-table 插槽暴露的 row 是宽松行类型，按索引取回强类型行 */
function rowAt(index: number): CouponTemplate {
  return list.value[index];
}

/** 「只看平台券」是后端数字开关（platformOnly=1），界面用勾选框表达 */
const platformOnly = computed({
  get: () => query.platformOnly === 1,
  set: (value: boolean) => {
    query.platformOnly = value ? 1 : undefined;
    search();
  },
});

const isFiltered = computed(
  () => query.scene !== undefined || query.status !== undefined || query.platformOnly === 1,
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

/* ---------------- 商户归属（列表要把「谁的券」说清楚） ---------------- */

const merchants = ref<Merchant[]>([]);

function merchantLabel(id: number | null): string {
  if (id === null) {
    return '平台券 · 全场通用';
  }
  return merchants.value.find((item) => item.id === id)?.name ?? `商户 #${id}`;
}

async function loadMerchants(): Promise<void> {
  try {
    merchants.value = await fetchMerchantOptions();
  } catch {
    merchants.value = [];
  }
}

/* ---------------- 文案 ---------------- */

function sceneLabel(scene: CouponScene): string {
  return COUPON_SCENE_LABELS[scene] ?? scene;
}

function typeLabel(type: CouponType): string {
  return COUPON_TYPE_LABELS[type] ?? type;
}

/** 有效期两形态互斥，展示也要跟着分岔 */
function validityText(row: CouponTemplate): string {
  if (row.validDays) {
    return `领取后 ${row.validDays} 天内有效`;
  }
  if (row.startAt || row.endAt) {
    return `${formatDate(row.startAt)} ~ ${formatDate(row.endAt)}`;
  }
  return '—';
}

/* ---------------- 编辑弹窗 ---------------- */

type ValidMode = 'days' | 'range';

/**
 * 表单按「元」与「折」的口径收，提交时才换算成分。
 * 让运营在输入框里数零是错的来源：满减 5 元写成 500 分这种心算迟早要出事故。
 */
interface CouponForm {
  id: number | null;
  name: string;
  type: CouponType;
  /** 元：满减的减免金额 */
  amountYuan: number | undefined;
  /** 元：使用门槛，0 = 无门槛 */
  thresholdYuan: number | undefined;
  /** 折扣率百分数（80 = 打 8 折），与后端同口径，不做「折」的换算 */
  discountRate: number | undefined;
  /** 元：折扣券最多抵扣；undefined 表示不限 */
  maxDiscountYuan: number | undefined;
  scene: CouponScene;
  validMode: ValidMode;
  validDays: number | undefined;
  /** YYYY-MM-DD 区间；后端只认到日 */
  range: [string, string] | null;
  totalCount: number | undefined;
  perLimit: number | undefined;
  description: string;
  status: CouponTemplateStatus;
}

function emptyForm(): CouponForm {
  return {
    id: null,
    name: '',
    type: 'amount',
    amountYuan: undefined,
    thresholdYuan: undefined,
    discountRate: undefined,
    maxDiscountYuan: undefined,
    scene: 'normal',
    // 默认相对有效期：固定区间要求运营先想清楚活动档期，反而是少数派
    validMode: 'days',
    validDays: 7,
    range: null,
    totalCount: 0,
    perLimit: 1,
    description: '',
    // 新建默认下架：平台券是全场通用的，配错一次影响的是所有商户的顾客
    status: 0,
  };
}

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<CouponForm>(emptyForm());

const isCreate = computed(() => form.id === null);

/* 跨字段规则镜像后端 assertTemplateShape：DTO 装饰器表达不了「二选一」与「金额 < 门槛」 */

function amountError(): string {
  const amount = form.amountYuan;
  if (amount === undefined || amount <= 0) {
    return '满减金额要大于 0';
  }
  if (amount > MAX_AMOUNT_YUAN) {
    return `满减金额最大 ${MAX_AMOUNT_YUAN} 元`;
  }
  const threshold = form.thresholdYuan ?? 0;
  if (threshold > 0 && amount >= threshold) {
    return '满减金额必须小于门槛，否则会算出负应付';
  }
  return '';
}

function discountError(): string {
  const rate = form.discountRate;
  if (rate === undefined || !Number.isInteger(rate) || rate < 1 || rate > 99) {
    return '折扣率要取 1 ~ 99 的整数（80 表示打 8 折）';
  }
  return '';
}

function maxDiscountError(): string {
  const cap = form.maxDiscountYuan;
  if (cap === undefined) {
    return '';
  }
  if (cap <= 0) {
    return '最多抵扣要么不填（表示不限），要么大于 0';
  }
  if (cap > MAX_DISCOUNT_CAP_YUAN) {
    return `单张券最多抵扣封顶 ${MAX_DISCOUNT_CAP_YUAN} 元，再高服务端会截断`;
  }
  return '';
}

function validityError(): string {
  if (form.validMode === 'days') {
    const days = form.validDays;
    if (days === undefined || !Number.isInteger(days) || days < 1 || days > 3650) {
      return '领取后的有效天数要取 1 ~ 3650 的整数';
    }
    return '';
  }
  const [start, end] = form.range ?? [];
  if (!start || !end) {
    return '固定有效期要把开始与结束日期都选上';
  }
  if (new Date(start) >= new Date(end)) {
    return '有效期结束必须晚于开始';
  }
  return '';
}

/** 限领与发行量的整数区间，与后端 DTO 的 @Min / @Max 同值 */
function intRangeError(value: number | undefined, min: number, max: number, label: string): string {
  if (value === undefined || !Number.isInteger(value) || value < min || value > max) {
    return `${label}要取 ${min} ~ ${max} 的整数`;
  }
  return '';
}

/** 后端对发行总量只有「非负整数」这一条，0 是不限量而不是「发 0 张」 */
function totalCountError(): string {
  const value = form.totalCount;
  if (value === undefined || !Number.isInteger(value) || value < 0) {
    return '发行总量要取不小于 0 的整数，0 表示不限量';
  }
  return '';
}

const rules = computed<FormRules<CouponForm>>(() => ({
  name: [
    { required: true, message: '请输入券名', trigger: 'blur' },
    { max: 64, message: '券名最长 64 个字符', trigger: 'blur' },
  ],
  // required 与跨字段校验各一条：required 负责「没填」的中文文案，
  // 交给 el-form-item 的 required 属性会退化成组件默认提示（可能是英文）
  amountYuan:
    form.type === 'amount'
      ? [
          { required: true, message: '请输入满减金额', trigger: 'change' },
          { validator: (_rule, _value, callback) => fail(callback, amountError()), trigger: 'change' },
        ]
      : [],
  discountRate:
    form.type === 'discount'
      ? [
          { required: true, message: '请输入折扣率', trigger: 'change' },
          { validator: (_rule, _value, callback) => fail(callback, discountError()), trigger: 'change' },
        ]
      : [],
  maxDiscountYuan:
    form.type === 'discount'
      ? [{ validator: (_rule, _value, callback) => fail(callback, maxDiscountError()), trigger: 'change' }]
      : [],
  thresholdYuan: [
    {
      // 门槛与满减是同一条规则的两侧，报错挂在门槛上也得说清
      validator: (_rule, _value, callback) =>
        fail(callback, form.type === 'amount' ? amountError() : ''),
      trigger: 'change',
    },
  ],
  validDays:
    form.validMode === 'days'
      ? [
          { required: true, message: '请输入领取后的有效天数', trigger: 'change' },
          { validator: (_rule, _value, callback) => fail(callback, validityError()), trigger: 'change' },
        ]
      : [],
  range:
    form.validMode === 'range'
      ? [
          { required: true, message: '请选择有效期的起止日期', trigger: 'change' },
          { validator: (_rule, _value, callback) => fail(callback, validityError()), trigger: 'change' },
        ]
      : [],
  totalCount: [
    { validator: (_rule, _value, callback) => fail(callback, totalCountError()), trigger: 'change' },
  ],
  perLimit: [
    {
      validator: (_rule, _value, callback) =>
        fail(callback, intRangeError(form.perLimit, 1, 20, '每人限领')),
      trigger: 'change',
    },
  ],
}));

function fail(callback: (error?: string | Error) => void, message: string): void {
  if (message) {
    callback(new Error(message));
    return;
  }
  callback();
}

function openCreate(): void {
  Object.assign(form, emptyForm());
  dialogVisible.value = true;
}

function openEdit(row: CouponTemplate): void {
  const start = row.startAt ? formatDate(row.startAt) : '';
  const end = row.endAt ? formatDate(row.endAt) : '';
  // 显式标注成 CouponForm：回填时后端给的 Date 字符串要折算回界面口径（元 / 天 / 区间）
  const next: CouponForm = {
    id: row.id,
    name: row.name,
    type: row.type,
    amountYuan: row.type === 'amount' ? fenToYuanNumber(row.value) : undefined,
    discountRate: row.type === 'discount' ? row.value : undefined,
    thresholdYuan: fenToYuanNumber(row.threshold),
    maxDiscountYuan: row.maxDiscount === null ? undefined : fenToYuanNumber(row.maxDiscount),
    scene: row.scene,
    validMode: row.validDays ? 'days' : 'range',
    validDays: row.validDays ?? undefined,
    range: start && end ? [start, end] : null,
    totalCount: row.totalCount,
    perLimit: row.perLimit,
    description: row.description ?? '',
    status: row.status,
  };
  Object.assign(form, next);
  dialogVisible.value = true;
}

/**
 * 元 → 分，并把「二选一」里没被选中的那半边整个不带过去。
 * 两边同时提交会被后端按「有效期只能填一种」拒掉。
 */
function buildPayload(): UpsertCouponPayload {
  const isDiscount = form.type === 'discount';
  const payload: UpsertCouponPayload = {
    name: form.name.trim(),
    type: form.type,
    value: isDiscount ? Math.round(form.discountRate ?? 0) : yuanToFen(form.amountYuan ?? 0),
    threshold: yuanToFen(form.thresholdYuan ?? 0),
    scene: form.scene,
    totalCount: form.totalCount ?? 0,
    perLimit: form.perLimit ?? 1,
    description: form.description.trim() || undefined,
    status: form.status,
  };
  // maxDiscount 只对折扣券有意义，服务端也会把满减券的它清成 null，这里同样不传
  if (isDiscount && form.maxDiscountYuan !== undefined) {
    payload.maxDiscount = yuanToFen(form.maxDiscountYuan);
  }
  if (form.validMode === 'days') {
    payload.validDays = Math.round(form.validDays ?? 0);
  } else {
    payload.startAt = form.range?.[0];
    payload.endAt = form.range?.[1];
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
      ElMessage.success('平台券已创建；默认是下架状态，确认无误后在列表里上架');
    } else {
      // PUT 是整条覆盖，所以编辑必须带着全部字段提交
      await updateCoupon(form.id, payload);
      ElMessage.success('平台券已更新');
    }
    dialogVisible.value = false;
    await load();
  } catch {
    // 400 的具体原因（有效期填重了、金额不小于门槛）由后端给，请求层已弹出；弹窗留着让人改
  } finally {
    saving.value = false;
  }
}

/* ---------------- 上下架 / 删除 ---------------- */

async function handleStatusChange(row: CouponTemplate, enabled: boolean): Promise<void> {
  try {
    await updateCouponStatus(row.id, enabled ? 1 : 0);
    row.status = enabled ? 1 : 0;
    ElMessage.success(enabled ? '券已上架' : '券已下架；已发出的券不回收，那是顾客资产');
  } catch {
    // 失败不改 row.status：开关回到原值，界面不会显示一个没落库的状态
  }
}

async function handleDelete(row: CouponTemplate): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.name}」吗？已有人领取过的券删不掉，那种情况请改为下架。`,
      '删除平台券',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  try {
    await removeCoupon(row.id);
  } catch {
    // 「已有 N 位顾客领取」这类拒绝由请求层弹出，这里只负责不谎报删除成功
    return;
  }
  ElMessage.success('平台券已删除');
  if (list.value.length === 1 && query.page > 1) {
    query.page -= 1;
  }
  await load();
}

/* ---------------- 发放记录抽屉 ---------------- */

const recordsVisible = ref(false);
const recordsLoading = ref(false);
const recordsSource = ref<CouponTemplate | null>(null);
const records = ref<IssuedCoupon[]>([]);
const recordsTotal = ref(0);
const recordsQuery = reactive({ page: 1, pageSize: 10 });

async function loadRecords(): Promise<void> {
  const source = recordsSource.value;
  if (!source) {
    return;
  }
  recordsLoading.value = true;
  try {
    const page = await fetchCouponRecords(source.id, { ...recordsQuery });
    records.value = page.list;
    recordsTotal.value = page.total;
  } finally {
    recordsLoading.value = false;
  }
}

function openRecords(row: CouponTemplate): void {
  recordsSource.value = row;
  recordsQuery.page = 1;
  recordsVisible.value = true;
  void loadRecords();
}

function handleRecordsPage(page: number): void {
  recordsQuery.page = page;
  void loadRecords();
}

function handleRecordsSize(size: number): void {
  recordsQuery.pageSize = size;
  recordsQuery.page = 1;
  void loadRecords();
}

function issuedStatusLabel(status: IssuedCouponStatus): string {
  return ISSUED_COUPON_STATUS_LABELS[status] ?? status;
}

onMounted(async () => {
  await Promise.all([load(), loadMerchants()]);
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="平台券管理"
      description="平台配的全场通用券（跨商户核销）。各商户自己的券在这里只能看：改券是商户的经营动作"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">
          新建平台券
        </el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
        <el-select
          v-model="query.scene"
          class="filters__field"
          placeholder="全部场景"
          clearable
          @change="search"
        >
          <el-option
            v-for="option in COUPON_SCENE_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-select
          v-model="query.status"
          class="filters__field"
          placeholder="全部状态"
          clearable
          @change="search"
        >
          <el-option
            v-for="option in COUPON_TEMPLATE_STATUS_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-checkbox v-model="platformOnly">只看平台券</el-checkbox>

        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="券" min-width="200">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ row.name }}</span>
              <span class="cell-stack__sub">{{ merchantLabel(row.merchantId) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="券面" width="150">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main num">{{ row.faceValue }}</span>
              <span class="cell-stack__sub">{{ row.thresholdText }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ typeLabel(row.type as CouponType) }}</template>
        </el-table-column>

        <el-table-column label="发放场景" min-width="170">
          <template #default="{ row }">
            <span>{{ sceneLabel(row.scene as CouponScene) }}</span>
            <!-- 自动发放的券不进领券中心，不写出来运营会以为券配坏了顾客领不到 -->
            <p v-if="row.scene !== 'normal'" class="cell-note">自动发放，不出现在领券中心</p>
          </template>
        </el-table-column>

        <el-table-column label="有效期" width="190">
          <template #default="{ $index }">
            <span class="num muted">{{ validityText(rowAt($index)) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="已领 / 发行量" width="140" align="right">
          <template #default="{ row }">
            <div class="cell-stack cell-stack--right">
              <span class="cell-stack__main num">
                {{ row.receivedCount }}<template v-if="row.totalCount > 0"> / {{ row.totalCount }}</template>
                <template v-else> / 不限量</template>
              </span>
              <span class="cell-stack__sub">
                {{ row.remain === null ? '不限量发放' : `剩余 ${row.remain} 张` }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="每人限领" width="100" align="center">
          <template #default="{ row }">
            <span class="num">{{ row.perLimit }} 张</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row, $index }">
            <span class="lock-wrap" :title="writable(rowAt($index)) ? undefined : lockReason(rowAt($index))">
              <el-switch
                :model-value="row.status === 1"
                :disabled="!writable(rowAt($index))"
                @change="(value: string | number | boolean) => handleStatusChange(rowAt($index), Boolean(value))"
              />
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <span class="lock-wrap" :title="writable(rowAt($index)) ? undefined : lockReason(rowAt($index))">
                <el-button link type="primary" :icon="Edit" :disabled="!writable(rowAt($index))" @click="openEdit(rowAt($index))">
                  编辑
                </el-button>
                <el-button link type="primary" :disabled="!writable(rowAt($index))" @click="openRecords(rowAt($index))">
                  发放记录
                </el-button>
                <el-button link type="danger" :icon="Delete" :disabled="!writable(rowAt($index))" @click="handleDelete(rowAt($index))">
                  删除
                </el-button>
              </span>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty
            :filtered="isFiltered"
            hint="平台券是全场通用券：新建一张满减券，勾选上架后所有商户的顾客都能在领券中心领到"
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

    <el-dialog
      v-model="dialogVisible"
      :title="isCreate ? '新建平台券' : '编辑平台券'"
      width="640px"
      :close-on-click-modal="false"
      @opened="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
        <el-form-item label="券名" prop="name">
          <el-input v-model="form.name" maxlength="64" show-word-limit placeholder="顾客在券包看到的名字，如「全场满 30 减 5」" />
        </el-form-item>

        <el-form-item label="券类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio v-for="option in COUPON_TYPE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="form.type === 'amount'">
          <el-form-item label="满减金额" prop="amountYuan">
            <el-input-number v-model="form.amountYuan" :precision="2" :min="0" :step="1" controls-position="right" />
            <span class="unit">元</span>
            <p class="form-hint">最多 {{ MAX_AMOUNT_YUAN }} 元；这是券的实际抵扣额，必须小于门槛。</p>
          </el-form-item>
          <el-form-item label="使用门槛" prop="thresholdYuan">
            <el-input-number v-model="form.thresholdYuan" :precision="2" :min="0" :step="5" controls-position="right" />
            <span class="unit">元</span>
            <p class="form-hint">填 0 表示全场通用（无门槛）。</p>
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="折扣率" prop="discountRate">
            <el-input-number v-model="form.discountRate" :precision="0" :min="1" :max="99" controls-position="right" />
            <span class="unit">%</span>
            <p class="form-hint">按折扣率百分数填：80 就是打 8 折，1 ~ 99。</p>
          </el-form-item>
          <el-form-item label="最多抵扣" prop="maxDiscountYuan">
            <el-input-number v-model="form.maxDiscountYuan" :precision="2" :min="0" :step="1" controls-position="right" />
            <span class="unit">元</span>
            <p class="form-hint">不填表示不限。折扣券没有抵扣上限时，大额订单会被抵掉一大截，建议配上。</p>
          </el-form-item>
        </template>

        <el-form-item label="发放场景" prop="scene">
          <el-select v-model="form.scene">
            <el-option
              v-for="option in COUPON_SCENE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <p v-if="form.scene !== 'normal'" class="form-hint">
            这类券由系统在满足条件时自动发放，不会出现在领券中心。
          </p>
          <p v-else class="form-hint">顾客在小程序「领券中心」自取。</p>
        </el-form-item>

        <el-form-item label="有效期">
          <el-radio-group v-model="form.validMode">
            <el-radio value="days">领取后 N 天</el-radio>
            <el-radio value="range">固定区间</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="form.validMode === 'days'" label="有效天数" prop="validDays">
          <el-input-number v-model="form.validDays" :precision="0" :min="1" :max="3650" controls-position="right" />
          <span class="unit">天</span>
          <p class="form-hint">从领取当天起算，给到当天 23:59。</p>
        </el-form-item>

        <el-form-item v-else label="起止日期" prop="range">
          <el-date-picker
            v-model="form.range"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
          />
          <p class="form-hint">固定区间按日生效，结束日当天 23:59 失效；两种有效期只能填一种。</p>
        </el-form-item>

        <el-form-item label="发行总量" prop="totalCount">
          <el-input-number v-model="form.totalCount" :precision="0" :min="0" :step="100" controls-position="right" />
          <span class="unit">张</span>
          <p class="form-hint">填 0 表示不限量。</p>
        </el-form-item>

        <el-form-item label="每人限领" prop="perLimit">
          <el-input-number v-model="form.perLimit" :precision="0" :min="1" :max="20" controls-position="right" />
          <span class="unit">张</span>
        </el-form-item>

        <el-form-item label="使用说明">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            maxlength="255"
            show-word-limit
            placeholder="选填，顾客点券详情时看到"
          />
        </el-form-item>

        <el-form-item label="上架">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
          <span class="unit">上架后平台券对全部商户的顾客可见</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="recordsVisible"
      :title="`发放记录 · ${recordsSource?.name ?? ''}`"
      size="680px"
    >
      <p class="drawer-note">
        记录里是**发放瞬间的券面快照**：模板后来改了，顾客手里那张券的抵扣不会跟着变。
        后端不把顾客身份带到这张表里，所以这里只有券与核销状态，没有手机号。
      </p>

      <el-table v-loading="recordsLoading" :data="records" row-key="id" size="small">
        <el-table-column label="券" min-width="150">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ row.name }}</span>
              <span class="cell-stack__sub num">持有券 #{{ row.id }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="券面" width="110">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="num">{{ row.faceValue }}</span>
              <span class="cell-stack__sub">{{ row.thresholdText }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              :type="ISSUED_COUPON_STATUS_TAG_TYPES[row.status as IssuedCouponStatus]"
              effect="light"
              size="small"
              round
            >
              {{ issuedStatusLabel(row.status as IssuedCouponStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="领取时间" width="140">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.receivedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="失效时间" width="140">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.expireAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="核销时间" width="140">
          <template #default="{ row }">
            <span class="num muted">{{ row.usedAt ? formatDateTime(row.usedAt) : '未核销' }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <TableEmpty title="这张券还没有发放记录" hint="上架后顾客在领券中心领取，或系统按场景自动发放时才会产生" />
        </template>
      </el-table>

      <TablePagination
        :total="recordsTotal"
        :page="recordsQuery.page"
        :page-size="recordsQuery.pageSize"
        @page-change="handleRecordsPage"
        @size-change="handleRecordsSize"
      />
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.lock-wrap {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.cell-stack--right {
  align-items: flex-end;
}

/* 单位跟在数字框后面：金额一律以「元」录入，提交时才换算成分 */
.unit {
  margin-left: 8px;
  font-size: 12.5px;
  color: var(--text-placeholder);
}

.drawer-note {
  margin: 0 0 var(--space-4);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background-color: var(--neutral-50);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>
