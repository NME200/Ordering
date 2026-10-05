<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { createUser, fetchUsers, removeUser, resetUserPassword, updateUser } from '@shared/api/user';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { useSession } from '@shared/session';
import {
  AccountKind,
  COMMON_STATUS_OPTIONS,
  CommonStatus,
  GRANTABLE_PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PLATFORM_ROLES,
  Permission,
  ROLE_LABELS,
  Role,
} from '@shared/types/enums';
import type { User, UserQuery } from '@shared/types/user';
import { formatDateTime, orEmpty } from '@shared/utils/format';

/**
 * 平台账户管理（平台自己的团队）。
 *
 * 这一页只有平台管理员进得来（路由用 `meta.roles` 而非权限点把关）：
 * 页面里最关键的动作是「给运营专员授权」，如果授权入口本身可被授权下放，
 * 被授权的人就能给自己加码，这道授权也就失去意义了。
 *
 * 运营专员的能力**完全**来自下面的勾选清单：角色本身不带任何权限点，
 * 一个新开的运营专员登录后什么都看不到，这是预期而不是 bug。
 */

const session = useSession();

const canCreate = computed(() => session.hasPermission(Permission.USER_CREATE));
const canUpdate = computed(() => session.hasPermission(Permission.USER_UPDATE));
const canDelete = computed(() => session.hasPermission(Permission.USER_DELETE));

/** 平台侧可分配的角色 */
const roleOptions = PLATFORM_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

