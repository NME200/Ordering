<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import TablePagination from '@shared/components/TablePagination.vue';
import { useListQuery } from '@shared/hooks/useListQuery';
import { fetchMerchantOptions } from '@shared/api/merchant';
import { fetchDishes } from '@shared/api/dish';
import { fetchDishCategoryOptions } from '@shared/api/dish-category';
import { DINING_TYPE_OPTIONS, Permission } from '@shared/types/enums';
import { formatDateTime } from '@shared/utils/format';
import type { DishCategory } from '@shared/types/dish-category';
import type { Merchant } from '@shared/types/merchant';
import { useUserStore } from '@/store/modules/user';
import {
  createPointActivity,
  fetchPointActivities,
  removePointActivity,
  updatePointActivity,
  updatePointActivityStatus,
} from '@/api/point-activity';
import {
  PHASE_LABELS,
  PHASE_TAG_TYPES,
  RULE_TYPE_LABELS,
  SCOPE_LABELS,
  pointActivityConditionText,
  pointActivityRuleText,
} from '@shared/types/point-activity';
import type {
  PointActivity,
  PointActivityPhase,
  PointActivityRuleType,
  PointActivityScope,
} from '@shared/types/point-activity';
import { MAX_BONUS_PERCENT, MAX_BONUS_POINT } from '@/types/point-activity';
import type { SavePointActivityPayload } from '@/types/point-activity';

/**
 * 平台管理端 · 积分活动。
 *
 * 这一屏只解决两件事：**规则怎么算**与**开不开**。发分本身不在这里做，
 * 也不在这里预览效果 —— 金额与分数一律服务端算，界面写出来的数字必须是库里真有的。
 *
 * 启停是独立动作（拨开关走 `PATCH /:id/status`），资料编辑碰不到它：
 * 否则「改个文案顺手把停掉的活动打开」会变成谁都没留意的操作。
 */
const userStore = useUserStore();
const canWrite = computed(() => userStore.hasPermission(Permission.POINT_ACTIVITY_UPDATE));

const merchants = ref<Merchant[]>([]);
const merchantName = (id: number): string =>
  merchants.value.find((item) => item.id === id)?.name ?? `商户 ${id}`;

/** 下拉只需要 id 与名字，不用整份实体 */
interface Option {
  id: number;
  name: string;
}

/**
 * 参与商品的下拉数据。
 *
 * 菜品**远程搜索**而不是一次拉全：平台端看得见全平台所有菜品，
 * 一个中型连锁就上千行，塞进 el-select 既卡也选不出想要的。
 * 已选项单独留一份，否则远程搜索一换关键字，之前选中的菜就只剩 ID 没有名字。
 */
const dishOptions = ref<Option[]>([]);
const dishLoading = ref(false);
const selectedDishes = ref<Option[]>([]);
const categoryOptions = ref<DishCategory[]>([]);

async function searchDishes(keyword: string): Promise<void> {
  dishLoading.value = true;
  try {
    const page = await fetchDishes({ page: 1, pageSize: 30, keyword: keyword || undefined });
    const picked = new Map<number, Option>();
    for (const dish of [...selectedDishes.value, ...page.list]) {
      picked.set(Number(dish.id), { id: Number(dish.id), name: dish.name });
    }
    dishOptions.value = [...picked.values()];
  } catch {
    dishOptions.value = [...selectedDishes.value];
  } finally {
    dishLoading.value = false;
  }
}

async function loadCategoryOptions(): Promise<void> {
  try {
    categoryOptions.value = await fetchDishCategoryOptions();
  } catch {
    categoryOptions.value = [];
  }
}

/** 编辑时把已选菜品并进候选，保证标签显示的是名字而不是一串 ID */
function seedSelected(row: PointActivity): void {
  const ids = row.conditions?.dishIds ?? [];
  selectedDishes.value = ids.map((id, index) => ({
    id: Number(id),
    name: row.dishNames?.[index] ?? `#${id}`,
  }));
  dishOptions.value = [...selectedDishes.value];
}

/* ---------------- 列表 ---------------- */

