<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { fetchMerchantOptions } from '../../api/merchant';
import { createStore, fetchStores, removeStore, updateStore, updateStoreStatus } from '../../api/store';
import ImageUploadField from '../../components/ImageUploadField.vue';
import PageHeader from '../../components/PageHeader.vue';
import StatusTag from '../../components/StatusTag.vue';
import TableEmpty from '../../components/TableEmpty.vue';
import TablePagination from '../../components/TablePagination.vue';
import { useListQuery } from '../../hooks/useListQuery';
import { useSession } from '../../session';
import {
  AccountBanSource,
  BAN_SOURCE_LABELS,
  BusinessStatus,
  COMMON_STATUS_OPTIONS,
  CommonStatus,
  Permission,
} from '../../types/enums';
import type { Merchant } from '../../types/merchant';
import type { Store, StoreQuery } from '../../types/store';
import { formatDateTime, orEmpty } from '../../utils/format';

const session = useSession();

/**
 * 内嵌模式：供「商户详情」页复用。
 * 平台对门店有开通 / 停用 / 删除与查看，但没有 `store:update`（资料归商家）。
 */
const props = withDefaults(
  defineProps<{
    /** 隐藏页头，作为标签页内容渲染 */
    embedded?: boolean;
    /** 固定商户范围（商户详情页传入），传入后不再展示商户筛选 */
    merchantId?: number;
    /** 只读模式：隐藏所有写操作入口 */
    readonly?: boolean;
  }>(),
  { embedded: false, merchantId: undefined, readonly: false },
);

/** 平台侧「点击门店看订单」的下钻入口，由宿主页面（商户详情）接住 */
const emit = defineEmits<{ viewOrders: [store: Store] }>();

/** 平台管理员可跨租户查看，因此需要显式选择商户；其它角色由服务端按 Token 限定 */
const isPlatformAdmin = computed(() => session.isPlatformAdmin);

const canCreate = computed(() => !props.readonly && session.hasPermission(Permission.STORE_CREATE));
const canUpdate = computed(() => !props.readonly && session.hasPermission(Permission.STORE_UPDATE));
const canDisable = computed(() => !props.readonly && session.hasPermission(Permission.STORE_DISABLE));
const canDelete = computed(() => !props.readonly && session.hasPermission(Permission.STORE_DELETE));
const canViewOrders = computed(() => props.embedded && session.hasPermission(Permission.ORDER_READ));

/**
 * 平台停用的门店商户解不开（封禁是单向的，见 CODEBUDDY 8.2.2）。
 * 开关要提前灰掉并说明原因，否则商家只会反复点击然后来问为什么没反应。
 */
function lockedByPlatform(row: Store): boolean {
  return !isPlatformAdmin.value && row.bannedBy === AccountBanSource.PLATFORM;
}

/* ---------------- 商户下拉（仅平台管理员需要） ---------------- */

const merchantOptions = ref<Merchant[]>([]);

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