function roleLabelOf(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * 平台管理员账号在本页是只读的：不可禁用、不可编辑 / 授权、不可删除。
 * 他是唯一的授权方与上锁人，动他就等于动整个平台的控制权。
 */
function isProtected(row: User): boolean {
  return row.role === Role.PLATFORM_ADMIN;
}

/** 授权列的展示口径：NULL 表示沿用角色默认 */
function permissionSummary(row: User): string {
  if (row.role === Role.PLATFORM_ADMIN) {
    return '角色默认（全量治理权限）';
  }
  return row.permissions === null ? '未授权' : `已授权 ${row.permissions.length} 项`;
}

/* ---------------- 列表 ---------------- */

const defaultQuery: UserQuery = {
  page: 1,
  pageSize: 10,
  keyword: '',
  role: undefined,
  status: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(
  (params: UserQuery) => fetchUsers({ ...params, accountKind: AccountKind.PLATFORM }),
  defaultQuery,
);

/** el-table 插槽的 row 为宽松类型，按索引取回强类型行 */
function rowAt(index: number): User {
  return list.value[index];
}

const isFiltered = computed(
  () => Boolean(query.keyword) || query.status !== undefined || query.role !== undefined,
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

interface AccountForm {
  id: number | null;
  username: string;
  password: string;
  nickname: string;
  phone: string;
  role: Role;
  status: CommonStatus;
  permissions: Permission[];
}

function createEmptyForm(): AccountForm {
  return {
    id: null,
    username: '',
    password: '',
    nickname: '',
    phone: '',
    role: Role.PLATFORM_OPERATOR,
    status: CommonStatus.ENABLED,
    permissions: [],
  };
}

const dialogVisible = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<AccountForm>(createEmptyForm());

/** 只有运营专员需要授权清单；平台管理员恒用角色默认 */
const needsGrant = computed(() => form.role === Role.PLATFORM_OPERATOR);

const rules = computed<FormRules<AccountForm>>(() => ({
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

const dialogTitle = computed(() => (form.id === null ? '新增平台账户' : '编辑平台账户'));

function handleDialogOpened(): void {
  formRef.value?.clearValidate();
}

/** 切回平台管理员时清掉勾选，避免把一份无效清单提交上去 */
watch(needsGrant, (needed) => {
  if (!needed) {
    form.permissions = [];
  }
});

function openCreate(): void {
  Object.assign(form, createEmptyForm());
  dialogVisible.value = true;
}

function openEdit(row: User): void {
  Object.assign(form, {
    id: row.id,
    username: row.username,
    password: '',
    nickname: row.nickname,
    phone: row.phone ?? '',
    role: row.role,
    status: row.status,
    permissions: [...(row.permissions ?? [])],
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
    const permissions = needsGrant.value ? form.permissions : undefined;
    if (form.id === null) {
      await createUser({
        username: form.username.trim(),
        password: form.password,
        nickname: form.nickname.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        permissions,
      });
      ElMessage.success('平台账户已创建');
    } else {
      await updateUser(form.id, {
        nickname: form.nickname.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        status: form.status,
        // 运营专员即使勾成空清单也要显式提交：空数组与 null 语义不同，
        // 前者是「一项能力都没给」，后者是「按角色默认放行」
        permissions: needsGrant.value ? form.permissions : undefined,
      });
      ElMessage.success('平台账户已更新');
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
    ElMessage.success(`已重置「${resetTarget.value.nickname}」的密码，其原登录态已下线`);
    resetDialogVisible.value = false;
  } finally {
    resetting.value = false;
  }
}

/* ---------------- 状态切换 / 删除 ---------------- */

async function handleStatusChange(row: User, next: boolean): Promise<void> {
  const status = next ? CommonStatus.ENABLED : CommonStatus.DISABLED;
  try {
    Object.assign(row, await updateUser(row.id, { status }));
    ElMessage.success(next ? '账号已启用' : '账号已禁用');
  } catch {
    // 失败时保持原状态
  }
}

async function handleDelete(row: User): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除平台账户「${row.nickname}（${row.username}）」吗？删除后该账号将无法登录。`,
      '删除平台账户',
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
  ElMessage.success('平台账户已删除');

  if (list.value.length === 1 && query.page > 1) {
    query.page -= 1;
  }
  await load();
}

onMounted(load);
</script>

<template>
  <div class="page">
    <PageHeader
      title="平台账户"
      description="平台自己的团队账号。运营专员的能力全部由下方的授权清单决定，勾一项才有一项；商家及其员工不在此列，走「商家账户」或商户详情下钻"
    >
      <template #actions>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">
          新增平台账户
        </el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
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

        <el-table-column label="角色" width="130">
          <template #default="{ row }">
            <el-tag
              :type="row.role === 'platform_admin' ? 'warning' : 'info'"
              effect="plain"
              size="small"
              round
            >
              {{ row.roleLabel || roleLabelOf(row.role) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="能力来源" min-width="180">
          <template #default="{ $index }">
            <span class="muted">{{ permissionSummary(rowAt($index)) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="手机号" width="140">
          <template #default="{ row }">
            <span class="num" :class="{ 'empty-cell': !row.phone }">{{ orEmpty(row.phone) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="启用" width="150" align="center">
          <template #default="{ row, $index }">
            <el-switch
              :model-value="row.status === CommonStatus.ENABLED"
              :disabled="!canUpdate || isProtected(rowAt($index))"
              @change="(value: string | number | boolean) => handleStatusChange(rowAt($index), Boolean(value))"
            />
            <span v-if="isProtected(rowAt($index))" class="muted switch-hint">不可禁用</span>
          </template>
        </el-table-column>

        <el-table-column label="最后登录" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ row.lastLoginAt ? formatDateTime(row.lastLoginAt) : '从未登录' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <!-- 管理员账号只读：能改他就等于能把自己换掉或裁权，只留重置密码作为找回手段 -->
              <el-button
                v-if="canUpdate && !isProtected(rowAt($index))"
                link
                type="primary"
                @click="openEdit(rowAt($index))"
              >
                编辑 / 授权
              </el-button>
              <el-button v-if="canUpdate" link type="primary" @click="openResetPassword(rowAt($index))">
                重置密码
              </el-button>
              <el-button
                v-if="canDelete && !isProtected(rowAt($index))"
                link
                type="danger"
                @click="handleDelete(rowAt($index))"
              >
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

    <!-- 新增 / 编辑 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="720px"
      :close-on-click-modal="false"
      @opened="handleDialogOpened"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%">
            <el-option
              v-for="option in roleOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <p class="form-hint">
            平台管理员拥有全部治理权限且不可裁剪；运营专员只做下面勾出来的事。
          </p>
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
          <el-input v-model="form.nickname" placeholder="例如：王小明" maxlength="32" />
        </el-form-item>

        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" placeholder="选填" maxlength="20" />
        </el-form-item>

        <el-form-item v-if="form.id !== null && form.role !== Role.PLATFORM_ADMIN" label="启用状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="CommonStatus.ENABLED">启用</el-radio>
            <el-radio :value="CommonStatus.DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="needsGrant" label="授权">
          <div class="grant">
            <!-- 单一 checkbox-group 包住三个分区：分组只是视觉排布，勾选结果是一份扁平清单 -->
            <el-checkbox-group v-model="form.permissions" class="grant__grid">
              <div v-for="group in GRANTABLE_PERMISSION_GROUPS" :key="group.label" class="grant__group">
                <p class="grant__title">{{ group.label }}</p>
                <el-checkbox
                  v-for="item in group.options"
                  :key="item"
                  :value="item"
                  class="grant__item"
                >
                  {{ PERMISSION_LABELS[item] }}
                </el-checkbox>
              </div>
            </el-checkbox-group>
            <p class="form-hint">
              资金级凭据（支付配置）、账号的新增与删除、以及一切经营类写权限不在可授权范围内 ——
              平台是治理方，不是代商家经营的一方。
            </p>
          </div>
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
.switch-hint {
  margin-left: 8px;
  font-size: 12px;
}

.grant {
  width: 100%;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: var(--space-3);
  }

  &__group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background-color: var(--neutral-25);
  }

  &__title {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
  }

  &__item {
    margin-right: 0;
  }
}

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
