<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { fetchMerchantOptions } from '@shared/api/merchant';
import { fetchStoreOptions } from '@shared/api/store';
import { fetchUsers, resetUserPassword, updateUser } from '@shared/api/user';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { useSession } from '@shared/session';
import { AccountBanSource, AccountKind, BAN_SOURCE_LABELS, CommonStatus, Permission, ROLE_LABELS } from '@shared/types/enums';
import type { Merchant } from '@shared/types/merchant';
import type { Store } from '@shared/types/store';
import type { User, UserQuery } from '@shared/types/user';
import { formatDateTime, orEmpty } from '@shared/utils/format';

/**
 * 商家账户治理列表（平台端）。
 *
 * 平台对商家账号**只有两件事可做**：封禁 / 解封、重置密码。
 * 新增、编辑资料、删除都不在这里 —— 商家员工的编制属于商家自己。
 * 所以本页没有「新增」按钮，也没有编辑弹窗。
 *
 * 两种用法共用本组件：
 * - 侧边栏「商家账户」：`accountKind = merchant_admin`，跨商户只看各商户的管理员；
 * - 「商户详情 → 员工账号」：传 `merchantId` + `embedded`，下钻该商户全部员工。
 */
const props = defineProps<{
  /** 账户分类；不传表示不限角色（商户详情下钻用） */
  accountKind?: AccountKind;
  /** 固定到某个商户 */
  merchantId?: number;
  /** 内嵌形态：去掉页头、隐藏商户列 */
  embedded?: boolean;
}>();

const session = useSession();

const canGovern = computed(() => session.hasPermission(Permission.USER_UPDATE));

/** 平台口径下这个动作叫封禁，不复用商户侧的「禁用」文案 */
const STATE_OPTIONS = [
  { value: CommonStatus.ENABLED, label: '正常' },
  { value: CommonStatus.DISABLED, label: '已封禁' },
];

const showMerchantColumn = computed(() => props.merchantId === undefined);
const showStoreColumn = computed(() => props.accountKind === undefined);

function roleLabelOf(role: keyof typeof ROLE_LABELS): string {
  return ROLE_LABELS[role];
}

/* ---------------- 下拉数据 ---------------- */

const merchantOptions = ref<Merchant[]>([]);
const storeOptions = ref<Store[]>([]);

function merchantName(id: number | null): string {
  if (id === null) {
    return '平台级';
  }
  return merchantOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

function storeName(id: number | null): string {
  if (id === null) {
    return '—';
  }
  return storeOptions.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

async function loadOptions(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (showMerchantColumn.value) {
    tasks.push(
      fetchMerchantOptions()
        .then((rows) => {
          merchantOptions.value = rows;
        })
        .catch(() => {
          merchantOptions.value = [];
        }),
    );
  }
  if (showStoreColumn.value) {
    tasks.push(
      fetchStoreOptions(props.merchantId)
        .then((rows) => {
          storeOptions.value = rows;
        })
        .catch(() => {
          storeOptions.value = [];
        }),
    );
  }
  await Promise.all(tasks);
}

/* ---------------- 列表 ---------------- */

const defaultQuery: UserQuery = {
  page: 1,
  pageSize: 10,
  keyword: '',
  status: undefined,
};

/**
 * 分类与商户归属由调用方固定，注入在取数函数里而不是查询表单中：
 * 「重置」只该清掉用户自己填的筛选，不能把页面赖以成立的租户约束一起抹掉。
 */
const { list, total, loading, query, load, search, reset } = useListQuery(
  (params: UserQuery) => fetchUsers({ ...params, merchantId: props.merchantId, accountKind: props.accountKind }),
  defaultQuery,
);

function rowAt(index: number): User {
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

/* ---------------- 封禁 / 解封 ---------------- */

async function handleStatusChange(row: User, next: boolean): Promise<void> {
  const status = next ? CommonStatus.ENABLED : CommonStatus.DISABLED;
  try {
    // 用服务端回写结果刷新整行：封禁归属（bannedBy）只有服务端知道
    Object.assign(row, await updateUser(row.id, { status }));
    ElMessage.success(next ? '账号已解封' : '账号已封禁');
  } catch {
    // 失败时保持原状态
  }
}

onMounted(async () => {
  await loadOptions();
  await load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      v-if="!embedded"
      title="商家账户"
      description="各商户的管理员账号。平台只做止血动作 —— 封禁 / 解封与重置密码；员工的增删改由商家在商户后台自行完成，需要看全部员工请从「商户管理 → 查看详情 → 账号」下钻"
    />

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

        <el-select v-model="query.status" class="filters__field" placeholder="全部状态" clearable>
          <el-option v-for="option in STATE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
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

        <el-table-column v-if="showMerchantColumn" label="所属商户" min-width="150">
          <template #default="{ row }">{{ merchantName(row.merchantId) }}</template>
        </el-table-column>

        <el-table-column v-if="showStoreColumn" label="所属门店" min-width="130">
          <template #default="{ row }">{{ storeName(row.storeId) }}</template>
        </el-table-column>

        <el-table-column label="手机号" width="140">
          <template #default="{ row }">
            <span class="num" :class="{ 'empty-cell': !row.phone }">{{ orEmpty(row.phone) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="170" align="center">
          <template #default="{ row, $index }">
            <!-- 平台是上级：商家封的号平台也能解，所以这里不因封禁方而灰掉开关 -->
            <el-switch
              :model-value="row.status === CommonStatus.ENABLED"
              :disabled="!canGovern"
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

        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button v-if="canGovern" link type="primary" @click="openResetPassword(rowAt($index))">
                重置密码
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

    <!-- 重置密码 -->
    <el-dialog v-model="resetDialogVisible" title="重置商家账号密码" width="460px" :close-on-click-modal="false">
      <p class="reset-tip">
        将为账号
        <strong>{{ resetTarget?.nickname }}</strong>
        （<span class="num">{{ resetTarget?.username }}</span>）设置新密码。
        原密码立即失效，该账号已登录的会话一并下线。
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
.ban-tag {
  margin-left: 8px;
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
