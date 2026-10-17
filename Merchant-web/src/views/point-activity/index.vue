<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import PageHeader from '@shared/components/PageHeader.vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import { fetchEffectiveActivities } from '@/api/point-activity';
import {
  RULE_TYPE_LABELS,
  SCOPE_LABELS,
  pointActivityConditionText,
  pointActivityRuleText,
} from '@shared/types/point-activity';
import type { PointActivity, PointActivityRuleType, PointActivityScope } from '@shared/types/point-activity';
import { formatDateTime } from '@shared/utils/format';

/**
 * 商户后台 · 平台积分活动（只读）。
 *
 * 规则与开关都在平台端，这一屏只回答商户会问的两件事：
 * **这一段多出来的分是谁给的**、**什么时候结束**。
 * 没有它，商户看订单会发现顾客积分比自己算的多，只能靠猜或找平台。
 *
 * 刻意不放任何写操作，也不显示别家商户的范围 —— 数据本身就没有。
 */
const loading = ref(false);
const rows = ref<PointActivity[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await fetchEffectiveActivities();
  } catch {
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <PageHeader
      title="平台积分活动"
      description="平台一侧配置的积分补贴，规则与启停都在平台后台，商户端只读。加成的分照样按门店落在顾客本店的会员档案里"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <section class="panel panel--flush">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="加成只发积分，不发成长值"
        description="等级由累计实付推导，所以平台活动不会改变会员等级；退款时这一单的活动加成按当初发放的原额扣回，不按现在的规则重算。"
      />

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="活动" min-width="200">
          <template #default="{ $index }">
            <div class="cell-stack">
              <span class="cell-stack__main">{{ rows[$index].name }}</span>
              <span class="cell-stack__sub">{{ pointActivityRuleText(rows[$index]) }}</span>
              <span class="cell-stack__sub">{{ pointActivityConditionText(rows[$index]) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="规则" width="110">
          <template #default="{ row }">
            {{ row.ruleTypeLabel || RULE_TYPE_LABELS[row.ruleType as PointActivityRuleType] }}
          </template>
        </el-table-column>

        <el-table-column label="投放范围" width="130">
          <template #default="{ row }">
            {{ SCOPE_LABELS[row.scopeType as PointActivityScope] }}
          </template>
        </el-table-column>

        <el-table-column label="每人上限" width="110" align="right">
          <template #default="{ row }">
            <span class="num">{{ row.perCustomerCap > 0 ? `${row.perCustomerCap} 分` : '不限' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="开始" min-width="160">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.startTime) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="结束" min-width="160">
          <template #default="{ row }">
            <span class="num muted">{{ formatDateTime(row.endTime) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="活动条" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.bannerTitle">{{ row.bannerTitle }}</span>
            <span v-else class="muted">未配置，顾客端不显示</span>
          </template>
        </el-table-column>

        <template #empty>
          <TableEmpty hint="本店此刻没有进行中的平台积分活动" />
        </template>
      </el-table>
    </section>
  </div>
</template>
