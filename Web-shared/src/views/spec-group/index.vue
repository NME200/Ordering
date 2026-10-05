<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Delete, Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { fetchMerchantOptions } from '../../api/merchant';
import {
  createSpecGroup,
  fetchSpecGroups,
  removeSpecGroup,
  updateSpecGroup,
} from '../../api/spec-group';
import PageHeader from '../../components/PageHeader.vue';
import StatusTag from '../../components/StatusTag.vue';
import TableEmpty from '../../components/TableEmpty.vue';
import TablePagination from '../../components/TablePagination.vue';
import { useListQuery } from '../../hooks/useListQuery';
import { useSession } from '../../session';
import {
  COMMON_STATUS_OPTIONS,
  CommonStatus,
  Permission,
  SPEC_TYPE_LABELS,
  SPEC_TYPE_OPTIONS,
  SpecType,
} from '../../types/enums';
import type { Merchant } from '../../types/merchant';
import type { SpecGroup, SpecGroupQuery, SpecOptionItem } from '../../types/spec-group';
import { fenToYuanNumber, formatPriceDiff, formatDateTime, yuanToFen } from '../../utils/format';

const session = useSession();

/** 内嵌只读模式：供「商户详情」页作为标签页复用 */
const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    merchantId?: number;
    readonly?: boolean;
  }>(),
  { embedded: false, merchantId: undefined, readonly: false },
);

/** 平台管理员可跨租户查看，因此需要显式选择商户 */
const isPlatformAdmin = computed(() => session.isPlatformAdmin);

const canCreate = computed(() => !props.readonly && session.hasPermission(Permission.SPEC_CREATE));
const canUpdate = computed(() => !props.readonly && session.hasPermission(Permission.SPEC_UPDATE));
const canDelete = computed(() => !props.readonly && session.hasPermission(Permission.SPEC_DELETE));

/* ---------------- 商户下拉（仅平台管理员需要） ---------------- */

const merchantOptions = ref<Merchant[]>([]);