const defaultQuery = {
  page: 1,
  pageSize: 10,
  keyword: '',
  status: undefined as number | undefined,
  ruleType: undefined as PointActivityRuleType | undefined,
};

const { list, total, loading, query, load, search, reset } = useListQuery(
  fetchPointActivities,
  defaultQuery,
);

const isFiltered = computed(
  () => Boolean(query.keyword) || query.status !== undefined || query.ruleType !== undefined,
);

function rowAt(index: number): PointActivity {
  return list.value[index];
}

/* ---------------- 编辑弹窗 ---------------- */

const editorOpen = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);

const form = reactive({
  name: '',
  ruleType: 'multiplier' as PointActivityRuleType,
  orderBonusPercent: 100,
  reviewBonusPercent: 0,
  /** 界面按「元」读写，提交时转成分 */
  thresholdYuan: 50,
  bonusPoint: 50,
  window: null as [string, string] | null,
  scopeType: 'all' as PointActivityScope,
  merchantIds: [] as number[],
  /** 命中条件：空数组 = 不限 */
  dishIds: [] as number[],
  categoryIds: [] as number[],
  diningTypes: [] as number[],
  perCustomerCap: 0,
  bannerTitle: '',
  bannerDesc: '',
});

function openCreate(): void {
  editingId.value = null;
  Object.assign(form, {
    name: '',
    ruleType: 'multiplier',
    orderBonusPercent: 100,
    reviewBonusPercent: 0,
    thresholdYuan: 50,
    bonusPoint: 50,
    window: null,
    scopeType: 'all',
    merchantIds: [],
    dishIds: [],
    categoryIds: [],
    diningTypes: [],
    perCustomerCap: 0,
    bannerTitle: '',
    bannerDesc: '',
  });
  selectedDishes.value = [];
  dishOptions.value = [];
  editorOpen.value = true;
}

function openEdit(row: PointActivity): void {
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name,
    ruleType: row.ruleType,
    orderBonusPercent: row.rules.orderBonusPercent ?? 0,
    reviewBonusPercent: row.rules.reviewBonusPercent ?? 0,
    thresholdYuan: Math.floor((row.rules.thresholdCent ?? 0) / 100),
    bonusPoint: row.rules.bonusPoint ?? 0,
    window: [row.startTime, row.endTime] as [string, string],
    scopeType: row.scopeType,
    merchantIds: [...row.merchantIds],
    dishIds: [...(row.conditions?.dishIds ?? [])],
    categoryIds: [...(row.conditions?.categoryIds ?? [])],
    diningTypes: [...(row.conditions?.diningTypes ?? [])],
    perCustomerCap: row.perCustomerCap,
    bannerTitle: row.bannerTitle ?? '',
    bannerDesc: row.bannerDesc ?? '',
  });
  seedSelected(row);
  editorOpen.value = true;
}

/**
 * 按规则类型只提交属于它的那几个字段。
 *
 * 表单里两组控件共用一份状态（切类型不用重填），但后端会按 ruleType 拒掉
 * 未声明的多余字段，于是提交前必须裁一刀 —— 留着另一组的值还会在下次换类型时复活。
 */
function buildPayload(): SavePointActivityPayload {
  const base: SavePointActivityPayload = {
    name: form.name.trim(),
    ruleType: form.ruleType,
    startTime: form.window?.[0] ?? '',
    endTime: form.window?.[1] ?? '',
    scopeType: form.scopeType,
    merchantIds: form.scopeType === 'all' ? [] : [...form.merchantIds],
    /**
     * 命中条件**总是提交**（哪怕是空数组）：后端按「传没传」区分
     * 「取消这条限制」和「保持原样」，省略字段会让取消勾选变成没改过。
     */
    dishIds: [...form.dishIds],
    categoryIds: [...form.categoryIds],
    diningTypes: [...form.diningTypes],
    perCustomerCap: form.perCustomerCap,
  };
  if (form.bannerTitle.trim()) {
    base.bannerTitle = form.bannerTitle.trim();
  }
  if (form.bannerDesc.trim()) {
    base.bannerDesc = form.bannerDesc.trim();
  }
  if (form.ruleType === 'multiplier') {
    return {
      ...base,
      orderBonusPercent: form.orderBonusPercent,
      reviewBonusPercent: form.reviewBonusPercent,
    };
  }
  return {
    ...base,
    thresholdCent: form.thresholdYuan * 100,
    bonusPoint: form.bonusPoint,
  };
}

