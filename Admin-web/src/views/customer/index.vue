<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Lock, Refresh, Search, Unlock } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchMerchantOptions } from '@shared/api/merchant';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { CommonStatus, Permission } from '@shared/types/enums';
import type { Merchant } from '@shared/types/merchant';
import { fenToYuan, formatDateTime, orEmpty } from '@shared/utils/format';
import { fetchCustomers, updateCustomerStatus } from '@/api/marketing';
import type { CustomerQuery, CustomerRow } from '@/types/marketing';
import { useUserStore } from '@/store/modules/user';

/**
 * 平台管理端 · 顾客名册（含封禁 / 解封）。
 *
 * 顾客账号是**全平台账号**：一个账号能在平台下所有商户下单，会员资产才按商户分档。
 * 所以封禁这件事只在平台做 —— 让一家店封一个账号，等于替整个平台决定这个人
 * 还能不能消费。商家端已经没有这个页面与权限。
 *
 * 会员资产（积分 / 余额 / 成长值 / 等级 / 订单数）是**按商户建档**的：
 * 不带 merchantId 时后端拿不到档案，这几列恒为 0、「等级」恒为「—」。
 * 因此给了商户筛选 —— 想查某个人的资产必须先选定他是哪家商户的会员；
 * 而「可用券张数」是全平台口径，不选商户也照样是准的。
 */

const userStore = useUserStore();
const canBan = computed(() => userStore.hasPermission(Permission.CUSTOMER_UPDATE));