function merchantName(id: number): string {
  return merchantOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

/* ---------------- 列表 ---------------- */

const defaultQuery: StoreQuery = {
  page: 1,
  pageSize: 10,
  merchantId: props.merchantId,
  keyword: '',
  status: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(fetchStores, defaultQuery);

/** 商户详情页切换商户时同步范围（同一组件被路由复用） */
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
function rowAt(index: number): Store {
  return list.value[index];
}

const isFiltered = computed(
  () => Boolean(query.keyword) || query.status !== undefined || query.merchantId !== undefined,
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

interface StoreForm {
  id: number | null;
  merchantId: number | undefined;
  name: string;
  code: string;
  address: string;
  phone: string;
  logo: string;
  businessHours: string;
  latitude: string;
  longitude: string;
  businessStatus: BusinessStatus;
}

function createEmptyForm(): StoreForm {
  return {
    id: null,
    merchantId: undefined,
    name: '',
    code: '',
    address: '',
    phone: '',
    logo: '',
    businessHours: '',
    latitude: '',
    longitude: '',
    businessStatus: BusinessStatus.OPEN,
  };
}

const dialogVisible = ref(false);

/**
 * 坐标输入是字符串，留空就下发 null（顾客端只是不显示距离，不影响下单）。
 * 范围交给表单规则拦，这里只负责转数字。
 */
function toCoordinate(value: string): number | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

/** 经纬度留空是合法的（表示没录入），但填了就必须落在合法区间，别让脏坐标进库 */
function coordinateValidator(limit: number) {
  return (_rule: unknown, value: string, callback: (error?: Error) => void): void => {
    const text = String(value ?? '').trim();
    if (!text) {
      callback();
      return;
    }
    const num = Number(text);
    if (!Number.isFinite(num) || Math.abs(num) > limit) {
      callback(new Error(`需要在 -${limit} ~ ${limit} 之间`));
      return;
    }
    callback();
  };
}
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<StoreForm>(createEmptyForm());

const rules = computed<FormRules<StoreForm>>(() => ({
  merchantId: isPlatformAdmin.value
    ? [{ required: true, message: '请选择所属商户', trigger: 'change' }]
    : [],
  name: [
    { required: true, message: '请输入门店名称', trigger: 'blur' },
    { max: 64, message: '门店名称最长 64 个字符', trigger: 'blur' },
  ],
  code: [{ max: 32, message: '门店编码最长 32 个字符', trigger: 'blur' }],
  address: [{ max: 255, message: '门店地址最长 255 个字符', trigger: 'blur' }],
  phone: [{ max: 20, message: '门店电话最长 20 个字符', trigger: 'blur' }],
  logo: [
    { max: 255, message: 'logo 地址最长 255 个字符', trigger: 'blur' },
    {
      /**
       * 与菜品图同一把尺：只认 http(s):// 开头。
       * 后端 CreateStoreDto.logo 只有 @IsString，所以这道闸是唯一的防线 ——
       * 手填一个 `abc.png` 落库，顾客端就挂成碎图。
       */
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!value || /^https?:\/\//i.test(value)) {
          callback();
          return;
        }
        callback(new Error('图片地址需以 http:// 或 https:// 开头'));
      },
      trigger: 'blur',
    },
  ],
  businessHours: [{ max: 32, message: '营业时间最长 32 个字符', trigger: 'blur' }],
  latitude: [{ validator: coordinateValidator(90), trigger: 'blur' }],
  longitude: [{ validator: coordinateValidator(180), trigger: 'blur' }],
}));

const dialogTitle = computed(() => (form.id === null ? '新增门店' : '编辑门店'));

function handleDialogOpened(): void {
  formRef.value?.clearValidate();
}

function openCreate(): void {
  Object.assign(form, createEmptyForm());
  // 平台管理员在筛选栏已选商户时，默认带入，减少重复选择
  form.merchantId = query.merchantId;
  dialogVisible.value = true;
}

function openEdit(row: Store): void {
  Object.assign(form, {
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    code: row.code ?? '',
    address: row.address ?? '',
    phone: row.phone ?? '',
    logo: row.logo ?? '',
    businessHours: row.businessHours ?? '',
    latitude: row.latitude === null || row.latitude === undefined ? '' : String(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? '' : String(row.longitude),
    businessStatus: row.businessStatus,
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
      await createStore({
        merchantId: isPlatformAdmin.value ? form.merchantId : undefined,
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        logo: form.logo.trim() || null,
        businessHours: form.businessHours.trim() || null,
        latitude: toCoordinate(form.latitude),
        longitude: toCoordinate(form.longitude),
        businessStatus: form.businessStatus,
      });
      ElMessage.success('门店已创建');
    } else {
      await updateStore(form.id, {
        name: form.name.trim(),
        // 可清空的字段一律发 null：后端按「字段是否出现」决定改不改，
        // 发 undefined 等于「本次没动它」，界面上删空了也清不掉
        code: form.code.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        logo: form.logo.trim() || null,
        businessHours: form.businessHours.trim() || null,
        latitude: toCoordinate(form.latitude),
        longitude: toCoordinate(form.longitude),
        businessStatus: form.businessStatus,
      });
      ElMessage.success('门店已更新');
    }

    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

/* ---------------- 状态切换 / 删除 ---------------- */

async function handleStatusChange(row: Store, next: boolean): Promise<void> {
  const status = next ? CommonStatus.ENABLED : CommonStatus.DISABLED;
  try {
    // 以服务端回写为准：禁用由谁发起（bannedBy）决定对方能不能再拨回来
    const updated = await updateStoreStatus(row.id, status);
    row.status = updated.status;
    row.bannedBy = updated.bannedBy;
    ElMessage.success(next ? '门店已恢复' : '门店已禁用');
  } catch {
    // 失败保持原状态；「由平台禁用，只能由平台恢复」这类 403 提示已由请求层弹出
  }
}

async function handleDelete(row: Store): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除门店「${row.name}」吗？`, '删除门店', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }

  try {
    await removeStore(row.id);
  } catch {
    // 有历史订单时服务端拒绝（409），原因已由请求层弹出
    return;
  }

  ElMessage.success('门店已删除');

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
      title="门店管理"
      description="门店是收银与订单的经营单元。这里可开通、改资料、禁用与删除；禁用中的门店不再接单，已有订单的门店只能禁用不能删除。租户范围由服务端按登录账号强制隔离"
    >
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">
          新增门店
        </el-button>
      </template>
    </PageHeader>

    <section :class="embedded ? 'embedded-list' : 'panel panel--flush'">
      <!-- 内嵌形态没有页头，新增入口单独占一行（平台在商户详情里开通门店） -->
      <div v-if="embedded && canCreate" class="embedded-actions">
        <el-button type="primary" :icon="Plus" @click="openCreate">新增门店</el-button>
      </div>

      <div class="filters">
        <el-select
          v-if="isPlatformAdmin && !embedded"
          v-model="query.merchantId"
          class="filters__field"
          placeholder="全部商户"
          clearable
          filterable
        >
          <el-option
            v-for="item in merchantOptions"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>

        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索门店名称"
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
        <el-table-column label="门店名称" min-width="200">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ row.name }}</span>
              <span class="cell-stack__sub">编码 {{ orEmpty(row.code) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="isPlatformAdmin && !embedded" label="所属商户" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ merchantName(row.merchantId) }}
          </template>
        </el-table-column>

        <el-table-column label="地址" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'empty-cell': !row.address }">{{ orEmpty(row.address) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="电话" width="140">
          <template #default="{ row }">
            <span class="num" :class="{ 'empty-cell': !row.phone }">{{ orEmpty(row.phone) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="营业状态" width="110" align="center">
          <template #default="{ row }">
            <StatusTag
              kind="business"
              :value="row.businessStatus"
              :stopped="row.status === CommonStatus.DISABLED"
            />
          </template>
        </el-table-column>

        <el-table-column label="启用" width="150" align="center">
          <template #default="{ row, $index }">
            <StatusTag v-if="readonly" kind="common" :value="row.status" />
            <el-switch
              v-else
              :model-value="row.status === CommonStatus.ENABLED"
              :disabled="!canDisable || lockedByPlatform(rowAt($index))"
              @change="(value: string | number | boolean) => handleStatusChange(rowAt($index), Boolean(value))"
            />
            <!-- 开关灰掉时必须说明是谁停的，否则商家只会反复拨开关 -->
            <el-tag v-if="row.bannedBy" class="ban-tag" type="warning" effect="plain" size="small">
              {{ BAN_SOURCE_LABELS[row.bannedBy as AccountBanSource] }}禁用
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column
          v-if="canViewOrders || canUpdate || canDelete"
          label="操作"
          width="170"
          fixed="right"
        >
          <template #default="{ $index }">
            <div class="table-actions">
              <!-- 平台在商户详情里点门店名下钻该店订单，宿主页面接住 view-orders -->
              <el-button v-if="canViewOrders" link type="primary" @click="emit('viewOrders', rowAt($index))">
                订单
              </el-button>
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
      width="560px"
      :close-on-click-modal="false"
      @opened="handleDialogOpened"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item
          v-if="isPlatformAdmin && !embedded && form.id === null"
          label="所属商户"
          prop="merchantId"
        >
          <el-select v-model="form.merchantId" placeholder="请选择商户" filterable style="width: 100%">
            <el-option
              v-for="item in merchantOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <p class="form-hint">门店创建后不可跨商户迁移。</p>
        </el-form-item>

        <el-form-item v-if="isPlatformAdmin && embedded && form.id === null" label="所属商户">
          <p class="form-hint">门店将开在当前商户下，不可跨商户迁移。</p>
        </el-form-item>

        <el-form-item label="门店名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：人民路店" maxlength="64" show-word-limit />
        </el-form-item>

        <el-form-item label="门店编码" prop="code">
          <el-input v-model="form.code" placeholder="选填，商户内唯一，例如 S001" maxlength="32" />
        </el-form-item>

        <el-form-item label="门店地址" prop="address">
          <el-input v-model="form.address" placeholder="选填" maxlength="255" />
        </el-form-item>

        <el-form-item label="门店电话" prop="phone">
          <el-input v-model="form.phone" placeholder="选填" maxlength="20" />
        </el-form-item>

        <el-form-item label="门店 logo" prop="logo">
          <ImageUploadField
            v-model="form.logo"
            placeholder="图片地址，或直接上传本地图片"
            hint="留空则顾客端用店名首字兜底。支持 JPG / PNG / GIF / WebP，单张不超过 2MB"
          />
        </el-form-item>
        <el-form-item label="营业时间" prop="businessHours">
          <el-input v-model="form.businessHours" placeholder="如 09:00-21:00，只做展示" clearable />
        </el-form-item>
        <el-form-item label="坐标（选填）">
          <div class="coord-row">
            <el-input v-model="form.latitude" placeholder="纬度 -90 ~ 90" maxlength="12" />
            <el-input v-model="form.longitude" placeholder="经度 -180 ~ 180" maxlength="12" />
          </div>
          <p class="form-hint">填了顾客端才显示「距您 xx m」；留空只影响距离展示，不影响下单。</p>
        </el-form-item>
        <el-form-item label="营业状态">
          <el-radio-group v-model="form.businessStatus">
            <el-radio :value="BusinessStatus.OPEN">营业中</el-radio>
            <el-radio :value="BusinessStatus.CLOSED">打烊</el-radio>
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
