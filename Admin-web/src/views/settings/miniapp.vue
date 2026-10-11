<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import PageHeader from '@shared/components/PageHeader.vue';
import { Permission } from '@shared/types/enums';
import { formatDateTime } from '@shared/utils/format';
import { useUserStore } from '@/store/modules/user';
import { fetchMiniappConfig, saveMiniappConfig, testMiniappConfig } from '@/api/miniapp';
import type { MiniappConfig, MiniappEnvVersion, MiniappTestResult } from '@/types/miniapp';

/**
 * 平台管理端 · 小程序配置。
 *
 * 平台只登记微信小程序的 AppID / AppSecret 这一件事：调微信接口用的是
 * 这一份全局凭据（与「平台一套商户号、全局收款」同构），
 * 现在管着三件事 —— 顾客 wx.login 换 openid、手机号快速验证、门店出桌码。
 * 哪家店有几张桌、码印给谁，是商家自己的经营动作，在商家后台的「桌码管理」里做。
 *
 * AppSecret 与支付渠道密钥同规：只写不回显，留空保存表示保持原值。
 */

const userStore = useUserStore();
const canManage = computed(() => userStore.hasPermission(Permission.MINIAPP_UPDATE));

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const config = ref<MiniappConfig | null>(null);
const testResult = ref<MiniappTestResult | null>(null);

const form = reactive({
  appId: '',
  appSecret: '',
  envVersion: 'release' as MiniappEnvVersion,
  remark: '',
});

/** 码写给哪个版本。未发布时只有 trial / develop 的码能真机扫开 */
const ENV_OPTIONS: { value: MiniappEnvVersion; label: string; hint: string }[] = [
  { value: 'release', label: '正式版', hint: '小程序已发布时用这个' },
  { value: 'trial', label: '体验版', hint: '没发布但要真机试扫：扫码的人需在「体验成员」里' },
  { value: 'develop', label: '开发版', hint: '开发者工具编译出来的版本，联调用' },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await fetchMiniappConfig();
    config.value = data;
    form.appId = data.appId ?? '';
    // 密钥不回显，每次进来都留空；留空保存 = 不动已存的那把
    form.appSecret = '';
    form.envVersion = data.envVersion;
    form.remark = data.remark ?? '';
  } finally {
    loading.value = false;
  }
}

async function handleSave(): Promise<void> {
  saving.value = true;
  try {
    const data = await saveMiniappConfig({
      appId: form.appId.trim(),
      appSecret: form.appSecret.trim() || undefined,
      envVersion: form.envVersion,
      remark: form.remark.trim(),
    });
    config.value = data;
    form.appSecret = '';
    testResult.value = null;
    ElMessage.success('小程序凭据已保存');
  } finally {
    saving.value = false;
  }
}

