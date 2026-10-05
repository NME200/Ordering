<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Picture, Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { fetchDishCategoryOptions } from '../../api/dish-category';
import { createDish, fetchDishes, removeDish, updateDish, updateDishStatus } from '../../api/dish';
import { fetchMerchantOptions } from '../../api/merchant';
import { fetchSpecGroupOptions } from '../../api/spec-group';
import { fetchStores } from '../../api/store';
import { resetStoreDish, upsertStoreDish } from '../../api/store-dish';
import PageHeader from '../../components/PageHeader.vue';
import StatusTag from '../../components/StatusTag.vue';
import TableEmpty from '../../components/TableEmpty.vue';
import TablePagination from '../../components/TablePagination.vue';
import { useListQuery } from '../../hooks/useListQuery';
import { useSession } from '../../session';
import { DishStatus, Permission } from '../../types/enums';
import type { DishCategory } from '../../types/dish-category';
import type { Dish, DishQuery } from '../../types/dish';
import type { Merchant } from '../../types/merchant';
import type { SpecGroup } from '../../types/spec-group';
import type { Store } from '../../types/store';
import type { UpsertStoreDishPayload } from '../../types/store-dish';
import { fenToYuan, fenToYuanNumber, orEmpty, yuanToFen } from '../../utils/format';

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

const canCreate = computed(() => !props.readonly && session.hasPermission(Permission.DISH_CREATE));
const canUpdate = computed(() => !props.readonly && session.hasPermission(Permission.DISH_UPDATE));
/** 编辑标准菜单只对商户层账号开放；门店绑定角色点了也会被后端拒，索性不出现这个按钮 */
const canEditStandard = computed(() => canUpdate.value && boundStoreId.value === null);
const canDelete = computed(() => !props.readonly && session.hasPermission(Permission.DISH_DELETE));
const canReadStores = computed(() => session.hasPermission(Permission.STORE_READ));

/**
 * 门店绑定角色（店长 / 收银员）的 Token 里带 storeId，他们的视角永远是本店；
 * 商户管理员与平台则可以主动选一家店看门店例外。
 */
const boundStoreId = computed(() => session.profile?.storeId ?? null);

/** 当前门店上下文：null 表示看的是商户标准菜单 */
const storeContext = computed<number | null>(() => query.storeId ?? boundStoreId.value);

/** 门店下拉：能读门店、且账号本身没有绑定门店时才出现（店长没得选） */
const showStoreFilter = computed(() => boundStoreId.value === null && canReadStores.value);

/** 门店价与会员价是资金口径，服务端同样拒门店账号提交，这里提前把输入框禁掉 */
const canEditStorePrice = computed(() => boundStoreId.value === null);

/* ---------------- 下拉数据 ---------------- */

/** 商户下拉（仅平台管理员需要） */
const merchantOptions = ref<Merchant[]>([]);
/** 列表筛选与表格展示用：随筛选栏的商户范围变化 */
const categoryOptions = ref<DishCategory[]>([]);
/** 弹窗内选择用：随表单所选商户变化 */
const formCategoryOptions = ref<DishCategory[]>([]);
const formSpecGroupOptions = ref<SpecGroup[]>([]);