const defaultQuery: CustomerQuery = {
  page: 1,
  pageSize: 10,
  keyword: '',
  status: undefined,
  merchantId: undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(fetchCustomers, defaultQuery);

/** 平台口径下这个状态位叫封禁，不复用通用「启用 / 禁用」文案 */
const STATE_OPTIONS = [
  { value: CommonStatus.ENABLED, label: '正常' },
  { value: CommonStatus.DISABLED, label: '已封禁' },
];

const isFiltered = computed(
  () => Boolean(query.keyword) || query.status !== undefined || query.merchantId !== undefined,
);

/** 选中商户后会员资产列才有意义，空态文案跟着换口径 */
const emptyHint = computed(() =>
  isFiltered.value
    ? '试试放宽关键字或换个商户，顾客是的全平台账号，不随商户过滤掉'
    : '顾客在小程序首次登录时自动建档，这里没有新增入口 —— 平台不是注册渠道',
);

/* ---------------- 商户筛选（会员资产的归属维度） ---------------- */

const merchants = ref<Merchant[]>([]);

async function loadMerchants(): Promise<void> {
  try {
    merchants.value = await fetchMerchantOptions();
  } catch {
    merchants.value = [];
  }
}

function handlePageChange(page: number): void {
  query.page = page;
  void load();
}

function handlePageSizeChange(size: number): void {
  query.pageSize = size;
  query.page = 1;
  void load();
}

/** 换商户等于换一套会员档案，回到第 1 页重查 */
function handleMerchantChange(): void {
  search();
}

/** el-table 插槽给的 row 是 DefaultRow，取行统一走这个函数保证类型 */
function rowAt(index: number): CustomerRow {
  return list.value[index];
}

/**
 * 封禁 / 解封。
 *
 * 确认框必须讲清后果：封禁会自增会话版本号，顾客手里的令牌**立即全部失效**，
 * 小程序会被踢回登录页；而且这是全平台生效的 —— 不是只在这家商户下不了单。
 */
async function handleToggleStatus(row: CustomerRow): Promise<void> {
  const banning = row.status === CommonStatus.ENABLED;
  const name = row.nickname ?? `食客${String(row.id).padStart(4, '0')}`;

  try {
    await ElMessageBox.confirm(
      banning
        ? `确定封禁「${name}」吗？这是全平台账号：封禁后他在「所有商户」的登录令牌立即失效，无法下单、领券、开票与咨询客服。`
        : `确定解封「${name}」吗？解封后对方可以重新登录小程序。`,
      banning ? '封禁顾客' : '解封顾客',
      {
        type: 'warning',
        confirmButtonText: banning ? '确认封禁' : '确认解封',
        cancelButtonText: '取消',
        confirmButtonClass: banning ? 'el-button--danger' : undefined,
      },
    );
  } catch {
    return;
  }

  try {
    await updateCustomerStatus(row.id, banning ? CommonStatus.DISABLED : CommonStatus.ENABLED);
    ElMessage.success(banning ? '已封禁，对方令牌已失效' : '已解封');
    await load();
  } catch {
    // 失败保持原样；服务端原因已由请求层弹出
  }
}

onMounted(async () => {
  await Promise.all([load(), loadMerchants()]);
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="顾客列表"
      description="全平台注册顾客的名册。手机号后端已打码；顾客账号归平台，封禁与解封只在这里做，商家端看不到这份名册"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索手机号 / 昵称"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />

        <el-select
          v-model="query.status"
          class="filters__field"
          placeholder="全部状态"
          clearable
          @change="search"
        >
          <el-option
            v-for="option in STATE_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <el-select
          v-model="query.merchantId"
          class="filters__field"
          placeholder="全平台（不看会员资产）"
          clearable
          filterable
          @change="handleMerchantChange"
        >
          <el-option v-for="item in merchants" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>

        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="reset">重置</el-button>
      </div>

      <p v-if="query.merchantId === undefined" class="scope-note">
        未指定商户时，积分 / 余额 / 成长值 / 等级 / 订单数这五列后端拿不到会员档案，恒为 0 与「—」——
        那不是顾客没有资产，是平台视角下这些资产还没有归属。选定一个商户即可看到他在该商户名下的真实数值。
      </p>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="ID" width="80">
          <template #default="{ row }">
            <span class="num muted">{{ row.id }}</span>
          </template>
        </el-table-column>

        <el-table-column label="昵称" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ orEmpty(row.nickname) }}</template>
        </el-table-column>

        <el-table-column label="手机号" width="140">
          <template #default="{ row }">
            <!-- 后端已打码，原样显示即可，前端不做任何还原或补全 -->
            <span v-if="row.phoneBound" class="num">{{ row.phone }}</span>
            <span v-else class="empty-cell">未绑定</span>
          </template>
        </el-table-column>

        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="积分" width="100" align="right">
          <template #default="{ row }">
            <span class="num">{{ row.point }}</span>
          </template>
        </el-table-column>

        <el-table-column label="余额" width="110" align="right">
          <template #default="{ row }">
            <span class="num">¥ {{ fenToYuan(row.balance) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="成长值" width="100" align="right">
          <template #default="{ row }">
            <span class="num">{{ row.growth }}</span>
          </template>
        </el-table-column>

        <el-table-column label="等级" width="100" align="center">
          <template #default="{ row }">{{ row.levelName }}</template>
        </el-table-column>

        <el-table-column label="订单数" width="100" align="right">
          <template #default="{ row }">
            <span class="num">{{ row.orderCount }}</span>
          </template>
        </el-table-column>

        <el-table-column label="可用券" width="100" align="right">
          <template #default="{ row }">
            <span class="num">{{ row.couponCount }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              :type="row.status === CommonStatus.ENABLED ? 'success' : 'danger'"
              effect="light"
              size="small"
              round
            >
              {{ row.status === CommonStatus.ENABLED ? '正常' : '已封禁' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column v-if="canBan" label="操作" width="120" align="center" fixed="right">
          <template #default="{ $index }">
            <el-button
              link
              :type="rowAt($index).status === CommonStatus.ENABLED ? 'danger' : 'primary'"
              :icon="rowAt($index).status === CommonStatus.ENABLED ? Lock : Unlock"
              @click="handleToggleStatus(rowAt($index))"
            >
              {{ rowAt($index).status === CommonStatus.ENABLED ? '封禁' : '解封' }}
            </el-button>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty :filtered="isFiltered" :hint="emptyHint" />
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
  </div>
</template>

<style scoped lang="scss">
.scope-note {
  margin: 0;
  padding: 10px var(--space-5);
  border-bottom: 1px solid var(--neutral-100);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  background-color: var(--neutral-50);
}
</style>
