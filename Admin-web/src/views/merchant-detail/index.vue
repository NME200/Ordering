<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { fetchMerchant } from '@shared/api/merchant';
import PageHeader from '@shared/components/PageHeader.vue';
import StatusTag from '@shared/components/StatusTag.vue';
import DishCategoryList from '@shared/views/dish-category/index.vue';
import DishList from '@shared/views/dish/index.vue';
import SpecGroupList from '@shared/views/spec-group/index.vue';
import StoreList from '@shared/views/store/index.vue';
import MerchantAccounts from '@/views/account/merchant.vue';
import MerchantOrders from './orders.vue';
import { useUserStore } from '@/store/modules/user';
import { Permission } from '@shared/types/enums';
import type { Merchant } from '@shared/types/merchant';
import type { Store } from '@shared/types/store';
import { describeExpireAt, formatDateTime, orEmpty } from '@shared/utils/format';

/**
 * 商户详情（平台管理端）。
 *
 * 平台是「治理方」不是「经营者」：菜单只提供**只读排查视图**，
 * 经营维护（改菜单、接单、退款）由商户在 Merchant-web 完成 ——
 * 平台管理员对这些资源只有 read 权限，后端会拒绝任何写请求。
 *
 * 两个例外是平台自己的治理动作：
 * - 「门店」：可开通 / 禁用 / 删除，但改不了门店资料（平台无 `store:update`）；
 *   平台禁用后商户解不开，只能由平台恢复。
 * - 「账号」：可对这家的任意员工封禁 / 解封与重置密码。
 *
 * 「订单」页签是纯只读下钻，从门店列表点「订单」会带着那家门店进来。
 *
 * 复用方式：直接内嵌各业务列表页，并传入 `embedded` + `readonly` + `merchantId`。
 */
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const merchantId = computed(() => Number(route.params.id));

/**
 * 各页签按其读取权限显示，键名与 el-tab-pane 的 name 一一对应。
 *
 * 运营专员可能被授权 `merchant:read` 而没有被授权 `store:read`，
 * 此时对应接口会 403、页签里只剩一张空表 —— 隐藏比摆出来更诚实。
 */
const visibleTabs = computed(() => ({
  stores: userStore.hasPermission(Permission.STORE_READ),
  orders: userStore.hasPermission(Permission.ORDER_READ),
  accounts: userStore.hasPermission(Permission.USER_READ),
  categories: userStore.hasPermission(Permission.CATEGORY_READ),
  dishes: userStore.hasPermission(Permission.DISH_READ),
  'spec-groups': userStore.hasPermission(Permission.SPEC_READ),
}));

/** 默认落在第一个有权限看的页签，而不是一定是「门店」 */
const defaultTab = computed(
  () => Object.entries(visibleTabs.value).find(([, visible]) => visible)?.[0] ?? 'stores',
);

const merchant = ref<Merchant | null>(null);
const loading = ref(false);
const activeTab = ref(defaultTab.value);

/** 从门店列表下钻进「订单」时带过来的门店；undefined 表示该商户全部门店 */
const orderStoreId = ref<number | undefined>();

function viewOrders(store: Store): void {
  orderStoreId.value = store.id;
  activeTab.value = 'orders';
}

const expire = computed(() => describeExpireAt(merchant.value?.expireAt ?? null));

