<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  createDishCategory,
  fetchDishCategories,
  removeDishCategory,
  updateDishCategory,
} from '../../api/dish-category';
import { fetchMerchantOptions } from '../../api/merchant';
import { fetchStores } from '../../api/store';
import PageHeader from '../../components/PageHeader.vue';
import StatusTag from '../../components/StatusTag.vue';
import TableEmpty from '../../components/TableEmpty.vue';
import TablePagination from '../../components/TablePagination.vue';
import { useListQuery } from '../../hooks/useListQuery';
import { useSession } from '../../session';
import { COMMON_STATUS_OPTIONS, CommonStatus, Permission } from '../../types/enums';
import type { DishCategory, DishCategoryQuery } from '../../types/dish-category';
import type { Merchant } from '../../types/merchant';
import type { Store } from '../../types/store';
import { formatDateTime } from '../../utils/format';

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

/** 平台管理员可跨租户查看，因此需要显式选择商户；其它角色由服务端按 Token 限定 */
const isPlatformAdmin = computed(() => session.isPlatformAdmin);

const canCreate = computed(
  () => !props.readonly && session.hasPermission(Permission.CATEGORY_CREATE),
);
const canUpdate = computed(
  () => !props.readonly && session.hasPermission(Permission.CATEGORY_UPDATE),
);
const canDelete = computed(
  () => !props.readonly && session.hasPermission(Permission.CATEGORY_DELETE),
);

/* ---------------- 门店下拉 ---------------- */

const storeOptions = ref<Store[]>([]);

/** 门店绑定角色（店长）永远只看本店，不给选 */
const boundStoreId = computed(() => session.profile?.storeId ?? null);
const showStoreFilter = computed(
  () => !props.readonly && boundStoreId.value === null && session.hasPermission(Permission.STORE_READ),
);

async function loadStoreOptions(): Promise<void> {
  if (!showStoreFilter.value && boundStoreId.value === null) {
    return;
  }
  try {
    const page = await fetchStores({ page: 1, pageSize: 100, merchantId: query.merchantId });
    storeOptions.value = page.list;
  } catch {
    storeOptions.value = [];
  }
}

