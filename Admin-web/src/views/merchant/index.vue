<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { createMerchant, fetchMerchants, removeMerchant, updateMerchant } from '@shared/api/merchant';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { useUserStore } from '@/store/modules/user';
import { COMMON_STATUS_OPTIONS, CommonStatus, Permission } from '@shared/types/enums';
import type { Merchant, MerchantQuery } from '@shared/types/merchant';
import { describeExpireAt, formatDateTime, orEmpty } from '@shared/utils/format';

const userStore = useUserStore();
const router = useRouter();

const canCreate = computed(() => userStore.hasPermission(Permission.MERCHANT_CREATE));
const canUpdate = computed(() => userStore.hasPermission(Permission.MERCHANT_UPDATE));
const canDelete = computed(() => userStore.hasPermission(Permission.MERCHANT_DELETE));

/* ---------------- 列表 ---------------- */

const defaultQuery: MerchantQuery = { page: 1, pageSize: 10, keyword: '', status: undefined };

const { list, total, loading, query, load, search, reset } = useListQuery(fetchMerchants, defaultQuery);

/**
 * el-table 插槽暴露的 row 是 EP 的宽松行类型（DefaultRow），
 * 这里按索引取回强类型行，避免在每个调用点写类型断言。
 */
function rowAt(index: number): Merchant {
  return list.value[index];
}

const isFiltered = computed(() => Boolean(query.keyword) || query.status !== undefined);

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

interface MerchantForm {
  id: number | null;
  name: string;
  contactName: string;
  contactPhone: string;
  /** yyyy-MM-dd，空串表示不限 */
  expireAt: string;
  remark: string;
  status: CommonStatus;
  /* 首个商家管理员：只随新增出现，之后由商家自行维护 */
  adminUsername: string;
  adminNickname: string;
  adminPassword: string;
}

function createEmptyForm(): MerchantForm {
  return {
    id: null,
    name: '',
    contactName: '',
    contactPhone: '',
    expireAt: '',
    remark: '',
    status: CommonStatus.ENABLED,
    adminUsername: '',
    adminNickname: '',
    adminPassword: '',
  };
}

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<MerchantForm>(createEmptyForm());

const isCreate = computed(() => form.id === null);

const rules = computed<FormRules<MerchantForm>>(() => ({
  name: [
    { required: true, message: '请输入商户名称', trigger: 'blur' },
    { max: 64, message: '商户名称最长 64 个字符', trigger: 'blur' },
  ],
  contactName: [{ max: 32, message: '联系人最长 32 个字符', trigger: 'blur' }],
  contactPhone: [{ max: 20, message: '联系电话最长 20 个字符', trigger: 'blur' }],
  remark: [{ max: 255, message: '备注最长 255 个字符', trigger: 'blur' }],
  // 建商户必须同时把管理员开出来，否则产出一个谁也登不进去的租户
  adminUsername: isCreate.value
    ? [
        { required: true, message: '请输入商家管理员用户名', trigger: 'blur' },
        { max: 32, message: '用户名最长 32 个字符', trigger: 'blur' },
      ]
    : [],
  adminNickname: isCreate.value
    ? [{ required: true, message: '请输入管理员姓名', trigger: 'blur' }]
    : [],
  adminPassword: isCreate.value
    ? [
        { required: true, message: '请输入初始密码', trigger: 'blur' },
        { min: 6, message: '密码至少 6 位', trigger: 'blur' },
        { max: 32, message: '密码最长 32 位', trigger: 'blur' },
      ]
    : [],
}));

const dialogTitle = computed(() => (form.id === null ? '新增商户' : '编辑商户'));

function handleDialogOpened(): void {
  formRef.value?.clearValidate();
}

function openCreate(): void {
  Object.assign(form, createEmptyForm());
  dialogVisible.value = true;
}