async function loadMerchant(): Promise<void> {
  loading.value = true;
  try {
    merchant.value = await fetchMerchant(merchantId.value);
  } catch {
    // 错误提示已由请求层统一处理（如 404 商户不存在）
    merchant.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadMerchant);
watch(merchantId, loadMerchant);
</script>

<template>
  <div class="page">
    <PageHeader
      :title="merchant?.name ?? '商户详情'"
      description="本页做商户治理：开通 / 禁用 / 删除门店，封禁或重置这家的员工账号；门店资料、菜单与订单流转由商户在商户后台维护，「订单」页签可按门店下钻排查"
    >
      <template #actions>
        <el-button :icon="ArrowLeft" @click="router.push('/merchants')">返回商户列表</el-button>
      </template>
    </PageHeader>

    <!-- 商户概览 -->
    <section v-loading="loading" class="panel summary">
      <template v-if="merchant">
        <div class="summary__head">
          <div class="summary__title">
            <h2>{{ merchant.name }}</h2>
            <StatusTag kind="common" :value="merchant.status" />
          </div>
          <span class="summary__id num">商户 ID #{{ merchant.id }}</span>
        </div>

        <dl class="summary__grid">
          <div class="summary__item">
            <dt>联系人</dt>
            <dd>{{ orEmpty(merchant.contactName) }}</dd>
          </div>
          <div class="summary__item">
            <dt>联系电话</dt>
            <dd class="num">{{ orEmpty(merchant.contactPhone) }}</dd>
          </div>
          <div class="summary__item">
            <dt>服务到期</dt>
            <dd class="num" :class="{ 'is-expired': expire.expired }">{{ expire.text }}</dd>
          </div>
          <div class="summary__item">
            <dt>创建时间</dt>
            <dd class="num">{{ formatDateTime(merchant.createdAt) }}</dd>
          </div>
          <div class="summary__item summary__item--wide">
            <dt>备注</dt>
            <dd>{{ orEmpty(merchant.remark) }}</dd>
          </div>
        </dl>
      </template>

      <el-empty v-else-if="!loading" description="商户不存在或已被删除" />
    </section>

    <!-- 业务数据只读标签页 -->
    <section v-if="merchant" class="panel panel--flush">
      <el-tabs v-model="activeTab" class="detail-tabs">
        <el-tab-pane v-if="visibleTabs.stores" label="门店" name="stores" lazy>
          <!-- 门店可开通 / 禁用 / 删除，但资料归商家（平台没有 store:update），所以不会出现「编辑」 -->
          <StoreList embedded :merchant-id="merchantId" @view-orders="viewOrders" />
        </el-tab-pane>
        <el-tab-pane v-if="visibleTabs.orders" label="订单" name="orders" lazy>
          <MerchantOrders :merchant-id="merchantId" :store-id="orderStoreId" />
        </el-tab-pane>
        <el-tab-pane v-if="visibleTabs.accounts" label="账号" name="accounts" lazy>
          <MerchantAccounts embedded :merchant-id="merchantId" />
        </el-tab-pane>
        <el-tab-pane v-if="visibleTabs.categories" label="菜品分类" name="categories" lazy>
          <DishCategoryList embedded readonly :merchant-id="merchantId" />
        </el-tab-pane>
        <el-tab-pane v-if="visibleTabs.dishes" label="菜品" name="dishes" lazy>
          <DishList embedded readonly :merchant-id="merchantId" />
        </el-tab-pane>
        <el-tab-pane v-if="visibleTabs['spec-groups']" label="规格组" name="spec-groups" lazy>
          <SpecGroupList embedded readonly :merchant-id="merchantId" />
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>

<style scoped lang="scss">
/* ---------------- 商户概览 ---------------- */
.summary {
  padding: var(--space-5);

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--neutral-100);
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 10px;

    h2 {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text-primary);
    }
  }

  &__id {
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-4) var(--space-5);
    margin: 0;
    padding-top: var(--space-4);
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    dt {
      font-size: 12px;
      color: var(--text-placeholder);
    }

    dd {
      margin: 0;
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-primary);
      overflow-wrap: anywhere;
    }
  }

  &__item--wide {
    grid-column: 1 / -1;
  }
}

.is-expired {
  color: var(--danger-500);
}

/* ---------------- 标签页 ---------------- */
.detail-tabs {
  :deep(.el-tabs__header) {
    margin-bottom: 0;
    padding: 0 var(--space-5);
    border-bottom: 1px solid var(--neutral-100);
  }

  :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }

  :deep(.el-tabs__item) {
    font-size: 13.5px;
    font-weight: 500;
  }

  :deep(.el-tabs__content) {
    padding: 0;
  }
}
</style>