function storeName(id: number): string {
  return storeOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

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

const defaultQuery: DishCategoryQuery = {
  page: 1,
  pageSize: 10,
  merchantId: props.merchantId,
  storeId: boundStoreId.value ?? undefined,
  keyword: '',
  status: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(
  fetchDishCategories,
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
function rowAt(index: number): DishCategory {
  return list.value[index];
}

const isFiltered = computed(
  () =>
    Boolean(query.keyword) ||
    query.status !== undefined ||
    query.merchantId !== undefined ||
    query.storeId !== undefined,
);

/** 切换商户筛选后回到第 1 页重新查询，门店下拉范围也要跟着换 */
watch(
  () => query.merchantId,
  async () => {
    query.storeId = boundStoreId.value ?? undefined;
    await loadStoreOptions();
    search();
  },
);

/** 切换门店后只看「通用 + 该店专属」 */
watch(
  () => query.storeId,
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

interface CategoryForm {
  id: number | null;
  merchantId: number | undefined;
  name: string;
  /** 归属门店：留空 = 全商户通用。只在新增时定，改归属会牵连已有菜品的可见性 */
  storeId: number | undefined;
  sort: number;
  status: CommonStatus;
}

function createEmptyForm(): CategoryForm {
  return {
    id: null,
    merchantId: undefined,
    name: '',
    storeId: undefined,
    sort: 0,
    status: CommonStatus.ENABLED,
  };
}

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<CategoryForm>(createEmptyForm());

const rules = computed<FormRules<CategoryForm>>(() => ({
  merchantId: isPlatformAdmin.value && !props.embedded
    ? [{ required: true, message: '请选择所属商户', trigger: 'change' }]
    : [],
  name: [
    { required: true, message: '请输入分类名称', trigger: 'blur' },
    { max: 32, message: '分类名称最长 32 个字符', trigger: 'blur' },
  ],
  sort: [{ required: true, message: '请输入排序值', trigger: 'change' }],
}));

const dialogTitle = computed(() => (form.id === null ? '新增分类' : '编辑分类'));

function handleDialogOpened(): void {
  formRef.value?.clearValidate();
}

function openCreate(): void {
  Object.assign(form, createEmptyForm());
  // 平台管理员在筛选栏已选商户时默认带入，减少重复选择
  form.merchantId = query.merchantId;
  form.storeId = query.storeId ?? boundStoreId.value ?? undefined;
  dialogVisible.value = true;
}

function openEdit(row: DishCategory): void {
  Object.assign(form, {
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    storeId: row.storeId ?? undefined,
    sort: row.sort,
    status: row.status,
  });
  dialogVisible.value = true;
}

async function handleSave(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  saving.value = true;
  try {
    if (form.id === null) {
      await createDishCategory({
        merchantId: isPlatformAdmin.value ? form.merchantId : undefined,
        name: form.name.trim(),
        storeId: form.storeId,
        sort: form.sort,
        status: form.status,
      });
      ElMessage.success('分类已创建');
    } else {
      await updateDishCategory(form.id, {
        name: form.name.trim(),
        sort: form.sort,
        status: form.status,
      });
      ElMessage.success('分类已更新');
    }

    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

/* ---------------- 状态切换 / 删除 ---------------- */

async function handleStatusChange(row: DishCategory, next: boolean): Promise<void> {
  const status = next ? CommonStatus.ENABLED : CommonStatus.DISABLED;
  try {
    await updateDishCategory(row.id, { status });
    row.status = status;
    ElMessage.success(next ? '分类已启用' : '分类已禁用');
  } catch {
    // 失败时保持原状态
  }
}

async function handleDelete(row: DishCategory): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除分类「${row.name}」吗？分类下若仍有菜品，后端会拒绝删除。`,
      '删除分类',
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

  await removeDishCategory(row.id);
  ElMessage.success('分类已删除');

  if (list.value.length === 1 && query.page > 1) {
    query.page -= 1;
  }
  await load();
}

onMounted(async () => {
  await Promise.all([loadMerchantOptions(), loadStoreOptions()]);
  await load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      v-if="!embedded"
      title="菜品分类"
      description="菜单的一级分组，用于在小程序端组织菜品结构"
    >
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">
          新增分类
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
          placeholder="搜索分类名称"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />
        <el-select
          v-if="showStoreFilter"
          v-model="query.storeId"
          class="filters__field"
          placeholder="全部门店（含通用分类）"
          clearable
          filterable
        >
          <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>

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
        <el-table-column prop="name" label="分类名称" min-width="180" />

        <el-table-column v-if="isPlatformAdmin && !embedded" label="所属商户" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ merchantName(row.merchantId) }}
          </template>
        </el-table-column>

        <el-table-column label="归属" width="140">
          <template #default="{ row }">
            <el-tag v-if="row.storeId === null" size="small" type="info" effect="plain" round>
              全商户通用
            </el-tag>
            <span v-else>{{ storeName(row.storeId) }}专属</span>
          </template>
        </el-table-column>

        <el-table-column label="排序" width="100" align="center">
          <template #default="{ row }">
            <span class="num muted">{{ row.sort }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="120" align="center">
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

        <el-table-column label="创建时间" width="180">
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
      width="480px"
      :close-on-click-modal="false"
      @opened="handleDialogOpened"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="82px">
        <el-form-item v-if="isPlatformAdmin && form.id === null" label="所属商户" prop="merchantId">
          <el-select v-model="form.merchantId" placeholder="请选择商户" filterable style="width: 100%">
            <el-option v-for="item in merchantOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <p class="form-hint">平台管理员需指定分类归属的商户，创建后不可跨商户迁移。</p>
        </el-form-item>

        <el-form-item label="分类名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：热菜" maxlength="32" show-word-limit />
        </el-form-item>

        <el-form-item v-if="form.id === null && showStoreFilter" label="归属门店">
          <el-select v-model="form.storeId" placeholder="全商户通用" clearable filterable style="width: 100%">
            <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <p class="form-hint">留空表示全商户通用；选定后这是该店专属分类，别的店看不到也引用不了。</p>
        </el-form-item>

        <el-form-item label="排序" prop="sort">
          <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" />
          <p class="form-hint">数值越小越靠前。</p>
        </el-form-item>

        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="CommonStatus.ENABLED">启用</el-radio>
            <el-radio :value="CommonStatus.DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