function merchantName(id: number): string {
  return merchantOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

async function loadMerchantOptions(): Promise<void> {
  // 内嵌在商户详情里时商户已固定，不需要下拉选项
  if (!isPlatformAdmin.value || props.embedded) {
    return;
  }
  try {
    merchantOptions.value = await fetchMerchantOptions();
  } catch {
    merchantOptions.value = [];
  }
}

/* ---------------- 列表 ---------------- */

const defaultQuery: SpecGroupQuery = {
  page: 1,
  pageSize: 10,
  merchantId: props.merchantId,
  keyword: '',
  status: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(
  fetchSpecGroups,
  defaultQuery,
);

/** 商户详情页切换商户时同步范围 */
watch(
  () => props.merchantId,
  (merchantId) => {
    if (merchantId === undefined) {
      return;
    }
    query.merchantId = merchantId;
    search();
  },
);

/** el-table 插槽的 row 为宽松类型，按索引取回强类型行 */
function rowAt(index: number): SpecGroup {
  return list.value[index];
}

const isFiltered = computed(
  () => Boolean(query.keyword) || query.status !== undefined || query.merchantId !== undefined,
);

/** 切换商户筛选后回到第 1 页重新查询 */
watch(
  () => query.merchantId,
  () => {
    search();
  },
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

/* ---------------- 新增 / 编辑 ---------------- */

/**
 * 规格项价格增量的取值范围（元）。
 * 与后端 SpecOptionItemDto 的 PRICE_DIFF_MIN/MAX（±100000 分）保持一致 ——
 * 不设下限曾让「0 元菜 + 负增量」拼出一张负金额订单。
 */
const PRICE_DIFF_YUAN_LIMIT = 1000;

/** 编辑期的规格项：价格以「元」录入，提交时转回「分」 */
interface OptionDraft {
  id?: number;
  name: string;
  priceDiffYuan: number | undefined;
  sort: number | undefined;
  status: CommonStatus;
}

interface SpecGroupForm {
  id: number | null;
  merchantId: number | undefined;
  name: string;
  type: SpecType;
  isRequired: boolean;
  sort: number;
  status: CommonStatus;
  options: OptionDraft[];
}

function createOptionDraft(): OptionDraft {
  return { name: '', priceDiffYuan: 0, sort: 0, status: CommonStatus.ENABLED };
}

function createEmptyForm(): SpecGroupForm {
  return {
    id: null,
    merchantId: undefined,
    name: '',
    type: SpecType.SINGLE,
    isRequired: false,
    sort: 0,
    status: CommonStatus.ENABLED,
    options: [createOptionDraft(), createOptionDraft()],
  };
}

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<SpecGroupForm>(createEmptyForm());

const rules = computed<FormRules<SpecGroupForm>>(() => ({
  merchantId: isPlatformAdmin.value && !props.embedded
    ? [{ required: true, message: '请选择所属商户', trigger: 'change' }]
    : [],
  name: [
    { required: true, message: '请输入规格组名称', trigger: 'blur' },
    { max: 32, message: '规格组名称最长 32 个字符', trigger: 'blur' },
  ],
  type: [{ required: true, message: '请选择选购方式', trigger: 'change' }],
}));

const dialogTitle = computed(() => (form.id === null ? '新增规格组' : '编辑规格组'));

const typeHint = computed(() =>
  form.type === SpecType.SINGLE
    ? '单选：同组内顾客只能选一项，例如「杯型：中杯 / 大杯」。'
    : '多选：同组内顾客可选多项，例如「加料：珍珠 / 椰果」。',
);

function handleDialogOpened(): void {
  formRef.value?.clearValidate();
}

function addOption(): void {
  form.options.push(createOptionDraft());
}

function removeOption(index: number): void {
  if (form.options.length <= 1) {
    ElMessage.warning('规格组至少需要保留 1 个规格项');
    return;
  }
  form.options.splice(index, 1);
}

function openCreate(): void {
  Object.assign(form, createEmptyForm());
  form.merchantId = query.merchantId;
  dialogVisible.value = true;
}

function openEdit(row: SpecGroup): void {
  Object.assign(form, {
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    type: row.type,
    isRequired: row.isRequired,
    sort: row.sort,
    status: row.status,
    options: row.options.map((option) => ({
      id: option.id,
      name: option.name,
      priceDiffYuan: fenToYuanNumber(option.priceDiff),
      sort: option.sort,
      status: option.status,
    })),
  });
  dialogVisible.value = true;
}

/** 规格项的前端校验：后端不做重名校验，这里挡住明显的误操作 */
function validateOptions(): boolean {
  if (form.options.length === 0) {
    ElMessage.warning('规格组至少需要 1 个规格项');
    return false;
  }
  if (form.options.some((option) => option.name.trim() === '')) {
    ElMessage.warning('请填写完整的规格项名称');
    return false;
  }
  const names = form.options.map((option) => option.name.trim());
  if (new Set(names).size !== names.length) {
    ElMessage.warning('同一规格组内的规格项名称不能重复');
    return false;
  }
  return true;
}

async function handleSave(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid || !validateOptions()) {
    return;
  }

  const options: SpecOptionItem[] = form.options.map((option) => ({
    id: option.id,
    name: option.name.trim(),
    priceDiff: yuanToFen(option.priceDiffYuan ?? 0),
    sort: option.sort ?? 0,
    status: option.status,
  }));

  saving.value = true;
  try {
    if (form.id === null) {
      await createSpecGroup({
        merchantId: isPlatformAdmin.value ? form.merchantId : undefined,
        name: form.name.trim(),
        type: form.type,
        isRequired: form.isRequired,
        sort: form.sort,
        status: form.status,
        options,
      });
      ElMessage.success('规格组已创建');
    } else {
      await updateSpecGroup(form.id, {
        name: form.name.trim(),
        type: form.type,
        isRequired: form.isRequired,
        sort: form.sort,
        status: form.status,
        options,
      });
      ElMessage.success('规格组已更新');
    }

    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

/* ---------------- 状态切换 / 删除 ---------------- */

async function handleStatusChange(row: SpecGroup, next: boolean): Promise<void> {
  const status = next ? CommonStatus.ENABLED : CommonStatus.DISABLED;
  try {
    await updateSpecGroup(row.id, { status });
    row.status = status;
    ElMessage.success(next ? '规格组已启用' : '规格组已禁用');
  } catch {
    // 失败时保持原状态
  }
}

async function handleDelete(row: SpecGroup): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除规格组「${row.name}」吗？若已被菜品引用，后端会拒绝删除。`,
      '删除规格组',
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

  await removeSpecGroup(row.id);
  ElMessage.success('规格组已删除');

  if (list.value.length === 1 && query.page > 1) {
    query.page -= 1;
  }
  await load();
}

onMounted(async () => {
  await loadMerchantOptions();
  await load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      v-if="!embedded"
      title="规格组"
      description="商户级共享的规格定义，可被多个菜品引用；组内规格项以「整体覆盖」方式维护"
    >
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">
          新增规格组
        </el-button>
      </template>
    </PageHeader>

    <section :class="embedded ? 'embedded-list' : 'panel panel--flush'">
      <div class="filters">
        <el-select
          v-if="isPlatformAdmin && !embedded"
          v-model="query.merchantId"
          class="filters__field"
          placeholder="全部商户"
          clearable
          filterable
        >
          <el-option v-for="item in merchantOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>

        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索规格组名称"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="query.status" class="filters__field" placeholder="全部状态" clearable>
          <el-option
            v-for="option in COMMON_STATUS_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="规格组" min-width="170">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ row.name }}</span>
              <span class="cell-stack__sub">{{ row.isRequired ? '必选' : '可选' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="isPlatformAdmin && !embedded" label="所属商户" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ merchantName(row.merchantId) }}
          </template>
        </el-table-column>

        <el-table-column label="选购方式" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              effect="plain"
              size="small"
              round
              :type="row.type === SpecType.SINGLE ? 'primary' : 'success'"
            >
              {{ row.typeLabel || SPEC_TYPE_LABELS[row.type as SpecType] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="规格项" min-width="300">
          <template #default="{ row }">
            <div class="option-tags">
              <el-tag
                v-for="option in row.options"
                :key="option.id"
                size="small"
                effect="plain"
                :type="option.status === CommonStatus.ENABLED ? 'primary' : 'info'"
              >
                {{ option.name }}
                <span v-if="option.priceDiff !== 0" class="num option-tags__diff">
                  {{ formatPriceDiff(option.priceDiff) }}
                </span>
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="排序" width="90" align="center">
          <template #default="{ row }">
            <span class="num muted">{{ row.sort }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row, $index }">
            <StatusTag v-if="readonly" kind="common" :value="row.status" />
            <el-switch
              v-else
              :model-value="row.status === CommonStatus.ENABLED"
              :disabled="!canUpdate"
              @change="(value: string | number | boolean) => handleStatusChange(rowAt($index), Boolean(value))"
            />
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column v-if="!readonly" label="操作" width="130" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button v-if="canUpdate" link type="primary" @click="openEdit(rowAt($index))">
                编辑
              </el-button>
              <el-button v-if="canDelete" link type="danger" @click="handleDelete(rowAt($index))">
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty :filtered="isFiltered" />
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
      :title="dialogTitle"
      width="680px"
      :close-on-click-modal="false"
      @opened="handleDialogOpened"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item v-if="isPlatformAdmin && form.id === null" label="所属商户" prop="merchantId">
          <el-select v-model="form.merchantId" placeholder="请选择商户" filterable style="width: 100%">
            <el-option v-for="item in merchantOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <p class="form-hint">平台管理员需指定规格组归属的商户，创建后不可跨商户迁移。</p>
        </el-form-item>

        <el-form-item label="规格组名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：杯型" maxlength="32" show-word-limit />
        </el-form-item>

        <el-form-item label="选购方式" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio v-for="option in SPEC_TYPE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </el-radio>
          </el-radio-group>
          <p class="form-hint">{{ typeHint }}</p>
        </el-form-item>

        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" />
        </el-form-item>

        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="CommonStatus.ENABLED">启用</el-radio>
            <el-radio :value="CommonStatus.DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="是否必选">
          <el-switch v-model="form.isRequired" />
          <span class="form-hint form-hint--inline">开启后，下单时必须从该组中选择</span>
        </el-form-item>

        <el-form-item label="规格项">
          <div class="options-editor">
            <div class="options-editor__head">
              <span class="options-editor__col-name">名称</span>
              <span class="options-editor__col-price">价格增量（元）</span>
              <span class="options-editor__col-sort">排序</span>
              <span class="options-editor__col-status">启用</span>
              <span class="options-editor__col-act" />
            </div>

            <div
              v-for="(option, index) in form.options"
              :key="index"
              class="options-editor__row"
            >
              <el-input
                v-model="option.name"
                class="options-editor__col-name"
                placeholder="例如：大杯"
                maxlength="32"
              />
              <el-input-number
                v-model="option.priceDiffYuan"
                class="options-editor__col-price"
                :precision="2"
                :step="0.5"
                :min="-PRICE_DIFF_YUAN_LIMIT"
                :max="PRICE_DIFF_YUAN_LIMIT"
                :controls="false"
                placeholder="0.00"
              />
              <el-input-number
                v-model="option.sort"
                class="options-editor__col-sort"
                :min="0"
                :max="9999"
                :controls="false"
                placeholder="0"
              />
              <el-switch
                v-model="option.status"
                class="options-editor__col-status"
                :active-value="CommonStatus.ENABLED"
                :inactive-value="CommonStatus.DISABLED"
              />
              <el-button
                class="options-editor__col-act"
                link
                type="danger"
                :icon="Delete"
                :disabled="form.options.length <= 1"
                @click="removeOption(index)"
              />
            </div>

            <el-button class="options-editor__add" link type="primary" :icon="Plus" @click="addOption">
              添加规格项
            </el-button>
            <p class="form-hint">
              价格增量为相对菜品基础价的差额，可为负（如「小杯 -2.00」）。保存后未提交的原有规格项会被移除。
            </p>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.option-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  &__diff {
    margin-left: 4px;
    opacity: 0.72;
  }
}

.form-hint--inline {
  margin-top: 0;
  margin-left: 10px;
}

/* ---------------- 规格项编辑器 ---------------- */
.options-editor {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--neutral-25);

  &__head,
  &__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 118px 74px 52px 32px;
    align-items: center;
    gap: 8px;
  }

  &__head {
    padding: 0 2px 8px;
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__row {
    padding: 4px 0;
  }

  &__col-status {
    justify-self: center;
  }

  &__col-act {
    justify-self: center;
    padding: 0;
  }

  &__add {
    margin-top: 6px;
  }
}
</style>