function openEdit(row: Merchant): void {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    contactName: row.contactName ?? '',
    contactPhone: row.contactPhone ?? '',
    expireAt: row.expireAt ? row.expireAt.slice(0, 10) : '',
    remark: row.remark ?? '',
    status: row.status,
    adminUsername: '',
    adminNickname: '',
    adminPassword: '',
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
    const payload = {
      name: form.name.trim(),
      contactName: form.contactName.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
      expireAt: form.expireAt ? new Date(`${form.expireAt}T00:00:00`).toISOString() : null,
      remark: form.remark.trim() || undefined,
    };

    if (form.id === null) {
      await createMerchant({
        ...payload,
        adminUsername: form.adminUsername.trim(),
        adminNickname: form.adminNickname.trim(),
        adminPassword: form.adminPassword,
      });
      ElMessage.success('商户已创建，商家管理员账号已同步开通');
    } else {
      await updateMerchant(form.id, { ...payload, status: form.status });
      ElMessage.success('商户已更新');
    }

    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

/* ---------------- 状态切换 / 删除 ---------------- */

async function handleStatusChange(row: Merchant, next: boolean): Promise<void> {
  const status = next ? CommonStatus.ENABLED : CommonStatus.DISABLED;
  try {
    await updateMerchant(row.id, { status });
    row.status = status;
    ElMessage.success(next ? '商户已启用' : '商户已禁用');
  } catch {
    // 失败时保持原状态：row.status 未变更，开关会回到原位置
  }
}

async function handleDelete(row: Merchant): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除后「${row.name}」将不再出现在列表中，其下门店与账号也将无法登录，确定删除吗？`,
      '删除商户',
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

  await removeMerchant(row.id);
  ElMessage.success('商户已删除');

  // 删除当前页最后一条时回退一页，避免停留在空页
  if (list.value.length === 1 && query.page > 1) {
    query.page -= 1;
  }
  await load();
}

onMounted(load);
</script>

<template>
  <div class="page">
    <PageHeader title="商户管理" description="平台在册的租户主体，商户是门店与账号的归属根节点">
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">
          新增商户
        </el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索商户名称"
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
        <el-table-column label="商户名称" min-width="220">
          <template #default="{ row }">
            <div class="cell-stack">
              <router-link class="merchant-name" :to="`/merchants/${row.id}`">
                {{ row.name }}
              </router-link>
              <span class="cell-stack__sub">
                {{ orEmpty(row.contactName) }}<template v-if="row.contactPhone"> · {{ row.contactPhone }}</template>
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row, $index }">
            <el-switch
              :model-value="row.status === CommonStatus.ENABLED"
              :disabled="!canUpdate"
              @change="(value: string | number | boolean) => handleStatusChange(rowAt($index), Boolean(value))"
            />
          </template>
        </el-table-column>

        <el-table-column label="服务到期" width="140">
          <template #default="{ row }">
            <span
              class="num"
              :class="{ 'is-expired': describeExpireAt(row.expireAt).expired }"
            >
              {{ describeExpireAt(row.expireAt).text }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="备注" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'empty-cell': !row.remark }">{{ orEmpty(row.remark) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button link type="primary" @click="router.push(`/merchants/${rowAt($index).id}`)">
                查看详情
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
      width="600px"
      :close-on-click-modal="false"
      @opened="handleDialogOpened"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item label="商户名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：示例餐饮有限公司" maxlength="64" show-word-limit />
        </el-form-item>

        <template v-if="isCreate">
          <div class="dialog-divider">
            <span>商家管理员</span>
            <em>商家的首个账号，用于登录商户后台；此后的员工由商家自行开通</em>
          </div>

          <el-form-item label="管理员姓名" prop="adminNickname">
            <el-input v-model="form.adminNickname" placeholder="例如：张三" maxlength="32" />
          </el-form-item>

          <el-form-item label="登录用户名" prop="adminUsername">
            <el-input v-model="form.adminUsername" placeholder="全平台唯一" maxlength="32" />
          </el-form-item>

          <el-form-item label="初始密码" prop="adminPassword">
            <el-input
              v-model="form.adminPassword"
              type="password"
              placeholder="6 ~ 32 位"
              maxlength="32"
              show-password
            />
          </el-form-item>
        </template>

        <el-form-item label="联系人" prop="contactName">
          <el-input v-model="form.contactName" placeholder="选填" maxlength="32" />
        </el-form-item>

        <el-form-item label="联系电话" prop="contactPhone">
          <el-input v-model="form.contactPhone" placeholder="选填" maxlength="20" />
        </el-form-item>

        <el-form-item label="服务到期">
          <el-date-picker
            v-model="form.expireAt"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="不选表示不限"
            clearable
            style="width: 100%"
          />
          <p class="form-hint">到期后该商户下账号将无法登录；留空表示长期有效。</p>
        </el-form-item>

        <el-form-item v-if="form.id !== null" label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="CommonStatus.ENABLED">启用</el-radio>
            <el-radio :value="CommonStatus.DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="选填，最多 255 个字符"
            maxlength="255"
            show-word-limit
          />
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
.is-expired {
  color: var(--danger-500);
  font-weight: 500;
}

/* 弹窗内的分区标题：把「商家管理员」这组字段和商户资料分开 */
.dialog-divider {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 var(--space-4);
  padding-top: var(--space-2);
  border-top: 1px solid var(--neutral-100);

  span {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  em {
    font-size: 12px;
    font-style: normal;
    color: var(--text-placeholder);
  }
}

/* 商户名可点击进入详情（只读排查视图） */
.merchant-name {
  font-weight: 500;
  color: var(--text-primary);

  &:hover {
    color: var(--brand-600);
  }
}
</style>
