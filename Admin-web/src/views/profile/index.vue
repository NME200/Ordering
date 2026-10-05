<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { changePassword } from '@shared/api/auth';
import PageHeader from '@shared/components/PageHeader.vue';
import StatusTag from '@shared/components/StatusTag.vue';
import { useUserStore } from '@/store/modules/user';
import { Role } from '@shared/types/enums';
import { orEmpty } from '@shared/utils/format';

const router = useRouter();
const userStore = useUserStore();

/* ---------------- 账号信息 ---------------- */

/** 权限点按资源分组展示，比一长串平铺更易读 */
const RESOURCE_LABELS: Record<string, string> = {
  merchant: '商户',
  store: '门店',
  user: '员工账号',
  category: '菜品分类',
  dish: '菜品',
  spec: '规格组',
  order: '订单',
  payment: '支付',
};

const permissionGroups = computed(() => {
  const grouped = new Map<string, string[]>();
  userStore.permissions.forEach((permission) => {
    const resource = permission.split(':')[0];
    const list = grouped.get(resource) ?? [];
    list.push(permission);
    grouped.set(resource, list);
  });
  return Array.from(grouped.entries()).map(([resource, list]) => ({
    resource,
    label: RESOURCE_LABELS[resource] ?? resource,
    list,
  }));
});

const scopeText = computed(() =>
  userStore.profile?.role === Role.PLATFORM_ADMIN
    ? '平台级（可管理全部商户）'
    : `商户 #${userStore.profile?.merchantId ?? '—'}`,
);

const canChangePassword = computed(() => userStore.permissions.length > 0);

/* ---------------- 修改密码 ---------------- */

const formRef = ref<FormInstance>();
const submitting = ref(false);
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });

