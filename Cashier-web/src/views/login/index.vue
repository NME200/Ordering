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
    { required: true, message: '请输入工号 / 用户名', trigger: 'blur' },
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
  return typeof value === 'string' && value.startsWith('/') ? value : '/pos';
});

/** 小票页眉的机打日期 */
const slipDate = computed(() => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const weekday = '日一二三四五六'[date.getDay()];
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 周${weekday}`;
});

/**
 * 仅开发环境展示的种子账号。
 *
 * 只列出能登录收银台的账号。门店管理员也可进收银台，但种子数据里没有该账号，
 * 需要先在商户后台的「员工账号」里创建；平台管理员 / 商户管理员在此会被服务端拒绝。
 */
const demoAccounts = import.meta.env.DEV
  ? [{ label: '收银员', username: 'cashier01', password: 'Cashier@123456' }]
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
    ElMessage.success(`${userStore.displayName}，开始收银`);
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
    <!-- 背景氛围：收银台垫布的细网格 + 品牌色暖光 -->
    <div class="login__mat" aria-hidden="true" />
    <div class="login__glow login__glow--a" aria-hidden="true" />
    <div class="login__glow login__glow--b" aria-hidden="true" />

    <div class="login__stage">
      <div class="login__aside">
        <div class="login__logo">
          <span class="login__mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="22" height="22">
              <path
                d="M21 17h22v30l-3.6-2.4L35.8 47l-3.8-2.4L28.2 47l-3.6-2.4L21 47Z"
                fill="none"
                stroke="#fff"
                stroke-width="5"
                stroke-linejoin="round"
              />
              <path
                d="M26 26h12M26 33h8"
                fill="none"
                stroke="#fff"
                stroke-width="5"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span class="login__logo-text">
            <strong>Ordering</strong>
            <em>收银台 · Cashier</em>
          </span>
        </div>

        <h1 class="login__headline">
          站得近，
          <br />
          收得快。
        </h1>
        <p class="login__subline">
          菜单点两下就进单，桌号备注随手一填，现金收款一次按下即完成。
          收银台只管「这一单」，门店与菜单的配置在商户后台维护。
        </p>

        <ul class="login__points">
          <li>
            <span class="login__point-mark" aria-hidden="true" />
            <span><strong>开单收款</strong>　代客开单 + 现金 / 收款码核销，同一屏完成</span>
          </li>
          <li>
            <span class="login__point-mark" aria-hidden="true" />
            <span><strong>订单流转</strong>　接单、出餐、完成，大按钮戴手套也能点准</span>
          </li>
          <li>
            <span class="login__point-mark" aria-hidden="true" />
            <span><strong>门店隔离</strong>　只能看到本门店的单，跨店在接口层就被拒绝</span>
          </li>
        </ul>
      </div>

      <!-- 登录小票：把「收银台」最核心的物件当作表单容器 -->
      <section class="login__slip">
        <div class="login__edge login__edge--top" aria-hidden="true" />

        <div class="login__slip-body">
          <header class="login__slip-head">
            <p class="login__slip-kicker">收银终端登录</p>
            <p class="login__slip-date num">{{ slipDate }}</p>
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
                placeholder="请输入工号 / 用户名"
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
              {{ submitting ? '正在开机…' : '开始收银' }}
            </el-button>
          </el-form>

          <div v-if="demoAccounts.length" class="login__demo">
            <p class="login__demo-title">演示账号（点击填充）</p>
            <button
              v-for="account in demoAccounts"
              :key="account.username"
              class="login__demo-chip"
              type="button"
              @click="fillDemoAccount(account)"
            >
              <strong>{{ account.label }}</strong>
              <span class="num">{{ account.username }} / {{ account.password }}</span>
            </button>
            <p class="login__demo-note">
              门店管理员同样可登录收银台（种子数据未创建该账号）；
              平台管理员与商户管理员会被服务端以 <code class="num">403 / 20007</code> 拒绝。
            </p>
          </div>
        </div>

        <div class="login__edge" aria-hidden="true" />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login {
  position: relative;
  display: grid;
  place-items: center;
  height: 100%;
  overflow: auto;
  padding: var(--space-8) var(--space-6);
  background-color: var(--sidebar-bg);

  /* 垫布细网格：极低对比度，只给画面一层质感 */
  &__mat {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(circle at 50% 45%, #000 20%, transparent 78%);
  }

  &__glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    will-change: transform;

    &--a {
      width: 520px;
      height: 520px;
      left: -120px;
      top: -160px;
      background: radial-gradient(circle, rgba(194, 96, 60, 0.5), transparent 68%);
      animation: drift 24s var(--ease-out-quart) infinite alternate;
    }

    &--b {
      width: 420px;
      height: 420px;
      right: -110px;
      bottom: -150px;
      background: radial-gradient(circle, rgba(120, 140, 93, 0.28), transparent 70%);
      animation: drift 30s var(--ease-out-quart) infinite alternate-reverse;
    }
  }

  &__stage {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 420px) minmax(360px, 400px);
    align-items: center;
    gap: clamp(40px, 6vw, 84px);
  }

  /* ---------------- 左侧文案 ---------------- */
  &__logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: clamp(28px, 5vh, 48px);
  }

  &__mark {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: linear-gradient(140deg, var(--brand-400), var(--brand-700));
    box-shadow: 0 10px 26px -10px rgba(194, 96, 60, 0.75);
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
      font-size: 10.5px;
      font-style: normal;
      letter-spacing: 0.18em;
      color: rgba(255, 255, 255, 0.38);
    }
  }

  &__headline {
    font-size: clamp(32px, 3.6vw, 46px);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.025em;
    color: #fff;
  }

  &__subline {
    margin-top: var(--space-4);
    max-width: 38ch;
    font-size: 13.5px;
    line-height: 1.8;
    color: rgba(255, 255, 255, 0.54);
  }

  &__points {
    display: flex;
    flex-direction: column;
    gap: 13px;
    margin-top: clamp(28px, 4.5vh, 44px);

    li {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font-size: 12.5px;
      line-height: 1.7;
      color: rgba(255, 255, 255, 0.46);
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

  /* ---------------- 登录小票 ---------------- */
  &__slip {
    display: flex;
    flex-direction: column;
    /* 纸的厚重感：两层暖色阴影，而不是默认的冷灰 */
    box-shadow:
      0 30px 60px -28px rgba(0, 0, 0, 0.75),
      0 2px 0 rgba(255, 255, 255, 0.06);
    animation: rise-in 560ms var(--ease-out-expo) 80ms both;
  }

  &__edge {
    height: 9px;
    background-image: radial-gradient(circle at 6px 9px, transparent 4.5px, var(--paper) 5px);
    background-size: 12px 9px;
    background-repeat: repeat-x;

    &--top {
      transform: scaleY(-1);
    }
  }

  &__slip-body {
    padding: var(--space-5) clamp(22px, 3vw, 32px) clamp(24px, 3vw, 30px);
    background-color: var(--paper);
    /* 纸张纤维：极淡的斜向纹理，避免纯色的塑料感 */
    background-image: repeating-linear-gradient(
      -45deg,
      rgba(36, 31, 28, 0.016) 0 2px,
      transparent 2px 4px
    );
  }

  &__slip-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding-bottom: var(--space-3);
    margin-bottom: var(--space-4);
    border-bottom: 1px dashed var(--paper-rule);

    h2 {
      font-size: 19px;
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  &__slip-kicker {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-primary);
  }

  &__slip-date {
    font-size: 11px;
    color: var(--text-placeholder);
  }

  &__submit {
    width: 100%;
    margin-top: var(--space-2);
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.08em;
  }

  /* ---------------- 演示账号 ---------------- */
  &__demo {
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px dashed var(--paper-rule);
  }

  &__demo-title {
    margin-bottom: 8px;
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--text-placeholder);
  }

  &__demo-chip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 9px 12px;
    border: 1px dashed var(--border-color-strong);
    border-radius: var(--radius-md);
    background-color: rgba(194, 96, 60, 0.04);
    cursor: pointer;
    text-align: left;
    transition:
      border-color var(--duration-fast) var(--ease-out-quart),
      background-color var(--duration-fast) var(--ease-out-quart);

    strong {
      font-size: 12px;
      font-weight: 600;
      color: var(--brand-700);
    }

    span {
      font-size: 11.5px;
      color: var(--text-secondary);
    }

    &:hover {
      border-color: var(--brand-400);
      background-color: var(--brand-50);
    }
  }

  &__demo-note {
    margin-top: 10px;
    font-size: 11px;
    line-height: 1.7;
    color: var(--text-placeholder);

    code {
      padding: 1px 5px;
      border-radius: var(--radius-xs);
      background-color: var(--neutral-100);
      font-size: 10.5px;
    }
  }
}

@keyframes drift {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(60px, 40px, 0) scale(1.12);
  }
}

/* 窄屏：只留小票，文案收起 */
@media (max-width: 900px) {
  .login__stage {
    grid-template-columns: minmax(0, 400px);
    gap: var(--space-8);
  }

  .login__headline,
  .login__subline,
  .login__points {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login__slip {
    animation: none;
  }

  .login__glow {
    animation: none;
  }
}
</style>
