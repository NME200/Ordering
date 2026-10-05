<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import PageHeader from '@shared/components/PageHeader.vue';
import { useUserStore } from '@/store/modules/user';
import { CommonStatus, Permission } from '@shared/types/enums';
import { formatDateTime } from '@shared/utils/format';
import {
  fetchPaymentConfigSchema,
  fetchPaymentConfigs,
  savePaymentConfig,
  setPaymentConfigEnabled,
} from '@/api/payment-config';
import type {
  ChannelField,
  ChannelSchema,
  PaymentConfigInfo,
} from '@/types/payment-config';

/**
 * 平台管理端 · 支付配置。
 *
 * 表单完全由服务端下发的字段定义（/payment-configs/schema）渲染 ——
 * 字段清单、必填规则、帮助文案只在后端维护一份，避免前后端各写一遍而漂移。
 *
 * 敏感字段（私钥 / 证书 / APIv3 密钥）响应里只有「是否已配置」，
 * 因此界面上留空即表示**保持原值不变**，只有粘贴了新内容才会覆盖。
 */

const userStore = useUserStore();

const canUpdate = computed(() => userStore.hasPermission(Permission.PAYMENT_CONFIG_UPDATE));

const loading = ref(false);
const saving = ref(false);
const activeChannel = ref<string>('');

const configs = ref<PaymentConfigInfo[]>([]);
const schemas = ref<ChannelSchema[]>([]);

/** channel -> 字段 key -> 输入值 */
const forms = reactive<Record<string, Record<string, string>>>({});
/** channel -> 备注 */
const remarks = reactive<Record<string, string>>({});

function configOf(channel: string): PaymentConfigInfo | undefined {
  return configs.value.find((item) => item.channel === channel);
}

function schemaOf(channel: string): ChannelSchema | undefined {
  return schemas.value.find((item) => item.channel === channel);
}

function fieldsOf(channel: string): ChannelField[] {
  return schemaOf(channel)?.fields ?? [];
}

/**
 * 该字段此刻是否必填。
 * 与后端 isFieldRequired 同一套逻辑：没有条件就是恒定 required，
 * 有条件则取决于同一份表单里另一个字段的当前值（如支付宝的加签方式）。
 */
function isRequired(field: ChannelField, channel: string): boolean {
  const form = forms[channel] ?? {};
  if (!field.requiredWhen) {
    return field.required;
  }
  return form[field.requiredWhen.field] === field.requiredWhen.equals;
}

/** 敏感字段是否已经存有值（已存有值时留空是合法的） */
function hasStoredSecret(config: PaymentConfigInfo, key: string): boolean {
  return config.secrets[key]?.configured === true;
}

/** 敏感字段的输入框提示语 */
function secretPlaceholder(config: PaymentConfigInfo, field: ChannelField): string {
  if (hasStoredSecret(config, field.key)) {
    return '已配置，留空表示不修改';
  }
  return field.placeholder || '尚未配置';
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [configList, schemaList] = await Promise.all([
      fetchPaymentConfigs(),
      fetchPaymentConfigSchema(),
    ]);
    configs.value = configList;
    schemas.value = schemaList;

    for (const config of configList) {
      // 整体替换而不是逐键赋值：避免上一次加载遗留的键继续被提交
      const next: Record<string, string> = {};
      for (const field of schemaList.find((s) => s.channel === config.channel)?.fields ?? []) {
        next[field.key] = field.secret ? '' : (config.values[field.key] ?? '');
      }
      forms[config.channel] = next;
      remarks[config.channel] = config.remark ?? '';
    }

    if (!activeChannel.value && configList.length > 0) {
      activeChannel.value = configList[0].channel;
    }
  } finally {
    loading.value = false;
  }
}

async function handleSave(): Promise<void> {
  const channel = activeChannel.value;
  if (!configOf(channel)) {
    return;
  }

  saving.value = true;
  try {
    const saved = await savePaymentConfig(channel, {
      settings: { ...forms[channel] },
      remark: remarks[channel].trim() || undefined,
    });
    // 允许存草稿：必填没填全也能保存，但启用会被后端拒绝（见 setEnabled），
    // 所以这里如实告诉运营还差什么，而不是拦着不让存。
    if (saved.complete) {
      ElMessage.success('配置已保存，渠道即刻生效，无需重启服务');
    } else {
      ElMessage.warning(`已保存为草稿，还缺少：${saved.missingLabels.join('、')}，填全后才能启用`);
    }
    await load();
  } finally {
    saving.value = false;
  }
}

/**
 * 启用 / 停用。
 *
 * 开关是**单向绑定**（:model-value），失败后靠重新拉取恢复，
 * 这样服务端拒绝启用（必填项不全）时界面不会停在一个不真实的状态。
 */
async function handleToggleEnabled(channel: string, enabled: boolean): Promise<void> {
  try {
    await setPaymentConfigEnabled(channel, enabled ? CommonStatus.ENABLED : CommonStatus.DISABLED);
    ElMessage.success(enabled ? '渠道已启用' : '渠道已停用');
  } finally {
    await load();
  }
}

function statusTagType(config: PaymentConfigInfo): 'success' | 'warning' | 'info' {
  if (!config.implemented) {
    return 'warning';
  }
  if (config.enabled === CommonStatus.ENABLED) {
    return 'success';
  }
  return 'info';
}

