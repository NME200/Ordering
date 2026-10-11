<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import PageHeader from '../../components/PageHeader.vue';
import { fetchStores } from '../../api/store';
import {
  createStoreTable,
  fetchStoreTables,
  removeStoreTable,
  updateStoreTable,
} from '../../api/store-table';
import {
  fetchTableQrcodes,
  generateAllTableQrcodes,
  generateTableQrcode,
} from '../../api/store-table-qrcode';
import { useSession } from '../../session';
import { CommonStatus, Permission } from '../../types/enums';
import type { Store, StoreTable, TableQrcodeImage } from '../../types/store';
import { formatDateTime } from '../../utils/format';

/**
 * 桌码管理（商家自己后台）。
 *
 * 一张桌一条记录：先录台位，再生成桌码，打印贴到桌上。顾客扫开就直接落在这家店的
 * 点餐页、桌号已经带上，全程不需要手填 —— 所以这份台位清单就是桌号的唯一来源，
 * 没录进来或已停用的桌，扫码下单会被服务端拒绝。
 *
 * 出码用的微信凭据是平台那一份（平台端「系统设置 → 小程序配置」）。
 * 没配齐时接口会如实回话，这里不猜、也不假装生成成功。
 */

const props = defineProps<{ readonly?: boolean }>();

const session = useSession();
const canManage = computed(() => !props.readonly && session.hasPermission(Permission.STORE_UPDATE));

const stores = ref<Store[]>([]);
const storeId = ref<number | null>(null);
const loading = ref(false);
const tables = ref<StoreTable[]>([]);
const codes = ref<Map<string, TableQrcodeImage>>(new Map());
/** 正在出码的桌号：批量时逐行显示 loading，不让商家以为卡住了 */
const busyTables = ref<string[]>([]);
const batchFailed = ref<{ tableNo: string; reason: string }[]>([]);

/** 已印出去的台面牌带着生成时的版本，这里要说清楚它是哪种码 */
const ENV_LABELS: Record<string, string> = {
  release: '正式版码',
  trial: '体验版码（仅体验成员可扫）',
  develop: '开发版码（仅开发者可扫）',
};

const generatedCount = computed(() => tables.value.filter((row) => codes.value.has(row.tableNo)).length);

/** el-table 插槽给的 row 是 DefaultRow，取行统一走这个函数保证类型 */
function rowAt(index: number): StoreTable {
  return tables.value[index];
}

/* ---------------- 台位表单 ---------------- */

const formVisible = ref(false);
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({ tableNo: '', area: '', sort: 0, status: CommonStatus.ENABLED as CommonStatus });
const rules: FormRules = {
  tableNo: [
    { required: true, message: '请填写桌号', trigger: 'blur' },
    { max: 16, message: '桌号最长 16 个字符', trigger: 'blur' },
  ],
};

async function loadStores(): Promise<void> {
  const data = await fetchStores({ page: 1, pageSize: 100 });
  stores.value = data.list;
  if (storeId.value === null && data.list.length) {
    storeId.value = data.list[0].id;
  }
  await loadAll();
}

