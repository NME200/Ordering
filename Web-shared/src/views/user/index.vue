<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { fetchStoreOptions } from '../../api/store';
import { createUser, fetchUsers, removeUser, resetUserPassword, updateUser } from '../../api/user';
import PageHeader from '../../components/PageHeader.vue';
import TableEmpty from '../../components/TableEmpty.vue';
import TablePagination from '../../components/TablePagination.vue';
import { useListQuery } from '../../hooks/useListQuery';
import { useSession } from '../../session';
import {
  AccountBanSource,
  BAN_SOURCE_LABELS,
  COMMON_STATUS_OPTIONS,
  CommonStatus,
  Permission,
  ROLE_LABELS,
  Role,
  STAFF_ROLES,
} from '../../types/enums';
import type { Store } from '../../types/store';
import type { User, UserQuery } from '../../types/user';
import { formatDateTime, orEmpty } from '../../utils/format';

/**
 * 员工账号管理（商户后台）。
 *
 * 商家员工的编制由商家自己决定：本页面只处理**本商户**的账号，
 * 可见范围与可分配角色都由服务端按 Token 收口，前端不需要传 merchantId。
 *
 * 平台端不再复用本页 —— 平台管的是「平台账户」与「商家账户」两类，
 * 需要下钻某个商户的全部员工时走「商户管理 → 查看详情 → 员工账号」，
 * 那两处只能查看、封禁与重置密码。
 */

const session = useSession();

const canCreate = computed(() => session.hasPermission(Permission.USER_CREATE));
const canUpdate = computed(() => session.hasPermission(Permission.USER_UPDATE));
const canDelete = computed(() => session.hasPermission(Permission.USER_DELETE));

/**
 * 被平台封禁的账号，商户侧解不开（谁封的谁解）。
 * 开关要提前灰掉并说明原因，否则商家只会反复点击然后来问为什么没反应。
 */
function lockedByPlatform(row: User): boolean {
  return row.bannedBy === AccountBanSource.PLATFORM;
}

/** 门店管理员与收银员必须归属具体门店 */
function roleNeedsStore(role: Role | undefined): boolean {
  return role === Role.STORE_MANAGER || role === Role.CASHIER;
}

/** 商家自己只能开通员工；商户管理员由平台在建商户时开通，这里不出现该选项 */
const roleOptions = STAFF_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/**
 * 商户管理员账号在本页只读：既不改自己也不改同级的另一个管理员。
 * 要处置商家管理员走平台端「商家账户」+「商户详情 → 账号」（封禁 / 重置密码）。
 */
function isReadOnlyAccount(row: User): boolean {
  return row.role === Role.MERCHANT_ADMIN;
}

/** 商家端不能动这个开关的两种情况：管理员账号本身，或被平台封禁的员工 */
function statusLocked(row: User): boolean {
  return isReadOnlyAccount(row) || lockedByPlatform(row);
}