function merchantName(id: number): string {
  return merchantOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

function categoryName(id: number): string {
  return categoryOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
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

/** 门店下拉（选店后才能看与改本店例外；范围由服务端按 Token 限定） */
const storeOptions = ref<Store[]>([]);

async function loadStoreOptions(): Promise<void> {
  if (!canReadStores.value) {
    return;
  }
  try {
    // 含已停用门店：停店之后仍要能查它的菜单与例外。
    // 门店绑定角色同样要拉一次 —— 后端会把范围收成他这一家店，用于显示门店名
    const page = await fetchStores({ page: 1, pageSize: 100, merchantId: query.merchantId });
    storeOptions.value = page.list;
  } catch {
    storeOptions.value = [];
  }
}

function storeName(id: number): string {
  return storeOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

/** 例外弹窗标题里的门店名 */
const storeContextName = computed(() =>
  storeContext.value === null ? '' : storeName(storeContext.value),
);

/** 加载表格筛选用的分类下拉（限定在筛选栏所选商户与门店范围内） */
async function loadTableCategoryOptions(): Promise<void> {
  try {
    categoryOptions.value = await fetchDishCategoryOptions(query.merchantId, query.storeId);
  } catch {
    categoryOptions.value = [];
  }
}

/**
 * 加载弹窗内可选的分类与规格组。
 * 必须与菜品同属一个商户，且分类要对**归属门店**可见（店专属分类只在该店可选）。
 */
async function loadFormOptions(merchantId?: number, storeId?: number): Promise<void> {
  const [categories, groups] = await Promise.allSettled([
    fetchDishCategoryOptions(merchantId, storeId),
    fetchSpecGroupOptions(merchantId),
  ]);
  formCategoryOptions.value = categories.status === 'fulfilled' ? categories.value : [];
  formSpecGroupOptions.value = groups.status === 'fulfilled' ? groups.value : [];
}

/* ---------------- 列表 ---------------- */

const defaultQuery: DishQuery = {
  page: 1,
  pageSize: 10,
  merchantId: props.merchantId,
  storeId: boundStoreId.value ?? undefined,
  categoryId: undefined,
  keyword: '',
  status: undefined,
  isRecommend: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(fetchDishes, defaultQuery);

/** el-table 插槽的 row 为宽松类型，按索引取回强类型行 */
function rowAt(index: number): Dish {
  return list.value[index];
}

const isFiltered = computed(
  () =>
    Boolean(query.keyword) ||
    query.merchantId !== undefined ||
    query.storeId !== undefined ||
    query.categoryId !== undefined ||
    query.status !== undefined ||
    query.isRecommend !== undefined,
);

/** 切换商户筛选后，门店与分类下拉都要跟着换，并清掉已失效的选择 */
watch(
  () => query.merchantId,
  async () => {
    query.categoryId = undefined;
    query.storeId = boundStoreId.value ?? undefined;
    await Promise.all([loadStoreOptions(), loadTableCategoryOptions()]);
    search();
  },
);

/** 切换门店后：分类要按该店范围重取（店专属分类），列表要带出本店有效值 */
watch(
  () => query.storeId,
  async () => {
    query.categoryId = undefined;
    await loadTableCategoryOptions();
    search();
  },
);

const recommendOptions = [
  { label: '仅推荐菜', value: true },
  { label: '仅非推荐菜', value: false },
];

/** 商户详情页切换商户时同步范围（分类下拉与列表由 query.merchantId 的 watcher 联动） */
watch(
  () => props.merchantId,
  (merchantId) => {
    if (merchantId === undefined) {
      return;
    }
    query.merchantId = merchantId;
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

interface DishForm {
  id: number | null;
  merchantId: number | undefined;
  categoryId: number | undefined;
  /** 归属门店：留空 = 全商户通用。只在新增时定，编辑接口不接受该字段 */
  storeId: number | undefined;
  name: string;
  description: string;
  imageUrl: string;
  /** 售价（元） */
  priceYuan: number | undefined;
  /** 会员价（元），留空表示不区分 */
  memberPriceYuan: number | undefined;
  unit: string;
  sort: number;
  status: DishStatus;
  isRecommend: boolean;
  specGroupIds: number[];
}

function createEmptyForm(): DishForm {
  return {
    id: null,
    merchantId: undefined,
    categoryId: undefined,
    storeId: undefined,
    name: '',
    description: '',
    imageUrl: '',
    priceYuan: undefined,
    memberPriceYuan: undefined,
    unit: '份',
    sort: 0,
    status: DishStatus.ON_SHELF,
    isRecommend: false,
    specGroupIds: [],
  };
}

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<DishForm>(createEmptyForm());

const rules = computed<FormRules<DishForm>>(() => ({
  merchantId: isPlatformAdmin.value && !props.embedded
    ? [{ required: true, message: '请选择所属商户', trigger: 'change' }]
    : [],
  categoryId: [{ required: true, message: '请选择所属分类', trigger: 'change' }],
  name: [
    { required: true, message: '请输入菜品名称', trigger: 'blur' },
    { max: 64, message: '菜品名称最长 64 个字符', trigger: 'blur' },
  ],
  description: [{ max: 255, message: '菜品描述最长 255 个字符', trigger: 'blur' }],
  imageUrl: [
    { max: 255, message: '图片地址最长 255 个字符', trigger: 'blur' },
    { type: 'url', message: '图片地址需为合法的 URL', trigger: 'blur' },
  ],
  priceYuan: [{ required: true, message: '请输入售价', trigger: 'change' }],
  unit: [{ max: 8, message: '计价单位最长 8 个字符', trigger: 'blur' }],
}));

const dialogTitle = computed(() => (form.id === null ? '新增菜品' : '编辑菜品'));

function handleDialogOpened(): void {
  formRef.value?.clearValidate();
}

/** 平台管理员换商户后，分类与规格组都必须重新加载（跨商户引用会被后端拒绝） */
watch(
  () => form.merchantId,
  async (merchantId, previous) => {
    if (!dialogVisible.value || merchantId === previous) {
      return;
    }
    form.categoryId = undefined;
    form.specGroupIds = [];
    await loadFormOptions(isPlatformAdmin.value ? merchantId : undefined, form.storeId);
  },
);

/** 换归属门店后重取分类：店专属分类只在该店可选，已选分类可能失效 */
watch(
  () => form.storeId,
  async (storeId, previous) => {
    if (!dialogVisible.value || storeId === previous) {
      return;
    }
    await loadFormOptions(isPlatformAdmin.value ? form.merchantId : undefined, storeId);
    if (form.categoryId && !formCategoryOptions.value.some((item) => item.id === form.categoryId)) {
      form.categoryId = undefined;
    }
  },
);

async function openCreate(): Promise<void> {
  Object.assign(form, createEmptyForm());
  form.merchantId = query.merchantId;
  form.categoryId = query.categoryId;
  // 正在看某家店的菜单时，新菜默认就是这家店的专属菜；看商户标准菜单时默认全商户通用
  form.storeId = query.storeId ?? undefined;
  dialogVisible.value = true;
  await loadFormOptions(isPlatformAdmin.value ? form.merchantId : undefined, form.storeId);
}

async function openEdit(row: Dish): Promise<void> {
  Object.assign(form, {
    id: row.id,
    merchantId: row.merchantId,
    categoryId: row.categoryId,
    storeId: row.storeId ?? undefined,
    name: row.name,
    description: row.description ?? '',
    imageUrl: row.imageUrl ?? '',
    priceYuan: fenToYuanNumber(row.price),
    memberPriceYuan: row.memberPrice === null ? undefined : fenToYuanNumber(row.memberPrice),
    unit: row.unit,
    sort: row.sort,
    status: row.status,
    isRecommend: row.isRecommend,
    specGroupIds: row.specGroups.map((group) => group.id),
  });
  dialogVisible.value = true;
  await loadFormOptions(isPlatformAdmin.value ? row.merchantId : undefined, row.storeId ?? undefined);
}

async function handleSave(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  const payload = {
    categoryId: form.categoryId as number,
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    imageUrl: form.imageUrl.trim() || undefined,
    price: yuanToFen(form.priceYuan ?? 0),
    memberPrice:
      form.memberPriceYuan === undefined || form.memberPriceYuan === null
        ? null
        : yuanToFen(form.memberPriceYuan),
    unit: form.unit.trim() || '份',
    sort: form.sort,
    status: form.status,
    isRecommend: form.isRecommend,
    specGroupIds: form.specGroupIds,
  };

  saving.value = true;
  try {
    if (form.id === null) {
      await createDish({
        ...payload,
        merchantId: isPlatformAdmin.value ? form.merchantId : undefined,
        storeId: form.storeId,
      });
      ElMessage.success('菜品已创建');
    } else {
      await updateDish(form.id, payload);
      ElMessage.success('菜品已更新');
    }

    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

/* ---------------- 上下架 / 删除 ---------------- */

async function handleStatusChange(row: Dish, next: boolean): Promise<void> {
  const status = next ? DishStatus.ON_SHELF : DishStatus.OFF_SHELF;
  try {
    await updateDishStatus(row.id, { status });
    row.status = status;
    row.statusLabel = status === DishStatus.ON_SHELF ? '已上架' : '已下架';
    ElMessage.success(next ? '菜品已上架' : '菜品已下架');
  } catch {
    // 失败时保持原状态
  }
}

async function handleDelete(row: Dish): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除菜品「${row.name}」吗？删除后会同时解除其规格组关联。`,
      '删除菜品',
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

  await removeDish(row.id);
  ElMessage.success('菜品已删除');

  if (list.value.length === 1 && query.page > 1) {
    query.page -= 1;
  }
  await load();
}

/* ---------------- 本店例外 ---------------- */

const overrideVisible = ref(false);
const overrideSaving = ref(false);
const overrideRow = ref<Dish | null>(null);
const overrideForm = reactive({
  saleStatus: DishStatus.ON_SHELF as DishStatus,
  soldOut: false,
  /** 门店价（元）；留空表示跟随标准价 */
  priceYuan: undefined as number | undefined,
  memberPriceYuan: undefined as number | undefined,
});

/** 行内开关绑的是例外**原始值**，没有例外时按「跟随标准」取默认 */
function storeSaleStatus(row: Dish): DishStatus {
  return row.storeOverride?.saleStatus ?? DishStatus.ON_SHELF;
}

function storeSoldOut(row: Dish): boolean {
  return row.storeOverride?.soldOut ?? false;
}

function openOverride(row: Dish): void {
  const override = row.storeOverride;
  overrideRow.value = row;
  overrideForm.saleStatus = override?.saleStatus ?? DishStatus.ON_SHELF;
  overrideForm.soldOut = override?.soldOut ?? false;
  overrideForm.priceYuan = override?.price == null ? undefined : fenToYuanNumber(override.price);
  overrideForm.memberPriceYuan =
    override?.memberPrice == null ? undefined : fenToYuanNumber(override.memberPrice);
  overrideVisible.value = true;
}

/**
 * 保存本店例外。
 *
 * 门店账号不提交价格字段 —— 服务端也会拒（403），这里提前不传是为了让按钮行为
 * 和界面显示一致，别让人点了才知道不行。
 */
async function saveOverride(): Promise<void> {
  const row = overrideRow.value;
  const storeId = storeContext.value;
  if (!row || storeId === null) {
    return;
  }

  const payload: UpsertStoreDishPayload = {
    saleStatus: overrideForm.saleStatus,
    soldOut: overrideForm.soldOut,
  };
  if (canEditStorePrice.value) {
    payload.price =
      overrideForm.priceYuan === undefined ? null : yuanToFen(overrideForm.priceYuan);
    payload.memberPrice =
      overrideForm.memberPriceYuan === undefined
        ? null
        : yuanToFen(overrideForm.memberPriceYuan);
  }

  overrideSaving.value = true;
  try {
    await upsertStoreDish(storeId, row.id, payload);
    ElMessage.success('本店设置已保存');
    overrideVisible.value = false;
    await load();
  } catch {
    // 失败原因已由请求层弹出
  } finally {
    overrideSaving.value = false;
  }
}

/** 删掉本店例外 = 恢复跟随标准菜单 */
async function clearOverride(row: Dish): Promise<void> {
  const storeId = storeContext.value;
  if (storeId === null) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定让「${row.name}」在本店恢复跟随标准菜单吗？门店价与停售设置会一并清除。`,
      '恢复跟随标准菜单',
      { type: 'warning', confirmButtonText: '确认恢复', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  try {
    await resetStoreDish(storeId, row.id);
    ElMessage.success('已恢复跟随标准菜单');
    await load();
  } catch {
    // 失败原因已由请求层弹出
  }
}

/** 弹窗里的「恢复跟随标准菜单」：先收弹窗再走同一个确认流程 */
function restoreStandard(): void {
  const row = overrideRow.value;
  overrideVisible.value = false;
  if (row) {
    void clearOverride(row);
  }
}

/** 行内开关的统一落点：只写本店例外，不动商户标准菜单 */
async function writeOverride(row: Dish, patch: UpsertStoreDishPayload): Promise<void> {
  const storeId = storeContext.value;
  if (storeId === null) {
    return;
  }
  try {
    await upsertStoreDish(storeId, row.id, patch);
    // 例外会同时影响 onSale / 有效价 / 标签，整表重取一次最省事也最不容易失真
    await load();
  } catch {
    // 失败原因已由请求层弹出
  }
}

function handleStoreSaleChange(row: Dish, next: boolean): Promise<void> {
  return writeOverride(row, { saleStatus: next ? DishStatus.ON_SHELF : DishStatus.OFF_SHELF });
}

function handleSoldOutChange(row: Dish, next: boolean): Promise<void> {
  return writeOverride(row, { soldOut: next });
}

onMounted(async () => {
  await Promise.all([loadMerchantOptions(), loadStoreOptions(), loadTableCategoryOptions()]);
  await load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      v-if="!embedded"
      title="菜品管理"
      description="菜单主体，金额以「分」存储、以「元」展示，可关联多个商户级规格组"
    >
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">
          新增菜品
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

        <el-select
          v-if="showStoreFilter"
          v-model="query.storeId"
          class="filters__field"
          placeholder="标准菜单（全部门店）"
          clearable
          filterable
        >
          <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>

        <el-select v-model="query.categoryId" class="filters__field" placeholder="全部分类" clearable>
          <el-option
            v-for="item in categoryOptions"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>

        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索菜品名称"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />

        <el-select v-model="query.status" class="filters__field" placeholder="全部状态" clearable>
          <el-option label="已上架" :value="DishStatus.ON_SHELF" />
          <el-option label="已下架" :value="DishStatus.OFF_SHELF" />
        </el-select>

        <el-select v-model="query.isRecommend" class="filters__field" placeholder="推荐筛选" clearable>
          <el-option
            v-for="option in recommendOptions"
            :key="String(option.value)"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="菜品" min-width="250">
          <template #default="{ row }">
            <div class="dish-cell">
              <el-image
                v-if="row.imageUrl"
                class="cell-thumb"
                :src="row.imageUrl"
                fit="cover"
                :preview-src-list="[row.imageUrl]"
                preview-teleported
              >
                <template #error>
                  <div class="cell-thumb cell-thumb--placeholder">
                    <el-icon><Picture /></el-icon>
                  </div>
                </template>
              </el-image>
              <span v-else class="cell-thumb cell-thumb--placeholder">
                <el-icon><Picture /></el-icon>
              </span>

              <div class="cell-stack">
                <span class="cell-stack__main">
                  {{ row.name }}
                  <el-tag v-if="row.isRecommend" class="dish-cell__flag" size="small" type="warning" effect="light" round>
                    推荐
                  </el-tag>
                  <!-- 商户层视角会列出各店的专属菜，标出归属免得被当成全商户可售 -->
                  <el-tag
                    v-if="row.storeId !== null && storeContext === null"
                    class="dish-cell__flag"
                    size="small"
                    type="info"
                    effect="plain"
                    round
                  >
                    {{ storeName(row.storeId) }}专属
                  </el-tag>
                </span>
                <span class="cell-stack__sub">{{ orEmpty(row.description) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="isPlatformAdmin && !embedded" label="所属商户" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ merchantName(row.merchantId) }}
          </template>
        </el-table-column>

        <el-table-column label="分类" width="120">
          <template #default="{ row }">
            {{ categoryName(row.categoryId) }}
          </template>
        </el-table-column>

        <el-table-column label="售价" width="150" align="right">
          <template #default="{ row }">
            <div class="cell-stack cell-stack--right">
              <span class="cell-stack__main num">¥ {{ fenToYuan(row.effectivePrice) }}</span>
              <span class="cell-stack__sub">
                / {{ row.unit }}
                <template v-if="row.effectivePrice !== row.price">
                  · 标准 ¥{{ fenToYuan(row.price) }}
                </template>
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="会员价" width="130" align="right">
          <template #default="{ row }">
            <span class="num" :class="{ 'empty-cell': row.effectiveMemberPrice === null }">
              {{
                row.effectiveMemberPrice === null
                  ? '—'
                  : `¥ ${fenToYuan(row.effectiveMemberPrice)}`
              }}
            </span>
            <p
              v-if="row.effectiveMemberPrice !== row.memberPrice"
              class="cell-note num"
            >
              标准 {{ row.memberPrice === null ? '无' : `¥ ${fenToYuan(row.memberPrice)}` }}
            </p>
          </template>
        </el-table-column>

        <el-table-column label="规格组" min-width="180">
          <template #default="{ row }">
            <div v-if="row.specGroups.length" class="option-tags">
              <el-tag v-for="group in row.specGroups" :key="group.id" size="small" effect="plain" round>
                {{ group.name }}
              </el-tag>
            </div>
            <span v-else class="empty-cell">未关联</span>
          </template>
        </el-table-column>

        <el-table-column label="销量" width="80" align="center">
          <template #default="{ row }">
            <span class="num muted">{{ row.soldCount }}</span>
          </template>
        </el-table-column>

        <el-table-column
          :label="storeContext === null ? '上架' : '商户层上架'"
          width="100"
          align="center"
        >
          <template #default="{ row, $index }">
            <!-- 选定了门店（或账号本身绑店）时这一列只是参照：改它会动到全商户所有门店 -->
            <StatusTag v-if="readonly || storeContext !== null" kind="dish" :value="row.status" />
            <el-switch
              v-else
              :model-value="row.status === DishStatus.ON_SHELF"
              :disabled="!canUpdate"
              @change="(value: string | number | boolean) => handleStatusChange(rowAt($index), Boolean(value))"
            />
          </template>
        </el-table-column>

        <el-table-column v-if="storeContext !== null" label="本店" width="190" align="center">
          <template #default="{ row, $index }">
            <div class="store-switches">
              <label class="store-switch">
                <span class="store-switch__label">在售</span>
                <el-switch
                  :model-value="storeSaleStatus(rowAt($index)) === DishStatus.ON_SHELF"
                  :disabled="!canUpdate"
                  @change="(value: string | number | boolean) => handleStoreSaleChange(rowAt($index), Boolean(value))"
                />
              </label>
              <label class="store-switch">
                <span class="store-switch__label">沽清</span>
                <el-switch
                  :model-value="storeSoldOut(rowAt($index))"
                  :disabled="!canUpdate"
                  @change="(value: string | number | boolean) => handleSoldOutChange(rowAt($index), Boolean(value))"
                />
              </label>
            </div>
            <p v-if="!row.onSale && row.status === DishStatus.ON_SHELF" class="cell-note">
              {{ row.soldOut ? '本店已沽清' : '本店已停售' }}
            </p>
            <p v-else-if="row.status !== DishStatus.ON_SHELF" class="cell-note">
              商户已下架，本店设置不生效
            </p>
          </template>
        </el-table-column>

        <el-table-column v-if="!readonly" label="操作" width="200" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button
                v-if="canUpdate && storeContext !== null"
                link
                type="primary"
                @click="openOverride(rowAt($index))"
              >
                本店例外
              </el-button>
              <el-button v-if="canEditStandard" link type="primary" @click="openEdit(rowAt($index))">
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
          <p class="form-hint">平台管理员需指定菜品归属的商户，创建后不可跨商户迁移。</p>
        </el-form-item>

        <el-form-item v-if="form.id === null && showStoreFilter" label="归属门店">
          <el-select v-model="form.storeId" placeholder="全商户通用" clearable filterable style="width: 100%">
            <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <p class="form-hint">
            留空表示全商户通用；选定后这是该店专属菜，别的店既看不到也下不了单，且创建后不可迁移。
          </p>
        </el-form-item>

        <el-form-item v-if="form.id !== null && form.storeId !== undefined" label="归属门店">
          <span>{{ storeName(form.storeId) }}专属</span>
          <p class="form-hint">店专属菜的归属不可更改；编辑时可选的分类也已按该店范围过滤。</p>
        </el-form-item>

        <el-form-item label="所属分类" prop="categoryId">
          <el-select v-model="form.categoryId" placeholder="请选择分类" style="width: 100%">
            <el-option
              v-for="item in formCategoryOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <p v-if="isPlatformAdmin && form.merchantId && formCategoryOptions.length === 0" class="form-hint">
            该商户下还没有菜品分类，请先到「菜品分类」模块创建。
          </p>
        </el-form-item>

        <el-form-item label="菜品名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：宫保鸡丁" maxlength="64" show-word-limit />
        </el-form-item>

        <el-form-item label="菜品描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="选填，最多 255 个字符"
            maxlength="255"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="图片地址" prop="imageUrl">
          <el-input v-model="form.imageUrl" placeholder="选填，完整 URL，例如 https://cdn.example.com/dish/1.jpg" />
        </el-form-item>

        <el-form-item label="售价" prop="priceYuan">
          <el-input-number
            v-model="form.priceYuan"
            :min="0"
            :max="1000000"
            :precision="2"
            :step="1"
            :controls="false"
            placeholder="0.00"
            style="width: 160px"
          />
          <span class="form-hint form-hint--inline">元</span>
        </el-form-item>

        <el-form-item label="会员价">
          <el-input-number
            v-model="form.memberPriceYuan"
            :min="0"
            :max="1000000"
            :precision="2"
            :step="1"
            :controls="false"
            placeholder="留空表示不区分"
            style="width: 160px"
          />
          <span class="form-hint form-hint--inline">元，留空表示不区分会员价</span>
        </el-form-item>

        <el-form-item label="计价单位" prop="unit">
          <el-input v-model="form.unit" placeholder="份" maxlength="8" style="width: 120px" />
        </el-form-item>

        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" />
          <span class="form-hint form-hint--inline">数值越小越靠前</span>
        </el-form-item>

        <el-form-item label="上架状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="DishStatus.ON_SHELF">上架</el-radio>
            <el-radio :value="DishStatus.OFF_SHELF">下架</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="推荐菜">
          <el-switch v-model="form.isRecommend" />
          <span class="form-hint form-hint--inline">开启后在小程序端会带「推荐」标识</span>
        </el-form-item>

        <el-form-item label="规格组">
          <div class="spec-picker">
            <el-checkbox-group v-model="form.specGroupIds" class="spec-picker__list">
              <el-checkbox
                v-for="group in formSpecGroupOptions"
                :key="group.id"
                :value="group.id"
                class="spec-picker__item"
              >
                <span class="spec-picker__name">{{ group.name }}</span>
                <span class="spec-picker__meta">
                  {{ group.typeLabel }} · {{ group.isRequired ? '必选' : '可选' }}
                </span>
                <span class="spec-picker__options">
                  {{ group.options.map((option) => option.name).join(' / ') }}
                </span>
              </el-checkbox>
            </el-checkbox-group>

            <p v-if="formSpecGroupOptions.length === 0" class="form-hint">
              当前商户还没有规格组，可先到「规格组」模块创建后再回来关联。
            </p>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
    <!-- 本店例外：只影响这一家店，不动商户标准菜单 -->
    <el-dialog
      v-model="overrideVisible"
      title="本店例外设置"
      width="520px"
      :close-on-click-modal="false"
    >
      <template v-if="overrideRow">
        <p class="override-head">
          <strong>{{ overrideRow.name }}</strong>
          <span class="muted">在「{{ storeContextName }}」的单独设置</span>
        </p>

        <el-form label-width="92px">
          <el-form-item label="本店在售">
            <el-switch
              v-model="overrideForm.saleStatus"
              :active-value="DishStatus.ON_SHELF"
              :inactive-value="DishStatus.OFF_SHELF"
            />
            <span class="form-hint form-hint--inline">
              商户层当前为「{{ overrideRow.statusLabel }}」，停售只影响本店
            </span>
          </el-form-item>

          <el-form-item label="沽清">
            <el-switch v-model="overrideForm.soldOut" />
            <span class="form-hint form-hint--inline">当日卖完，与「停售」是两回事</span>
          </el-form-item>

          <el-form-item label="门店价">
            <el-input-number
              v-model="overrideForm.priceYuan"
              :min="0"
              :max="1000000"
              :precision="2"
              :step="1"
              :controls="false"
              :disabled="!canEditStorePrice"
              placeholder="留空跟随标准价"
              style="width: 160px"
            />
            <span class="form-hint form-hint--inline">
              元，标准价 ¥{{ fenToYuan(overrideRow.price) }}
            </span>
          </el-form-item>

          <el-form-item label="门店会员价">
            <el-input-number
              v-model="overrideForm.memberPriceYuan"
              :min="0"
              :max="1000000"
              :precision="2"
              :step="1"
              :controls="false"
              :disabled="!canEditStorePrice"
              placeholder="留空跟随标准"
              style="width: 160px"
            />
            <span class="form-hint form-hint--inline">
              元，标准 {{ overrideRow.memberPrice === null ? '不设会员价' : `¥ ${fenToYuan(overrideRow.memberPrice)}` }}
            </span>
          </el-form-item>
        </el-form>

        <p v-if="!canEditStorePrice" class="form-hint">
          门店价由商户管理员设置，门店账号只能改本店在售与沽清。
        </p>
      </template>

      <template #footer>
        <el-button
          v-if="overrideRow?.overridden"
          type="danger"
          plain
          @click="restoreStandard"
        >
          恢复跟随标准菜单
        </el-button>
        <el-button @click="overrideVisible = false">取消</el-button>
        <el-button type="primary" :loading="overrideSaving" @click="saveOverride">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.dish-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  &__flag {
    margin-left: 6px;
    vertical-align: middle;
  }
}

.cell-stack--right {
  align-items: flex-end;
}

/* 本店列的两个开关：竖排紧凑，标签在左开关在右 */
.store-switches {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.store-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &__label {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.override-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--neutral-100);
  font-size: 14px;
}

.option-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.form-hint--inline {
  margin-top: 0;
  margin-left: 10px;
}

/* ---------------- 规格组选择 ---------------- */
.spec-picker {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--neutral-25);

  &__list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  &__item {
    height: auto;
    width: 100%;
    padding: 6px 0;
    margin-right: 0;

    :deep(.el-checkbox__label) {
      display: flex;
      align-items: baseline;
      gap: 10px;
      min-width: 0;
      white-space: normal;
    }
  }

  &__name {
    font-weight: 500;
    color: var(--text-primary);
  }

  &__meta {
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__options {
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
