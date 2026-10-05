<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Lock, User } from '@element-plus/icons-vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useUserStore } from '@/store/modules/user';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const formRef = ref<FormInstance>();
const submitting = ref(false);

const form = reactive({
  username: '',
  password: '',
});

const rules: FormRules<typeof form> = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { max: 32, message: '用户名最长 32 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { max: 32, message: '密码最长 32 位', trigger: 'blur' },
  ],
};

/** 登录成功后的落点：优先回到被拦截前的页面 */
const redirectTarget = computed(() => {
  const value = route.query.redirect;
  return typeof value === 'string' && value.startsWith('/') ? value : '/';
});

/**
 * 仅开发环境展示的种子账号。
 *
 * 注意：**只列出能登录平台管理端的账号**。商户管理员 / 收银员的账号属于
 * Merchant-web 与 Cashier-web，在此登录会被服务端拒绝（端归属不匹配）。
 */
const demoAccounts = import.meta.env.DEV
  ? [{ label: '平台管理员', username: 'admin', password: 'Admin@123456' }]
  : [];

function fillDemoAccount(account: { username: string; password: string }): void {
  form.username = account.username;
  form.password = account.password;
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }

  submitting.value = true;
  try {
    await userStore.login({
      username: form.username.trim(),
      password: form.password,
    });
    ElMessage.success(`欢迎回来，${userStore.displayName}`);
    await router.replace(redirectTarget.value);
  } catch {
    // 具体错误提示已由请求层统一弹出，这里只需恢复按钮状态
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login">
    <!-- 左侧品牌区：深色 + 品牌渐变，承担情绪与定位表达 -->
    <section class="login__brand">
      <div class="login__brand-inner">
        <div class="login__logo">
          <span class="login__mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="24" height="24">
              <path
                d="M18 41c0-7.7 6.3-14 14-14s14 6.3 14 14"
                fill="none"
                stroke="#fff"
                stroke-width="6"
                stroke-linecap="round"
              />
              <path d="M14 47h36" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" />
              <circle cx="32" cy="19" r="4" fill="#fff" />
            </svg>
          </span>
          <span class="login__logo-text">
            <strong>Ordering</strong>
            <em>平台管理后台</em>
          </span>
        </div>

        <h1 class="login__headline">
          管商户、管账号，
          <br />
          管全局数据。
        </h1>
        <p class="login__subline">
          这里是平台治理入口：商户开通、门店与账号治理、跨租户数据排查都在这一处完成。
          菜单与订单的经营维护由商户后台与收银台各自承担。
        </p>

        <ul class="login__points">
          <li>
            <span class="login__point-mark" aria-hidden="true" />
            <span><strong>商户治理</strong>　开通、编辑、禁用商户，服务到期一目了然</span>
          </li>
          <li>
            <span class="login__point-mark" aria-hidden="true" />
            <span><strong>账号治理</strong>　为商户开通首个管理员，密码重置与禁用一处完成</span>
          </li>
          <li>
            <span class="login__point-mark" aria-hidden="true" />
            <span><strong>只读排查</strong>　进商户详情即可查看其门店与菜单，平台不参与经营维护</span>
          </li>
        </ul>
      </div>

      <div class="login__glow login__glow--a" aria-hidden="true" />
      <div class="login__glow login__glow--b" aria-hidden="true" />
    </section>

    <!-- 右侧表单区 -->
    <section class="login__panel">
      <div class="login__form-wrap">
        <header class="login__form-head">
          <h2>登录</h2>
          <p>请使用平台分配的账号继续</p>
        </header>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @submit.prevent="handleSubmit"
        >
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              :prefix-icon="User"
              placeholder="请输入用户名"
              autocomplete="username"
              clearable
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              :prefix-icon="Lock"
              placeholder="请输入密码"
              autocomplete="current-password"
              show-password
              @keyup.enter="handleSubmit"
            />
          </el-form-item>

          <el-button
            class="login__submit"
            type="primary"
            size="large"
            :loading="submitting"
            native-type="submit"
            @click="handleSubmit"
          >
            {{ submitting ? '正在登录…' : '登录' }}
          </el-button>
        </el-form>

        <div v-if="demoAccounts.length" class="login__demo">
          <p class="login__demo-title">演示账号（点击填充）</p>
          <div class="login__demo-list">
            <button
              v-for="account in demoAccounts"
              :key="account.username"
              class="login__demo-chip"
              type="button"
              @click="fillDemoAccount(account)"
            >
              <strong>{{ account.label }}</strong>
              <span>{{ account.username }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.login {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(420px, 0.95fr);
  height: 100%;
  background-color: var(--surface);

  /* ---------------- 左侧品牌区 ---------------- */
  &__brand {
    position: relative;
    display: flex;
    align-items: center;
    padding: 0 clamp(40px, 6vw, 88px);
    overflow: hidden;
    background-color: var(--sidebar-bg);
  }

  &__brand-inner {
    position: relative;
    z-index: 1;
    max-width: 460px;
    animation: rise-in 520ms var(--ease-out-expo) both;
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: clamp(36px, 6vh, 64px);
  }

  &__mark {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    background: linear-gradient(140deg, var(--brand-400), var(--brand-700));
    box-shadow: 0 8px 22px -8px rgba(194, 96, 60, 0.7);
  }

  &__logo-text {
    display: flex;
    flex-direction: column;
    line-height: 1.15;

    strong {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
    }

    em {
      font-size: 11px;
      font-style: normal;
      letter-spacing: 0.1em;
      color: rgba(255, 255, 255, 0.42);
    }
  }

  &__headline {
    font-size: clamp(30px, 3.4vw, 44px);
    font-weight: 600;
    line-height: 1.24;
    letter-spacing: -0.02em;
    color: #fff;
  }

  &__subline {
    margin-top: var(--space-4);
    max-width: 40ch;
    font-size: 14px;
    line-height: 1.75;
    color: rgba(255, 255, 255, 0.56);
  }

  &__points {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: clamp(32px, 5vh, 52px);

    li {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font-size: 13px;
      line-height: 1.7;
      color: rgba(255, 255, 255, 0.5);
    }

    strong {
      font-weight: 600;
      color: rgba(255, 255, 255, 0.88);
    }
  }

  &__point-mark {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    border-radius: var(--radius-full);
    background-color: var(--brand-400);
    transform: translateY(-2px);
  }

  /* 背景光晕：仅用 transform 做极缓慢漂移，不触发重排 */
  &__glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    will-change: transform;

    &--a {
      width: 460px;
      height: 460px;
      right: -140px;
      top: -120px;
      background: radial-gradient(circle, rgba(194, 96, 60, 0.55), transparent 68%);
      animation: drift-a 22s var(--ease-out-quart) infinite alternate;
    }

    &--b {
      width: 380px;
      height: 380px;
      left: -120px;
      bottom: -140px;
      background: radial-gradient(circle, rgba(120, 140, 93, 0.32), transparent 70%);
      animation: drift-b 26s var(--ease-out-quart) infinite alternate;
    }
  }

  /* ---------------- 右侧表单区 ---------------- */
  &__panel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px clamp(24px, 5vw, 64px);
    background-color: var(--surface);
  }

  &__form-wrap {
    width: 100%;
    max-width: 356px;
    animation: rise-in 520ms var(--ease-out-expo) 80ms both;
  }

  &__form-head {
    margin-bottom: var(--space-6);

    h2 {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text-primary);
    }

    p {
      margin-top: 6px;
      font-size: 13px;
      color: var(--text-secondary);
    }
  }

  &__submit {
    width: 100%;
    margin-top: var(--space-2);
    font-weight: 500;
    letter-spacing: 0.04em;
  }

  /* ---------------- 演示账号 ---------------- */
  &__demo {
    margin-top: var(--space-8);
    padding-top: var(--space-5);
    border-top: 1px dashed var(--border-color);
  }

  &__demo-title {
    margin-bottom: 10px;
    font-size: 12px;
    letter-spacing: 0.04em;
    color: var(--text-placeholder);
  }

  &__demo-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__demo-chip {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background-color: var(--neutral-25);
    cursor: pointer;
    text-align: left;
    transition: border-color var(--duration-fast) var(--ease-out-quart),
      background-color var(--duration-fast) var(--ease-out-quart),
      transform var(--duration-fast) var(--ease-out-quart);

    strong {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-regular);
    }

    span {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-placeholder);
    }

    &:hover {
      border-color: var(--brand-300);
      background-color: var(--brand-50);
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }
}

@keyframes drift-a {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(-60px, 50px, 0) scale(1.12);
  }
}

@keyframes drift-b {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(50px, -40px, 0) scale(1.1);
  }
}

/* 窄屏：品牌区收起，表单占满 */
@media (max-width: 900px) {
  .login {
    grid-template-columns: 1fr;
  }

  .login__brand {
    display: none;
  }

  .login__panel {
    background: linear-gradient(180deg, var(--brand-50), var(--surface) 42%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .login__brand-inner,
  .login__form-wrap {
    animation: none;
  }

  .login__glow {
    animation: none;
  }
}
</style>