function roleLabelOf(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

/* ---------------- 下拉数据 ---------------- */

const storeOptions = ref<Store[]>([]);

function storeName(id: number | null): string {
  if (id === null) {
    return '全部门店';
  }
  return storeOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

async function loadStoreOptions(): Promise<void> {
  try {
    storeOptions.value = await fetchStoreOptions();
  } catch {
    storeOptions.value = [];
  }
}

/* ---------------- 列表 ---------------- */

const defaultQuery: UserQuery = {
  page: 1,
  pageSize: 10,
  storeId: undefined,
  keyword: '',
  role: undefined,
  status: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(fetchUsers, defaultQuery);

/** el-table 插槽的 row 为宽松类型，按索引取回强类型行 */
function rowAt(index: number): User {
  return list.value[index];
}

const isFiltered = computed(
  () =>
    Boolean(query.keyword) ||
    query.status !== undefined ||
    query.role !== undefined ||
    query.storeId !== undefined,
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

interface UserForm {
  id: number | null;
  storeId: number | undefined;
  username: string;
  password: string;
  nickname: string;
  phone: string;
  role: Role;
  status: CommonStatus;
  /** 该账号被平台封禁时，商户侧不给改状态（谁封的谁解） */
  statusLocked: boolean;
}

function createEmptyForm(): UserForm {
  return {
    id: null,
    storeId: undefined,
    username: '',
    password: '',
    nickname: '',
    phone: '',
    role: Role.CASHIER,
    status: CommonStatus.ENABLED,
    statusLocked: false,
  };
}

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<UserForm>(createEmptyForm());

const rules = computed<FormRules<UserForm>>(() => ({
  storeId: roleNeedsStore(form.role)
    ? [{ required: true, message: '该角色必须选择所属门店', trigger: 'change' }]
    : [],
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { max: 32, message: '用户名最长 32 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入初始密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
    { max: 32, message: '密码最长 32 位', trigger: 'blur' },
  ],
  nickname: [
    { required: true, message: '请输入姓名 / 昵称', trigger: 'blur' },
    { max: 32, message: '姓名最长 32 个字符', trigger: 'blur' },
  ],
  phone: [{ max: 20, message: '手机号最长 20 个字符', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
}));

const dialogTitle = computed(() => (form.id === null ? '新增员工账号' : '编辑员工账号'));

function handleDialogOpened(): void {
  formRef.value?.clearValidate();
}

/** 角色切换后若不再需要门店，清掉已选门店，避免提交脏数据 */
watch(
  () => form.role,
  (role) => {
    if (!roleNeedsStore(role)) {
      form.storeId = undefined;
    }
  },
);

function openCreate(): void {
  Object.assign(form, createEmptyForm());
  dialogVisible.value = true;
}

function openEdit(row: User): void {
  Object.assign(form, {
    id: row.id,
    storeId: row.storeId ?? undefined,
    username: row.username,
    password: '',
    nickname: row.nickname,
    phone: row.phone ?? '',
    role: row.role,
    status: row.status,
    statusLocked: lockedByPlatform(row),
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
      await createUser({
        storeId: roleNeedsStore(form.role) ? form.storeId : undefined,
        username: form.username.trim(),
        password: form.password,
        nickname: form.nickname.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
      });
      ElMessage.success('员工账号已创建');
    } else {
      await updateUser(form.id, {
        nickname: form.nickname.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        storeId: roleNeedsStore(form.role) ? form.storeId : undefined,
        status: form.statusLocked ? undefined : form.status,
      });
      ElMessage.success('员工账号已更新');
    }

    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

/* ---------------- 重置密码 ---------------- */

const resetDialogVisible = ref(false);
const resetting = ref(false);
const resetFormRef = ref<FormInstance>();
const resetTarget = ref<User | null>(null);
const resetForm = reactive({ newPassword: '', confirmPassword: '' });

const resetRules: FormRules<typeof resetForm> = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
    { max: 32, message: '密码最长 32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value !== resetForm.newPassword) {
          callback(new Error('两次输入的密码不一致'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

function openResetPassword(row: User): void {
  resetTarget.value = row;
  resetForm.newPassword = '';
  resetForm.confirmPassword = '';
  resetDialogVisible.value = true;
}

async function handleResetPassword(): Promise<void> {
  const valid = await resetFormRef.value?.validate().catch(() => false);
  if (!valid || !resetTarget.value) {
    return;
  }

  resetting.value = true;
  try {
    await resetUserPassword(resetTarget.value.id, { newPassword: resetForm.newPassword });
    ElMessage.success(`已重置「${resetTarget.value.nickname}」的密码`);
    resetDialogVisible.value = false;
  } finally {
    resetting.value = false;
  }
}

/* ---------------- 状态切换 / 删除 ---------------- */

async function handleStatusChange(row: User, next: boolean): Promise<void> {
  const status = next ? CommonStatus.ENABLED : CommonStatus.DISABLED;
  try {
    // 用服务端回写结果刷新整行：封禁归属（bannedBy）只有服务端知道
    Object.assign(row, await updateUser(row.id, { status }));
    ElMessage.success(next ? '账号已启用' : '账号已封禁');
  } catch {
    // 失败时保持原状态
  }
}

async function handleDelete(row: User): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除账号「${row.nickname}（${row.username}）」吗？删除后该账号将无法登录。`,
      '删除员工账号',
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

  await removeUser(row.id);
  ElMessage.success('员工账号已删除');

  if (list.value.length === 1 && query.page > 1) {
    query.page -= 1;
  }
  await load();
}

onMounted(async () => {
  await loadStoreOptions();
  await load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="员工账号"
      description="本商户的员工由商家自行创建开通：管理员可开门店管理员与收银员，门店管理员只能看本店员工。封禁即时生效，被禁账号手里的旧登录态一并失效"
    >
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">
          新增员工账号
        </el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
        <el-select v-model="query.storeId" class="filters__field" placeholder="全部门店" clearable filterable>
          <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>

        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索用户名 / 姓名"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />

        <el-select v-model="query.role" class="filters__field" placeholder="全部角色" clearable>
          <el-option
            v-for="option in roleOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
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
        <el-table-column label="账号" min-width="200">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ row.nickname }}</span>
              <span class="cell-stack__sub num">{{ row.username }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="角色" width="120">
          <template #default="{ row }">
            <el-tag effect="plain" size="small" round>{{ row.roleLabel || roleLabelOf(row.role) }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="所属门店" min-width="140">
          <template #default="{ row }">
            <span>{{ storeName(row.storeId) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="手机号" width="140">
          <template #default="{ row }">
            <span class="num" :class="{ 'empty-cell': !row.phone }">{{ orEmpty(row.phone) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="启用" width="170" align="center">
          <template #default="{ row, $index }">
            <el-switch
              :model-value="row.status === CommonStatus.ENABLED"
              :disabled="!canUpdate || statusLocked(rowAt($index))"
              @change="(value: string | number | boolean) => handleStatusChange(rowAt($index), Boolean(value))"
            />
            <el-tag v-if="row.bannedBy" class="ban-tag" type="warning" effect="plain" size="small">
              {{ BAN_SOURCE_LABELS[row.bannedBy as AccountBanSource] }}封禁
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="最后登录" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ row.lastLoginAt ? formatDateTime(row.lastLoginAt) : '从未登录' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ $index }">
            <!-- 商户管理员账号在商户端只读：能改同级管理员就等于能把自己换成别人 -->
            <div v-if="!isReadOnlyAccount(rowAt($index))" class="table-actions">
              <el-button v-if="canUpdate" link type="primary" @click="openEdit(rowAt($index))">
                编辑
              </el-button>
              <el-button v-if="canUpdate" link type="primary" @click="openResetPassword(rowAt($index))">
                重置密码
              </el-button>
              <el-button v-if="canDelete" link type="danger" @click="handleDelete(rowAt($index))">
                删除
              </el-button>
            </div>
            <span v-else class="muted">请联系平台</span>
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

    <!-- 新增 / 编辑 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="560px"
      :close-on-click-modal="false"
      @opened="handleDialogOpened"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="104px">
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%">
            <el-option
              v-for="option in roleOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <p class="form-hint">商户管理员可管理全部门店与员工；门店管理员与收银员必须绑定门店，且只看得见本店数据。</p>
        </el-form-item>

        <el-form-item v-if="roleNeedsStore(form.role)" label="所属门店" prop="storeId">
          <el-select v-model="form.storeId" placeholder="请选择门店" filterable style="width: 100%">
            <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>

        <template v-if="form.id === null">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" placeholder="全平台唯一，登录用" maxlength="32" />
          </el-form-item>

          <el-form-item label="初始密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="6 ~ 32 位"
              maxlength="32"
              show-password
            />
          </el-form-item>
        </template>

        <el-form-item label="姓名 / 昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="例如：李四" maxlength="32" />
        </el-form-item>

        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" placeholder="选填" maxlength="20" />
        </el-form-item>

        <el-form-item v-if="form.id !== null && !form.statusLocked" label="启用状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="CommonStatus.ENABLED">启用</el-radio>
            <el-radio :value="CommonStatus.DISABLED">封禁</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="form.statusLocked" label="启用状态">
          <p class="form-hint">该账号已被平台封禁，只能由平台解封。</p>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="resetDialogVisible" title="重置密码" width="460px" :close-on-click-modal="false">
      <p class="reset-tip">
        将为账号
        <strong>{{ resetTarget?.nickname }}</strong>
        （<span class="num">{{ resetTarget?.username }}</span>）设置新密码，原密码立即失效，
        该账号已登录的会话也会一并下线。
      </p>
      <el-form ref="resetFormRef" :model="resetForm" :rules="resetRules" label-width="82px">
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="resetForm.newPassword"
            type="password"
            placeholder="6 ~ 32 位"
            maxlength="32"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="resetForm.confirmPassword"
            type="password"
            placeholder="再次输入新密码"
            maxlength="32"
            show-password
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="resetDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetting" @click="handleResetPassword">
          确认重置
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.reset-tip {
  margin-bottom: var(--space-4);
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background-color: var(--brand-50);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-regular);

  strong {
    color: var(--brand-700);
    font-weight: 600;
  }
}
</style>