async function handleTest(): Promise<void> {
  testing.value = true;
  try {
    testResult.value = await testMiniappConfig();
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="miniapp" v-loading="loading">
    <PageHeader
      title="小程序配置"
      description="登记微信小程序的 AppID 与 AppSecret。顾客微信登录、手机号一键绑定，以及商家在自己后台生成桌码，用的都是这一份凭据。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <el-alert
      class="miniapp__notice"
      type="info"
      :closable="false"
      show-icon
      title="这份凭据还管着顾客登录"
      description="配齐后小程序会自动用 wx.login 换 openid：顾客换手机、卸载重装都回到同一个账号，不再认设备。手机号「一键绑定」另需在微信公众平台开通「手机号快速验证组件」——企业主体并完成微信认证才能开，0.03 元/次、新号有 1000 次体验额度；没开通时顾客点按钮会看到微信的「没有权限」，此时手机号只能由店员手工登记。"
    />

    <el-alert
      class="miniapp__notice"
      type="info"
      :closable="false"
      show-icon
      title="AppSecret 不会回显"
      description="AppSecret 以 AES-256-GCM 密文存库，接口只返回「是否已配置」。要更换就粘贴新值，留空保存表示保持原值不变。更换 .env 中的 CONFIG_SECRET_KEY 会让已存密钥无法解密，必须重填一次。"
    />

    <el-alert
      v-if="config && !config.masterKeyReady"
      class="miniapp__notice"
      type="error"
      :closable="false"
      show-icon
      title="缺少 CONFIG_SECRET_KEY"
      description="服务端没有配置主密钥，AppSecret 无法安全入库，这一项保存会被拒绝。请先在 .env 补上再操作。"
    />

    <section class="miniapp__block">
      <h3 class="miniapp__title">微信凭据</h3>
      <el-form label-width="120px" :disabled="!canManage">
        <el-form-item label="AppID">
          <el-input v-model="form.appId" maxlength="32" placeholder="wx0000000000000000" show-word-limit />
        </el-form-item>
        <el-form-item label="AppSecret">
          <el-input
            v-model="form.appSecret"
            type="password"
            maxlength="64"
            show-password
            :placeholder="config?.appSecretConfigured ? '已配置，留空表示不修改' : '请填写小程序后台生成的 AppSecret'"
          />
        </el-form-item>
        <el-form-item label="凭据状态">
          <el-tag :type="config?.credentialsReady ? 'success' : 'warning'" size="small">
            {{ config?.credentialsReady ? '已配齐，微信登录与商家出桌码都能用了' : '未配齐，顾客微信登录与商家出码都会被拒绝' }}
          </el-tag>
          <el-button class="miniapp__inline" :loading="testing" :disabled="!canManage" @click="handleTest">
            测试连接
          </el-button>
          <span class="miniapp__meta">
            {{ config?.updatedByName ? `最后修改：${config.updatedByName} · ${formatDateTime(config.updatedAt)}` : '尚未修改过' }}
          </span>
        </el-form-item>
        <el-alert
          v-if="testResult"
          :type="testResult.ok ? 'success' : 'error'"
          :closable="false"
          show-icon
          :title="testResult.ok ? '凭据可用' : '凭据不可用'"
          :description="testResult.message"
        />
        <el-form-item label="桌码版本">
          <el-select v-model="form.envVersion" style="width: 200px">
            <el-option v-for="item in ENV_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <span class="miniapp__meta">{{ ENV_OPTIONS.find((i) => i.value === form.envVersion)?.hint }}</span>
          <p class="miniapp__hint">
            改这里只影响**之后新生成**的桌码，已经印出来的那张不会变。
            小程序还没发布时选正式版，码是扫不开的（微信会提示找不到小程序）。
            另外：开发者工具的模拟器扫小程序码拿不到桌号，验证必须用真机微信扫。
          </p>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" maxlength="255" placeholder="选填，记录这次改动给谁看" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" :disabled="!canManage" @click="handleSave">
            保存凭据
          </el-button>
        </el-form-item>
      </el-form>
    </section>

    <el-alert
      class="miniapp__notice"
      type="info"
      :closable="false"
      show-icon
      title="桌码在哪生成"
      description="桌码由商家管理员在商家后台的「桌码管理」里，按自己门店的台位生成与下载；顾客扫桌上的码直接进入该门店点餐页并自动带上桌号，全程不需要手填。台位没录进来的门店出不了码。"
    />
  </div>
</template>

<style scoped lang="scss">
.miniapp {
  padding: var(--space-4);
}

.miniapp__notice {
  margin-bottom: var(--space-3);
}

.miniapp__block {
  margin-bottom: var(--space-5, 28px);
  padding: var(--space-4);
  border: 1px solid var(--border-2, #ebeef5);
  border-radius: var(--radius-lg, 10px);
  background-color: var(--bg-1, #fff);
}

.miniapp__title {
  margin: 0 0 var(--space-3);
  font-size: 15px;
  font-weight: 600;
}

.miniapp__meta {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-3, #8a8f99);
}

.miniapp__inline {
  margin-left: 12px;
}
</style>