const rules: FormRules<typeof form> = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码至少 6 位', trigger: 'blur' },
    { max: 32, message: '新密码最长 32 位', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value && value === form.oldPassword) {
          callback(new Error('新密码不能与当前密码相同'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value !== form.newPassword) {
          callback(new Error('两次输入的密码不一致'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  submitting.value = true;
  try {
    await changePassword({
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    });

    await ElMessageBox.alert('密码已更新，当前登录状态已失效，请使用新密码重新登录。', '修改成功', {
      type: 'success',
      confirmButtonText: '去登录',
      showClose: false,
    });

    userStore.reset();
    await router.replace({ name: 'Login' });
  } catch {
    // 错误提示已由请求层统一处理
  } finally {
    submitting.value = false;
  }
}

function handleReset(): void {
  form.oldPassword = '';
  form.newPassword = '';
  form.confirmPassword = '';
  formRef.value?.clearValidate();
}
</script>

<template>
  <div class="page">
    <PageHeader title="个人中心" description="查看当前账号信息与权限点，并修改登录密码" />

    <section class="panels">
      <!-- 账号信息 -->
      <div class="panel panel--flush">
        <header class="panel__head">
          <div class="identity">
            <span class="identity__avatar">
              {{ (userStore.displayName || 'U').slice(0, 1).toUpperCase() }}
            </span>
            <div class="identity__text">
              <h2>{{ userStore.displayName || '未命名账号' }}</h2>
              <p class="num">{{ userStore.profile?.username || '—' }}</p>
            </div>
          </div>
          <StatusTag v-if="userStore.profile" kind="common" :value="userStore.profile.status" />
        </header>

        <dl class="info">
          <div class="info__row">
            <dt>角色</dt>
            <dd>{{ userStore.roleLabel || '—' }}</dd>
          </div>
          <div class="info__row">
            <dt>数据范围</dt>
            <dd>{{ scopeText }}</dd>
          </div>
          <div class="info__row">
            <dt>所属门店</dt>
            <dd class="num">{{ userStore.profile?.storeId ?? '—' }}</dd>
          </div>
          <div class="info__row">
            <dt>手机号</dt>
            <dd class="num">{{ orEmpty(userStore.profile?.phone) }}</dd>
          </div>
          <div class="info__row">
            <dt>账号状态</dt>
            <dd>{{ userStore.profile?.status === 1 ? '正常' : '已禁用' }}</dd>
          </div>
        </dl>

        <div class="permissions">
          <h3 class="permissions__title">
            权限点
            <span class="num muted">共 {{ userStore.permissions.length }} 项</span>
          </h3>
          <div v-for="group in permissionGroups" :key="group.resource" class="permissions__group">
            <span class="permissions__label">{{ group.label }}</span>
            <div class="permissions__list">
              <code v-for="item in group.list" :key="item" class="permissions__code">{{ item }}</code>
            </div>
          </div>
          <p class="permissions__note">
            权限点由服务端下发，前端仅用于菜单与按钮的展示控制；接口层的鉴权以服务端为准。
          </p>
        </div>
      </div>

      <!-- 修改密码 -->
      <div class="panel panel--flush">
        <header class="panel__head">
          <h2>修改密码</h2>
          <p>修改成功后当前登录状态会立即失效，需要用新密码重新登录</p>
        </header>

        <div class="password">
          <el-form
            v-if="canChangePassword"
            ref="formRef"
            :model="form"
            :rules="rules"
            label-position="top"
            @submit.prevent="handleSubmit"
          >
            <el-form-item label="当前密码" prop="oldPassword">
              <el-input
                v-model="form.oldPassword"
                type="password"
                placeholder="请输入当前使用的密码"
                maxlength="32"
                show-password
                autocomplete="current-password"
              />
            </el-form-item>

            <el-form-item label="新密码" prop="newPassword">
              <el-input
                v-model="form.newPassword"
                type="password"
                placeholder="6 ~ 32 位"
                maxlength="32"
                show-password
                autocomplete="new-password"
              />
            </el-form-item>

            <el-form-item label="确认新密码" prop="confirmPassword">
              <el-input
                v-model="form.confirmPassword"
                type="password"
                placeholder="再次输入新密码"
                maxlength="32"
                show-password
                autocomplete="new-password"
                @keyup.enter="handleSubmit"
              />
            </el-form-item>

            <div class="password__actions">
              <el-button type="primary" :loading="submitting" @click="handleSubmit">
                确认修改
              </el-button>
              <el-button @click="handleReset">清空</el-button>
            </div>
          </el-form>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.panels {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5) var(--space-3);

  h2 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  p {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-placeholder);
  }
}

/* ---------------- 身份区 ---------------- */
.identity {
  display: flex;
  align-items: center;
  gap: 12px;

  &__avatar {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-lg);
    background: linear-gradient(140deg, var(--brand-400), var(--brand-700));
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    box-shadow: var(--shadow-brand);
  }

  &__text {
    min-width: 0;

    h2 {
      font-size: 16px;
    }

    p {
      margin-top: 2px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-placeholder);
    }
  }
}

/* ---------------- 信息列表 ---------------- */
.info {
  padding: 0 var(--space-5) var(--space-4);
  margin: 0;

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 9px 0;
    border-bottom: 1px solid var(--neutral-100);

    &:last-child {
      border-bottom: none;
    }

    dt {
      font-size: 13px;
      color: var(--text-secondary);
    }

    dd {
      margin: 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }
  }
}

/* ---------------- 权限点 ---------------- */
.permissions {
  padding: var(--space-4) var(--space-5) var(--space-5);
  border-top: 1px solid var(--neutral-100);

  &__title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: var(--space-3);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);

    span {
      font-weight: 400;
    }
  }

  &__group {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 6px 0;
  }

  &__label {
    flex-shrink: 0;
    width: 64px;
    padding-top: 1px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }

  &__code {
    padding: 2px 8px;
    border-radius: var(--radius-xs);
    background-color: var(--neutral-100);
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--text-regular);
  }

  &__note {
    margin-top: var(--space-3);
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-placeholder);
  }
}

/* ---------------- 修改密码 ---------------- */
.password {
  padding: 0 var(--space-5) var(--space-5);

  &__actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
}

@media (max-width: 1024px) {
  .panels {
    grid-template-columns: 1fr;
  }
}
</style>