function statusText(config: PaymentConfigInfo): string {
  if (!config.implemented) {
    return '待接入实现';
  }
  return config.enabled === CommonStatus.ENABLED ? '已启用' : '已停用';
}

onMounted(load);
</script>

<template>
  <div class="payment-config" v-loading="loading">
    <PageHeader
      title="支付配置"
      description="维护各支付渠道的商户号、密钥与证书。配置改动保存后立即生效，不需要重启服务。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <el-alert
      class="payment-config__notice"
      type="info"
      :closable="false"
      show-icon
      title="密钥不会回显"
      description="私钥、证书、APIv3 密钥等敏感字段以 AES-256-GCM 密文存库，接口只返回「是否已配置」。要更换就粘贴新值；留空保存表示保持原值不变。注意：更换 .env 中的 CONFIG_SECRET_KEY 会使已保存的配置无法解密，必须重新填写。"
    />

    <el-tabs v-model="activeChannel" class="payment-config__tabs">
      <el-tab-pane
        v-for="config in configs"
        :key="config.channel"
        :name="config.channel"
      >
        <template #label>
          <span class="payment-config__tab-label">
            {{ config.channelLabel }}
            <el-tag size="small" :type="statusTagType(config)" effect="light">
              {{ statusText(config) }}
            </el-tag>
          </span>
        </template>

        <div class="payment-config__pane">
          <p class="payment-config__desc">{{ config.description }}</p>

          <div class="payment-config__switch">
            <span class="payment-config__switch-label">启用该渠道</span>
            <el-switch
              :model-value="config.enabled === CommonStatus.ENABLED"
              :disabled="!canUpdate || !config.implemented"
              @change="handleToggleEnabled(config.channel, Boolean($event))"
            />
            <span v-if="!config.implemented" class="payment-config__hint">
              该渠道服务端尚未接入真实实现，配置可先行保存，启用开关暂不可用。
            </span>
            <span v-else-if="config.online" class="payment-config__hint">
              启用后会出现在顾客端的在线支付选项中。
            </span>
          </div>

          <el-alert
            v-if="!config.complete"
            class="payment-config__warning"
            type="warning"
            :closable="false"
            show-icon
            title="配置不完整，暂时无法启用"
            :content="`还缺少：${config.missingLabels.join('、')}`"
          />

          <el-form
            label-position="top"
            class="payment-config__form"
            :disabled="!canUpdate"
          >
            <el-form-item
              v-for="field in fieldsOf(config.channel)"
              :key="field.key"
              :required="isRequired(field, config.channel)"
            >
              <template #label>
                <span class="payment-config__field-label">
                  {{ field.label }}
                  <el-tag
                    v-if="field.secret && hasStoredSecret(config, field.key)"
                    size="small"
                    type="success"
                    effect="plain"
                  >
                    已配置
                  </el-tag>
                </span>
              </template>

              <el-select
                v-if="field.type === 'select'"
                v-model="forms[config.channel][field.key]"
                class="payment-config__control"
                placeholder="请选择"
              >
                <el-option
                  v-for="option in field.options ?? []"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>

              <el-input
                v-else-if="field.type === 'textarea'"
                v-model="forms[config.channel][field.key]"
                type="textarea"
                :rows="4"
                :maxlength="field.maxLength"
                show-word-limit
                :placeholder="
                  field.secret
                    ? secretPlaceholder(config, field)
                    : field.placeholder || '请输入'
                "
                class="payment-config__control payment-config__control--mono"
              />

              <el-input
                v-else
                v-model="forms[config.channel][field.key]"
                :maxlength="field.maxLength"
                :placeholder="
                  field.secret
                    ? secretPlaceholder(config, field)
                    : field.placeholder || '请输入'
                "
                class="payment-config__control"
              />

              <p v-if="field.help" class="payment-config__field-help">{{ field.help }}</p>
            </el-form-item>

            <el-form-item label="备注">
              <el-input
                v-model="remarks[config.channel]"
                type="textarea"
                :rows="2"
                maxlength="255"
                show-word-limit
                placeholder="例如：生产商户号，2026-10 由张三配置"
                class="payment-config__control"
              />
            </el-form-item>
          </el-form>

          <footer class="payment-config__footer">
            <span class="payment-config__meta">
              最后修改：{{ config.updatedByName ?? '系统初始化' }} ·
              {{ formatDateTime(config.updatedAt) }}
            </span>
            <el-button
              v-if="canUpdate"
              type="primary"
              :loading="saving"
              @click="handleSave"
            >
              保存并生效
            </el-button>
            <el-button v-else disabled>无修改权限</el-button>
          </footer>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.payment-config {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__notice,
  &__warning {
    border-radius: var(--radius-md);
  }

  &__tabs {
    :deep(.el-tabs__header) {
      margin-bottom: var(--space-4);
    }
  }

  &__tab-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 760px;
  }

  &__desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.7;
    color: var(--neutral-600);
  }

  &__switch {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding: var(--space-3) var(--space-4);
    background: var(--neutral-25);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  &__switch-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--neutral-800);
  }

  &__hint {
    font-size: 12px;
    color: var(--neutral-500);
  }

  &__field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__field-help {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--neutral-500);
  }

  &__control {
    width: 100%;

    &--mono :deep(textarea) {
      font-family: var(--font-mono);
      font-size: 12px;
    }
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border-color);
  }

  &__meta {
    font-size: 12px;
    color: var(--neutral-500);
  }
}
</style>