/** 界面先拦一层，给的是人话；后端仍然会再校验一次，那边才是准绳 */
function validate(): string {
  if (!form.name.trim()) {
    return '给活动起个名字，顾客和店员都看它';
  }
  if (!form.window) {
    return '选生效时间段，起止都不能少';
  }
  if (form.scopeType !== 'all' && form.merchantIds.length === 0) {
    return form.scopeType === 'include'
      ? '「仅指定商户」至少要勾一家，否则这个活动谁都碰不到'
      : '「排除指定商户」至少要勾一家；要全平台生效请选「全部商户」';
  }
  if (form.ruleType === 'multiplier') {
    if (form.orderBonusPercent <= 0 && form.reviewBonusPercent <= 0) {
      return '倍率的两个百分比不能都是 0，那样等于没做活动';
    }
    return '';
  }
  if (form.thresholdYuan < 1) {
    return '满额返的门槛至少 1 元';
  }
  if (form.bonusPoint > form.thresholdYuan * 3) {
    return `满 ${form.thresholdYuan} 元最多送 ${form.thresholdYuan * 3} 分（基础分的 3 倍）`;
  }
  return '';
}

async function submit(): Promise<void> {
  const message = validate();
  if (message) {
    ElMessage.warning(message);
    return;
  }
  saving.value = true;
  try {
    if (editingId.value === null) {
      await createPointActivity(buildPayload());
      ElMessage.success('活动已创建，记得回来打开开关');
    } else {
      await updatePointActivity(editingId.value, buildPayload());
      ElMessage.success('活动已更新');
    }
    editorOpen.value = false;
    await load();
  } catch {
    // 重叠 409 与规则校验的具体原因已由请求层弹出
  } finally {
    saving.value = false;
  }
}

async function toggle(row: PointActivity, enabled: boolean): Promise<void> {
  try {
    await updatePointActivityStatus(row.id, enabled ? 1 : 0);
    ElMessage.success(enabled ? '活动已启用' : '活动已停用');
  } catch {
    // 失败时下面统一 reload 把开关拨回库里的真实状态
  } finally {
    await load();
  }
}