async function loadAll(): Promise<void> {
  if (storeId.value === null) {
    tables.value = [];
    codes.value = new Map();
    return;
  }
  loading.value = true;
  try {
    const [rows, qrcodes] = await Promise.all([
      fetchStoreTables(storeId.value),
      fetchTableQrcodes(storeId.value),
    ]);
    tables.value = rows;
    codes.value = new Map(qrcodes.map((item) => [item.tableNo, item as TableQrcodeImage]));
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editingId.value = null;
  Object.assign(form, { tableNo: '', area: '', sort: 0, status: CommonStatus.ENABLED });
  formVisible.value = true;
}

function openEdit(row: StoreTable): void {
  editingId.value = row.id;
  Object.assign(form, {
    tableNo: row.tableNo,
    area: row.area ?? '',
    sort: row.sort,
    status: row.status,
  });
  formVisible.value = true;
}

async function submit(): Promise<void> {
  if (storeId.value === null) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  const payload = {
    tableNo: form.tableNo.trim(),
    area: form.area.trim() || null,
    sort: form.sort,
    status: form.status,
  };
  if (editingId.value === null) {
    await createStoreTable(storeId.value, payload);
    ElMessage.success(`已新增台位 ${payload.tableNo}`);
  } else {
    await updateStoreTable(storeId.value, editingId.value, payload);
    ElMessage.success('台位已更新');
  }
  formVisible.value = false;
  await loadAll();
}

async function toggleStatus(row: StoreTable, next: CommonStatus): Promise<void> {
  if (storeId.value === null) return;
  await updateStoreTable(storeId.value, row.id, {
    tableNo: row.tableNo,
    area: row.area,
    sort: row.sort,
    status: next,
  });
  row.status = next;
  ElMessage.success(next === CommonStatus.ENABLED ? `${row.tableNo} 已启用` : `${row.tableNo} 已停用`);
}

async function remove(row: StoreTable): Promise<void> {
  if (storeId.value === null) return;
  try {
    await ElMessageBox.confirm(
      `删除后，扫「${row.tableNo}」这张码的顾客会被提示桌号不存在。台面牌还挂着的话建议改为「停用」。`,
      '删除台位',
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
  await removeStoreTable(storeId.value, row.id);
  ElMessage.success('已删除');
  await loadAll();
}

/* ---------------- 出码 ---------------- */

async function handleGenerate(tableNo: string): Promise<void> {
  if (storeId.value === null) return;
  busyTables.value = [...busyTables.value, tableNo];
  try {
    const image = await generateTableQrcode(storeId.value, tableNo);
    codes.value = new Map(codes.value).set(tableNo, image);
    ElMessage.success(`${tableNo} 的桌码已生成`);
  } finally {
    busyTables.value = busyTables.value.filter((item) => item !== tableNo);
  }
}

async function handleGenerateAll(): Promise<void> {
  if (storeId.value === null) return;
  busyTables.value = tables.value.map((item) => item.tableNo);
  batchFailed.value = [];
  try {
    const result = await generateAllTableQrcodes(storeId.value);
    await loadAll();
    batchFailed.value = result.failed;
    if (!result.failed.length) {
      ElMessage.success(`本店 ${result.total} 张桌码已生成`);
    }
  } finally {
    busyTables.value = [];
  }
}

/** 下载：图片是 data URL，挂个 a[download] 就行，不需要后端再开流式接口 */
function handleDownload(tableNo: string): void {
  const image = codes.value.get(tableNo);
  if (!image?.imageBase64) {
    ElMessage.warning('这张桌还没生成桌码');
    return;
  }
  // 后缀跟着真实格式走：微信这张码实测是 JPEG，写 .png 会让打印店打不开
  const mime = image.imageBase64.slice(5, image.imageBase64.indexOf(';'));
  const link = document.createElement('a');
  link.href = image.imageBase64;
  link.download = `桌码-${tableNo}.${mime === 'image/png' ? 'png' : 'jpg'}`;
  link.click();
}

onMounted(() => {
  void loadStores();
});
</script>

<template>
  <div class="table-qrcode">
    <PageHeader
      title="桌码管理"
      description="先录台位，再按桌生成小程序码。顾客扫桌上的码直接进入本门店点餐页并自动带上桌号，不需要手填。"
    >
      <template #actions>
        <el-select
          v-model="storeId"
          class="table-qrcode__store"
          filterable
          placeholder="选择门店"
          :disabled="!stores.length"
          @change="loadAll"
        >
          <el-option v-for="item in stores" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
      </template>
    </PageHeader>

    <el-alert
      class="table-qrcode__notice"
      type="info"
      :closable="false"
      show-icon
      title="桌号只认扫码"
      description="顾客端已经去掉手填桌号：桌号由这张码带进来。所以这里没录的桌、或已停用的桌，扫开下单会被提示「桌号不存在」。没扫码的堂食顾客仍可下单，由店员现场安排。"
    />

    <el-alert
      v-if="batchFailed.length"
      class="table-qrcode__notice"
      type="warning"
      :closable="true"
      show-icon
      title="部分桌码没有生成成功"
      :description="batchFailed.map((item) => `${item.tableNo}：${item.reason}`).join('；')"
    />

    <div class="table-qrcode__toolbar">
      <el-button v-if="canManage" type="primary" :icon="Plus" @click="openCreate">新增台位</el-button>
      <el-button
        v-if="canManage"
        :disabled="!tables.length"
        :loading="busyTables.length > 0"
        @click="handleGenerateAll"
      >
        批量生成本店桌码
      </el-button>
      <span class="table-qrcode__meta">
        台位 {{ tables.length }} 张 · 已出码 {{ generatedCount }} 张
      </span>
    </div>

    <el-table v-loading="loading" :data="tables" size="small">
      <el-table-column label="桌号" min-width="110">
        <template #default="{ row }"><span class="num">{{ row.tableNo }}</span></template>
      </el-table-column>
      <el-table-column label="区域" min-width="110">
        <template #default="{ row }">{{ row.area || '—' }}</template>
      </el-table-column>
      <el-table-column label="排序" width="72" align="center">
        <template #default="{ row }"><span class="num">{{ row.sort }}</span></template>
      </el-table-column>
      <el-table-column label="启用" width="80" align="center">
        <template #default="{ $index }">
          <el-switch
            :model-value="rowAt($index).status === 1"
            :disabled="!canManage"
            @update:model-value="toggleStatus(rowAt($index), $event ? 1 : 0)"
          />
        </template>
      </el-table-column>
      <el-table-column label="桌码" min-width="220">
        <template #default="{ row }">
          <div v-if="codes.get(row.tableNo)" class="table-qrcode__code">
            <img :src="codes.get(row.tableNo)?.imageBase64" :alt="row.tableNo" />
            <div class="table-qrcode__code-meta">
              <span class="num">{{ codes.get(row.tableNo)?.scene }}</span>
              <span>{{ ENV_LABELS[codes.get(row.tableNo)?.envVersion ?? ''] ?? codes.get(row.tableNo)?.envVersion }} · {{ formatDateTime(codes.get(row.tableNo)?.updatedAt ?? '') }}</span>
            </div>
          </div>
          <span v-else class="table-qrcode__meta">未生成</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canManage" label="操作" width="230" align="right" fixed="right">
        <template #default="{ $index }">
          <el-button
            link
            type="primary"
            :disabled="rowAt($index).status !== 1"
            :loading="busyTables.includes(rowAt($index).tableNo)"
            @click="handleGenerate(rowAt($index).tableNo)"
          >
            {{ codes.get(rowAt($index).tableNo) ? '重新生成' : '生成桌码' }}
          </el-button>
          <el-button
            link
            type="primary"
            :disabled="!codes.get(rowAt($index).tableNo)"
            @click="handleDownload(rowAt($index).tableNo)"
          >
            下载
          </el-button>
          <el-button link type="primary" @click="openEdit(rowAt($index))">编辑</el-button>
          <el-button link type="danger" @click="remove(rowAt($index))">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <p class="table-qrcode__meta">
          这家店还没有台位。先点「新增台位」把桌号录进来（与台面牌一致），再生成桌码打印贴桌。
        </p>
      </template>
    </el-table>

    <el-dialog v-model="formVisible" :title="editingId === null ? '新增台位' : '编辑台位'" width="420px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="72px">
        <el-form-item label="桌号" prop="tableNo">
          <el-input v-model="form.tableNo" maxlength="16" placeholder="如 A12，与台面牌一致" />
          <p class="table-qrcode__hint">
            建议只用字母、数字与 - _：微信的 scene 不接受中文与空格，带这些字符的桌号出不了码。
          </p>
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="form.area" maxlength="24" placeholder="如 大厅 / 二楼包厢，选填" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.table-qrcode {
  padding: var(--space-4);

  &__store {
    width: 200px;
    margin-right: var(--space-2);
  }

  &__notice {
    margin-bottom: var(--space-3);
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  &__meta,
  &__hint {
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-3, #8a8f99);
  }

  &__hint {
    margin: 4px 0 0;
  }

  &__code {
    display: flex;
    align-items: center;
    gap: 10px;

    img {
      width: 64px;
      height: 64px;
      border-radius: 6px;
      background-color: #f7f8fa;
    }

    &-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 12px;
      color: var(--text-3, #8a8f99);
    }
  }
}
</style>