async function remove(row: PointActivity): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.name}」吗？已发出去的积分流水会留在账上；如果这个活动已经发过分，删除会被拒绝，请改用停用。`,
      '删除活动',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await removePointActivity(row.id);
    ElMessage.success('活动已删除');
  } catch {
    // 409「已发放过积分」由请求层弹出
  } finally {
    await load();
  }
}

/* ---------------- 展示辅助 ---------------- */

function scopeSummary(row: PointActivity): string {
  if (row.scopeType === 'all') {
    return SCOPE_LABELS.all;
  }
  const names = row.merchantNames.length > 0 ? row.merchantNames : row.merchantIds.map(merchantName);
  const text = names.slice(0, 2).join('、');
  return `${SCOPE_LABELS[row.scopeType]}：${text}${names.length > 2 ? ` 等 ${names.length} 家` : ''}`;
}

onMounted(async () => {
  await Promise.all([
    (async () => {
      try {
        merchants.value = await fetchMerchantOptions();
      } catch {
        merchants.value = [];
      }
    })(),
    loadCategoryOptions(),
    load(),
  ]);
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="积分活动"
      description="平台一侧给全体顾客加发积分：倍率或满额返，二选一。同一时间一家商户只能压一个活动，规则与开关都只在平台端，商户后台只读"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">新建活动</el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <div class="filters">
        <el-input
          v-model="query.keyword"
          class="filters__field"
          placeholder="搜索活动名"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />
        <el-select
          v-model="query.ruleType"
          class="filters__field"
          placeholder="全部规则"
          clearable
          @change="search"
        >
          <el-option
            v-for="(label, value) in RULE_TYPE_LABELS"
            :key="value"
            :label="label"
            :value="value"
          />
        </el-select>
        <el-select
          v-model="query.status"
          class="filters__field"
          placeholder="全部状态"
          clearable
          @change="search"
        >
          <el-option label="已启用" :value="1" />
          <el-option label="已停用" :value="0" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="Refresh" @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" stripe>
        <el-table-column label="活动" min-width="200">
          <template #default="{ $index }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ rowAt($index).name }}</span>
              <span class="cell-stack__sub">{{ pointActivityRuleText(rowAt($index)) }}</span>
              <span class="cell-stack__sub">{{ pointActivityConditionText(rowAt($index)) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="规则" width="110">
          <template #default="{ row }">
            {{ RULE_TYPE_LABELS[row.ruleType as PointActivityRuleType] }}
          </template>
        </el-table-column>

        <el-table-column label="商户范围" min-width="180" show-overflow-tooltip>
          <template #default="{ $index }">{{ scopeSummary(rowAt($index)) }}</template>
        </el-table-column>

        <el-table-column label="每人上限" width="110" align="right">
          <template #default="{ row }">
            <span class="num">{{ row.perCustomerCap > 0 ? `${row.perCustomerCap} 分` : '不限' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="生效期" min-width="190">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-stack__main num">{{ formatDateTime(row.startTime) }}</span>
              <span class="cell-stack__sub num">至 {{ formatDateTime(row.endTime) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="阶段" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="PHASE_TAG_TYPES[row.phase as PointActivityPhase]" effect="light" size="small" round>
              {{ row.phaseLabel || PHASE_LABELS[row.phase as PointActivityPhase] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="已发（含扣回）" width="130" align="right">
          <template #default="{ row }">
            <div class="cell-stack cell-stack--right">
              <span class="cell-stack__main num">{{ row.grantedPoint }}</span>
              <span class="cell-stack__sub">{{ row.grantedCustomers }} 人参与</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row, $index }">
            <el-switch
              :model-value="row.status === 1"
              :disabled="!canWrite"
              @change="(value: string | number | boolean) => toggle(rowAt($index), Boolean(value))"
            />
          </template>
        </el-table-column>

        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ $index }">
            <div class="table-actions">
              <el-button v-if="canWrite" link type="primary" :icon="Edit" @click="openEdit(rowAt($index))">
                编辑
              </el-button>
              <el-button v-if="canWrite" link type="danger" :icon="Delete" @click="remove(rowAt($index))">
                删除
              </el-button>
              <span v-if="!canWrite" class="muted">只读</span>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty :filtered="isFiltered" hint="还没有活动；新建后记得回来拨开开关" />
        </template>
      </el-table>

      <TablePagination
        :total="total"
        :page="query.page"
        :page-size="query.pageSize"
        @page-change="
          (page: number) => {
            query.page = page;
            load();
          }
        "
        @size-change="
          (size: number) => {
            query.pageSize = size;
            query.page = 1;
            load();
          }
        "
      />
    </section>

    <el-dialog v-model="editorOpen" :title="editingId === null ? '新建积分活动' : '编辑积分活动'" width="640px">
      <el-form label-width="120px" label-position="right">
        <el-form-item label="活动名" required>
          <el-input v-model="form.name" maxlength="64" show-word-limit placeholder="顾客与店员看到的都是它" />
        </el-form-item>

        <el-form-item label="规则" required>
          <el-radio-group v-model="form.ruleType">
            <el-radio value="multiplier">积分倍率</el-radio>
            <el-radio value="threshold_bonus">满额返分</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="form.ruleType === 'multiplier'">
          <el-form-item label="下单加成 %">
            <el-input-number v-model="form.orderBonusPercent" :min="0" :max="MAX_BONUS_PERCENT" :step="10" />
            <span class="form-hint">在「1 元 = 1 分」的基础上再加的百分比。100 就是双倍</span>
          </el-form-item>
          <el-form-item label="评价加成 %">
            <el-input-number v-model="form.reviewBonusPercent" :min="0" :max="MAX_BONUS_PERCENT" :step="10" />
            <span class="form-hint">评价基础分 5 分，加 100% 就是 10 分</span>
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="单笔满（元）">
            <el-input-number v-model="form.thresholdYuan" :min="1" :step="10" />
            <span class="form-hint">按这一单的**实付金额**判，用券抵掉的部分不算</span>
          </el-form-item>
          <el-form-item label="额外送（分）">
            <el-input-number v-model="form.bonusPoint" :min="1" :max="MAX_BONUS_POINT" :step="10" />
            <span class="form-hint">上限是基础分的 3 倍，满 {{ form.thresholdYuan }} 元最多送 {{ form.thresholdYuan * 3 }} 分</span>
          </el-form-item>
        </template>

        <el-form-item label="生效时间" required>
          <el-date-picker
            v-model="form.window"
            type="datetimerange"
            value-format="YYYY-MM-DDTHH:mm:ss.000Z"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
          />
        </el-form-item>

        <el-form-item label="商户范围">
          <el-select v-model="form.scopeType" class="scope-select">
            <el-option
              v-for="(label, value) in SCOPE_LABELS"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-if="form.scopeType !== 'all'" :label="form.scopeType === 'include' ? '指定商户' : '排除商户'">
          <el-select v-model="form.merchantIds" multiple filterable placeholder="选择商户" class="scope-select">
            <el-option v-for="item in merchants" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="参与菜品">
          <el-select
            v-model="form.dishIds"
            multiple
            filterable
            remote
            reserve-keyword
            :remote-method="searchDishes"
            :loading="dishLoading"
            placeholder="留空表示全部菜品参与；输入关键字搜索"
            class="scope-select"
          >
            <el-option v-for="item in dishOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <span class="form-hint">与下面的分类是「或」关系：命中任一项就算参与</span>
        </el-form-item>

        <el-form-item label="参与分类">
          <el-select
            v-model="form.categoryIds"
            multiple
            filterable
            placeholder="留空表示不按分类限制"
            class="scope-select"
          >
            <el-option
              v-for="item in categoryOptions"
              :key="item.id"
              :label="`${item.name}（#${item.merchantId}）`"
              :value="item.id"
            />
          </el-select>
          <span class="form-hint">
            分类按菜品的**当前**归属判：菜后来换了分类，之后的新单就按新分类算
          </span>
        </el-form-item>

        <el-form-item label="就餐方式">
          <el-checkbox-group v-model="form.diningTypes">
            <el-checkbox v-for="item in DINING_TYPE_OPTIONS" :key="item.value" :value="item.value">
              {{ item.label }}
            </el-checkbox>
          </el-checkbox-group>
          <span class="form-hint">都不勾表示不限。只影响哪一单算数，不改价格</span>
        </el-form-item>

        <el-alert
          class="scope-note"
          type="info"
          :closable="false"
          show-icon
          title="选了菜品或分类后，倍率只算命中那几行的金额"
          description="其余菜品不吃补贴，商家才不会为一盘没参加活动的菜付钱；用券时命中金额按小计占比分摊实付。评价加成不受菜品条件约束，只跟着就餐方式走。"
        />

        <el-form-item label="每人上限">
          <el-input-number v-model="form.perCustomerCap" :min="0" :step="50" />
          <span class="form-hint">同一个顾客在本活动最多拿到的加成分，0 表示不限。防刷单就靠它</span>
        </el-form-item>

        <el-form-item label="活动条标题">
          <el-input v-model="form.bannerTitle" maxlength="64" placeholder="留空则小程序不显示活动条" />
        </el-form-item>
        <el-form-item label="活动条文案">
          <el-input v-model="form.bannerDesc" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>

        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="新建出来的活动是停用状态"
          description="设规则与开活动是两步：保存后要在列表里拨开「启用」才真正开始发分。启用时如果与另一个启用中的活动在商户范围上重叠，会被拒绝。"
        />
      </el-form>

      <template #footer>
        <el-button @click="editorOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.scope-select {
  width: 260px;
}

/* 命中条件的说明压在表单字段之间，不加边距会和上一项贴在一起 */
.scope-note {
  margin: 0 0 18px;
}

.form-hint {
  margin-left: var(--space-3);
  font-size: 12px;
  color: var(--neutral-500);
}
</style>
