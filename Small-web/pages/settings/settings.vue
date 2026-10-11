<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import {
  bindPhone,
  bindPhoneByWechat,
  ensureSession,
  fetchProfile,
  sendPhoneCode,
  updateProfile,
} from '@/api/customer';
import { DINING_TYPE_LABEL, useAppStore, type DiningChoice } from '@/store/app';
import { useCustomerStore } from '@/store/customer';
import { useOrderStore } from '@/store/order';
import type { CustomerProfile } from '@/types/customer';
import { isWeixinMp, phoneDeniedMessage, avatarToDataUri, type WxPhoneDetail } from '@/utils/wx';

/**
 * 与 manifest.json 的 `versionName` 对齐；发版时两处一起改。
 * 小程序侧没有可靠的运行时版本号可读（`getAccountInfoSync` 在开发版返回空），所以写死。
 */
const APP_VERSION = '1.0.0';

const PHONE_RE = /^1[3-9]\d{9}$/;
const CODE_RE = /^\d{6}$/;

/** 后端 CustomerGender：0 未填写 / 1 男 / 2 女，界面把 0 说成「暂不填」而不是「保密」 */
const GENDERS: { value: number; label: string }[] = [
  { value: 1, label: '男' },
  { value: 2, label: '女' },
  { value: 0, label: '暂不填' },
];

const DINING_KEYS: DiningChoice[] = ['dineIn', 'pickup', 'delivery'];

/**
 * 「清除本机数据」要清的名单。
 *
 * `visitor-key-v1` 不在内：那是这台设备的身份底片，清掉等于凭空造一个新顾客，
 * 旧账号的积分、券、地址全留在旧号上。
 * 登录令牌（`customer-token-v1`）由 signOut 负责作废与清除，不走这个名单。
 * 购物车（cart-cache-v1）也不清：那是顾客正在攒的一单，不该被「清数据」顺手丢掉。
 */
const CACHE_KEYS = [
  'app-config-cache-v2',
  'dining-type-v1',
  'table-no-v1',
  'last-store-id-v1',
  'orders-cache-v1',
];

function isoDate(date: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 设置页（资料 / 手机号 / 偏好 / 本地数据）。
 *
 * 内容型页面：全部行用 `var(--divider)` 细线分区，不画卡片。
 * 两条后端硬规则如实反映在界面上：
 * 1. 生日只允许登记一次（生日券按当月判定，可改就能重复领）；
 * 2. 短信通道没接：生产环境点「获取验证码」必被后端拒绝，
 *    非生产环境后端把验证码回显在 `devCode` 里，界面原样显示，不编「已发送，请注意查收」。
 */
export default defineComponent({
  components: { LineIcon },

  setup() {
    const app = useAppStore();
    const customer = useCustomerStore();
    const orders = useOrderStore();

    const profile = ref<CustomerProfile | null>(null);
    const loading = ref(false);
    const error = ref('');
    const nickname = ref('');
    /** 哪个字段正在提交，避免 confirm + blur 触发两次 PUT */
    const savingField = ref('');
    const sheet = ref('');
    /** onLoad 之后必有一次 onShow，用它挡住这趟重复请求（页面每次显示都重取资料） */
    const shown = ref(false);

    const phoneForm = ref({ phone: '', code: '' });
    const devCode = ref('');
    const phoneError = ref('');
    /** 连点两次「获取验证码」会白吃一次后端 60 秒频控；连点提交则会把一次绑定打成两次请求 */
    const phoneBusy = ref(false);

    /** 手机号一键绑定只在微信小程序里有；H5 与开发者工具的 web 视图仍走验证码通道 */
    const wxMp = isWeixinMp();

    /** 生日选择器的上限：不让人把生日填到未来（生日券判定会永远不满足） */
    const today = isoDate(new Date());

    const initial = computed(() => {
      const name = profile.value?.nickname?.trim();
      if (name) return name.slice(0, 1);
      return profile.value ? String(profile.value.id).slice(-1) : '食';
    });

    const busy = computed(() => savingField.value !== '');

    /** 头像存的是可直接渲染的值（外链或 data URI），空串就画首字符占位 */
    const avatarSrc = computed(() => profile.value?.avatar ?? '');

    async function load(): Promise<void> {
      loading.value = true;
      error.value = '';
      try {
        await ensureSession();
        const data = await fetchProfile();
        profile.value = data;
        nickname.value = data.nickname ?? '';
        // 「我的」页读的是 store 里同一份档案，改完不回写就会看到旧昵称
        customer.profile = data;
      } catch (cause) {
        error.value = (cause as Error).message || '资料加载失败';
      } finally {
        loading.value = false;
      }
    }

    /** 统一的资料提交口：成功回写 store，失败把后端原文 toast（request 已做）后留在原值 */
    async function patch(field: string, payload: Parameters<typeof updateProfile>[0]): Promise<boolean> {
      if (busy.value) return false;
      savingField.value = field;
      try {
        const next = await updateProfile(payload);
        profile.value = next;
        customer.profile = next;
        return true;
      } catch {
        return false;
      } finally {
        savingField.value = '';
      }
    }

    async function saveNickname(): Promise<void> {
      const next = nickname.value.trim();
      if (next === (profile.value?.nickname ?? '')) return;
      if (await patch('nickname', { nickname: next })) {
        nickname.value = profile.value?.nickname ?? '';
        uni.showToast({ title: '昵称已更新', icon: 'none' });
      }
    }

    async function saveGender(value: number): Promise<void> {
      if (profile.value?.gender === value) return;
      await patch(`gender${value}`, { gender: value });
    }

    /** 生日只在未填时给入口：已填就整行只读，改也改不动（后端会直接拒绝） */
    async function pickBirthday(event: { detail: { value: string } }): Promise<void> {
      const value = event.detail.value;
      if (!value || profile.value?.birthday) return;
      if (await patch('birthday', { birthday: value })) {
        uni.showToast({ title: '生日已登记，之后不能再改', icon: 'none' });
      }
    }

    // ==================== 手机号绑定 ====================

    function openPhone(): void {
      phoneForm.value = { phone: '', code: '' };
      devCode.value = '';
      phoneError.value = '';
      sheet.value = 'phone';
    }

    function closeSheet(): void {
      sheet.value = '';
    }

    /**
     * 后端只在非生产环境回显验证码；生产环境直接报「短信通道尚未接入」。
     * 两种结果都如实显示，不写「已发送，请注意查收」—— 那种话在没通道时是骗人。
     */
    async function sendCode(): Promise<void> {
      if (phoneBusy.value) return;
      const phone = phoneForm.value.phone.trim();
      if (!PHONE_RE.test(phone)) {
        phoneError.value = '手机号格式不正确';
        return;
      }
      phoneError.value = '';
      phoneBusy.value = true;
      try {
        const res = await sendPhoneCode(phone);
        if (res.devCode) devCode.value = res.devCode;
      } catch (cause) {
        phoneError.value = (cause as Error).message;
      } finally {
        phoneBusy.value = false;
      }
    }

    async function submitPhone(): Promise<void> {
      if (phoneBusy.value) return;
      const phone = phoneForm.value.phone.trim();
      const code = phoneForm.value.code.trim();
      if (!PHONE_RE.test(phone)) {
        phoneError.value = '手机号格式不正确';
        return;
      }
      if (!CODE_RE.test(code)) {
        phoneError.value = '验证码为 6 位数字';
        return;
      }
      phoneError.value = '';
      phoneBusy.value = true;
      try {
        const next = await bindPhone(phone, code);
        profile.value = next;
        customer.profile = next;
        sheet.value = '';
        uni.showToast({ title: '手机号已绑定', icon: 'none' });
      } catch (cause) {
        // 通道没接、验证码错、号码被占 —— 后端的哪一句都得让顾客看到原话
        phoneError.value = (cause as Error).message;
      } finally {
        phoneBusy.value = false;
      }
    }

    /**
     * 微信「手机号快速验证组件」的回调。
     *
     * 顾客点拒绝时 errMsg 里是 deny/cancel —— 那不是故障，别弹报错；
     * 拿到 code 就交给后端换号（**这是扣费接口，code 用掉就没了**，
     * 所以失败只报原文、绝不自动重试同一个 code）。
     */
    async function onWxPhone(event: { detail?: WxPhoneDetail }): Promise<void> {
      const detail = event.detail ?? {};
      if (!detail.code) {
        const reason = phoneDeniedMessage(detail);
        if (reason) uni.showToast({ title: reason, icon: 'none', duration: 3000 });
        return;
      }
      if (phoneBusy.value) return;
      phoneBusy.value = true;
      try {
        const next = await bindPhoneByWechat(detail.code);
        profile.value = next;
        customer.profile = next;
        uni.showToast({ title: '手机号已绑定', icon: 'none' });
      } catch {
        // 请求层已经把后端的原话弹出来了（额度用完 / 号码已被别的账号绑定 …）
      } finally {
        phoneBusy.value = false;
      }
    }

    // ==================== 偏好与本地数据 ====================

    function pickDining(key: DiningChoice): void {
      app.setDiningType(key);
    }

    /**
     * 清除本机数据 = 清缓存 + 退出当前登录。
     *
     * 原来这里分「清除本地缓存」和「退出登录」两行，但退出根本退不掉：
     * 账号认的是微信号（其次是设备标识），下次进来还是同一个账号。
     * 合成一行并把后果说清楚，比留一个骗人的「退出」按钮诚实。
     */
    function askClear(): void {
      uni.showModal({
        title: '清除本机数据',
        content:
          '会清掉皮肤、就餐方式、桌号、门店记录和这台的订单凭据，并退出当前登录。' +
          '购物车保留；账号认的是你的微信号，重新进入小程序会自动回到同一个账号。',
        confirmText: '清除',
        success: (res) => {
          if (res.confirm) void doClear();
        },
      });
    }

    async function doClear(): Promise<void> {
      CACHE_KEYS.forEach((key) => uni.removeStorageSync(key));
      // store 里各留着一份内存副本：不清掉的话，「订单」页仍然画得出来，直到顾客重启小程序
      orders.refs = [];
      orders.current = null;
      await customer.signOut();
      void app.loadConfig();
      uni.showToast({ title: '本机数据已清除', icon: 'none' });
      uni.reLaunch({ url: '/pages/home/home' });
    }

    /**
     * 小程序里头像就是 chooseAvatar 按钮本身：点圆头像 → 微信的选择面板里
     * 第一项就是他的微信头像。选完立刻转 base64 存库，不留临时路径。
     */
    async function onChooseAvatar(event: { detail?: { avatarUrl?: string } }): Promise<void> {
      const tempPath = String(event.detail?.avatarUrl ?? '');
      if (!tempPath || busy.value) return;
      try {
        await patch('avatar', { avatar: await avatarToDataUri(tempPath) });
        uni.showToast({ title: '头像已更新', icon: 'none' });
      } catch (error) {
        uni.showToast({ title: (error as Error).message, icon: 'none' });
      }
    }

    /** type=nickname 的真值在收起键盘时才进事件，v-model 不一定接得住 */
    function onNicknameBlur(event: { detail?: { value?: string } }): void {
      const value = String(event.detail?.value ?? nickname.value ?? '').trim();
      if (value) nickname.value = value;
      void saveNickname();
    }

    return {
      app,
      profile,
      loading,
      error,
      nickname,
      savingField,
      sheet,
      shown,
      phoneForm,
      devCode,
      phoneError,
      phoneBusy,
      wxMp,
      today,
      initial,
      avatarSrc,
      GENDERS,
      DINING_KEYS,
      DINING_TYPE_LABEL,
      APP_VERSION,
      load,
      saveNickname,
      saveGender,
      onNicknameBlur,
      onChooseAvatar,
      pickBirthday,
      openPhone,
      closeSheet,
      sendCode,
      submitPhone,
      onWxPhone,
      pickDining,
      askClear,
    };
  },

  onLoad() {
    void this.app.loadConfig();
    void this.load();
  },

  onShow() {
    if (this.shown) void this.load();
    this.shown = true;
  },
});
</script>

<template>
  <view class="set" :style="app.cssVars">
    <view v-if="loading && !profile" class="tip">正在加载资料…</view>

    <view v-else-if="error && !profile" class="tip">
      <text>{{ error }}</text>
      <text class="tip__retry" @click="load">重试</text>
    </view>

    <template v-else>
      <text class="group">个人资料</text>
      <view class="rows">
        <view class="cell">
          <view class="row">
            <text class="row__label">头像</text>
            <!-- 小程序里这一整个圆就是 chooseAvatar 按钮；其余环境只能展示，没有可取的头像 -->
            <button v-if="wxMp" class="row__avatar" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
              <image v-if="avatarSrc" class="avatar" :src="avatarSrc" mode="aspectFill" />
              <view v-else class="avatar avatar--text">
                <text>{{ initial }}</text>
              </view>
            </button>
            <block v-else>
              <image v-if="avatarSrc" class="avatar" :src="avatarSrc" mode="aspectFill" />
              <view v-else class="avatar avatar--text">
                <text>{{ initial }}</text>
              </view>
            </block>
          </view>
        </view>

        <view class="cell">
          <view class="row">
            <text class="row__label">昵称</text>
            <input
              v-model="nickname"
              class="row__input"
              :type="wxMp ? 'nickname' : 'text'"
              placeholder="填个称呼"
              placeholder-class="row__ph"
              maxlength="32"
              confirm-type="done"
              @confirm="saveNickname"
              @blur="onNicknameBlur"
            />
            <text v-if="savingField === 'nickname'" class="row__tail">保存中…</text>
          </view>
        </view>

        <view class="cell">
          <view class="row">
            <text class="row__label">性别</text>
            <view class="chips">
              <view
                v-for="item in GENDERS"
                :key="item.value"
                class="chip chips__item"
                :class="{ 'is-on': profile && profile.gender === item.value }"
                @click="saveGender(item.value)"
              >
                <text>{{ item.label }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="cell" :class="{ 'cell--note': !(profile && profile.birthday) }">
          <view class="row">
            <text class="row__label">生日</text>
            <!-- 后端硬规则：库里已有值再传不同生日直接拒绝，所以已填就把整行收成只读 -->
            <template v-if="profile && profile.birthday">
              <text class="row__value num">{{ profile.birthday }}</text>
              <text class="row__tail">登记后不可修改</text>
            </template>
            <picker v-else class="row__wrap" mode="date" :value="today" :end="today" @change="pickBirthday">
              <view class="row__picker">
                <text class="row__value row__value--empty">填写生日</text>
                <LineIcon name="right" :size="14" tone="sub" />
              </view>
            </picker>
          </view>
          <text v-if="profile && !profile.birthday" class="note">
            生日券按生日当月发放，登记后不能再改。
          </text>
        </view>

        <view class="cell" :class="{ 'cell--note': !(profile && profile.phoneBound) }">
          <view class="row">
            <text class="row__label">手机号</text>
            <template v-if="profile && profile.phoneBound">
              <text class="row__value num">{{ profile.phone }}</text>
              <text class="row__tail">绑定后暂不支持自助换绑</text>
            </template>
            <template v-else-if="wxMp">
              <text class="row__value row__value--empty">未绑定</text>
              <button
                class="row__btn"
                :class="{ 'is-off': phoneBusy }"
                open-type="getPhoneNumber"
                @getphonenumber="onWxPhone"
              >
                {{ phoneBusy ? '绑定中…' : '一键绑定' }}
              </button>
            </template>
            <template v-else>
              <text class="row__value row__value--empty">未绑定</text>
              <text class="row__action" @click="openPhone">去绑定</text>
              <LineIcon name="right" :size="14" tone="sub" />
            </template>
          </view>
          <text v-if="profile && !profile.phoneBound" class="note">
            {{
              wxMp
                ? '点「一键绑定」直接取微信绑定的手机号，换手机也不会丢账号；不绑定也能正常下单。'
                : '绑定手机号后门店能直接联系你，账号也和号码对上；不绑定也能正常下单。'
            }}
          </text>
        </view>
      </view>

      <text class="group">点餐偏好</text>
      <view class="rows">
        <view class="cell cell--note">
          <view class="row">
            <text class="row__label">就餐方式</text>
            <view class="chips">
              <view
                v-for="key in DINING_KEYS"
                :key="key"
                class="chip chips__item"
                :class="{ 'is-on': app.diningType === key }"
                @click="pickDining(key)"
              >
                <text>{{ DINING_TYPE_LABEL[key] }}</text>
              </view>
            </view>
          </view>
          <text class="note">改这里不影响价格，只影响这一单怎么记。</text>
        </view>
      </view>

      <text class="group">本地数据</text>
      <view class="rows">
        <view class="cell cell--note">
          <view class="row" @click="askClear">
            <text class="row__label">清除本机数据</text>
            <text class="row__tail">购物车保留</text>
            <LineIcon name="right" :size="14" tone="sub" />
          </view>
          <text class="note">
            会清掉皮肤、就餐方式、桌号、门店记录与这台的订单凭据，并退出当前登录。
            账号认的是你的微信号，重新进入小程序会自动回到同一个账号。
          </text>
        </view>
      </view>

      <text class="group">关于</text>
      <view class="rows">
        <view class="cell">
          <view class="row">
            <text class="row__label">版本</text>
            <text class="row__value num">v{{ APP_VERSION }}</text>
          </view>
        </view>
        <view class="cell cell--note">
          <view class="row">
            <text class="row__label">账号 ID</text>
            <text class="row__value num">{{ profile ? profile.id : '—' }}</text>
          </view>
          <text class="note">发票由门店人工开具；需要更正资料或换绑手机号，请联系店内客服。</text>
        </view>
      </view>
    </template>

    <view v-if="sheet === 'phone'" class="sheet-mask" @click="closeSheet">
      <view class="sheet" @click.stop>
        <view class="sheet__handle" />
        <view class="sheet__head">
          <text class="sheet__title">绑定手机号</text>
        </view>
        <view class="sheet__close" @click="closeSheet">
          <LineIcon name="close" :size="18" tone="sub" />
        </view>

        <view class="sheet__body">
          <view class="field">
            <text class="field__label">手机号</text>
            <input
              v-model="phoneForm.phone"
              class="field__input"
              type="number"
              placeholder="11 位手机号"
              placeholder-class="field__ph"
              maxlength="11"
            />
          </view>

          <view class="field">
            <text class="field__label">验证码</text>
            <input
              v-model="phoneForm.code"
              class="field__input"
              type="number"
              placeholder="6 位数字"
              placeholder-class="field__ph"
              maxlength="6"
            />
            <text class="field__btn" :class="{ 'is-off': phoneBusy }" @click="sendCode">
              {{ phoneBusy ? '发送中…' : '获取验证码' }}
            </text>
          </view>

          <text v-if="devCode" class="field__dev">（联调环境）验证码：{{ devCode }}</text>
          <text v-if="phoneError" class="field__err">{{ phoneError }}</text>

          <text class="note">
            短信通道还没接入：开发环境会把验证码直接显示在这里，正式环境点「获取验证码」会收到后端的真实报错。
          </text>
        </view>

        <view class="sheet__foot">
          <view class="btn-main" :class="{ 'is-off': phoneBusy }" @click="submitPhone">
            {{ phoneBusy ? '正在提交…' : '提交绑定' }}
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 内容型页面：细线分区，不画卡片（ui.md 全局规则） */
.set {
  min-height: 100vh;
  padding: 8rpx var(--content-pad, 28rpx) 80rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.tip {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 160rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: var(--ink-2, #{$n-500});

  &__retry {
    color: var(--brand, #{$brand});
  }
}

.group {
  display: block;
  margin: 40rpx 4rpx 4rpx;
  font-size: 22rpx;
  letter-spacing: 1rpx;
  color: var(--ink-2, #{$n-500});
}

/* 一行一格：说明文字归在本行下面，分割线压在整格底部，不会被读成下一行的开头 */
.cell {
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &:last-child {
    border-bottom: none;
  }

  &--note .row {
    padding-bottom: 10rpx;
  }
}

.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 26rpx 0;

  &__label {
    flex: none;
    font-size: 28rpx;
  }

  /* chooseAvatar 只能是 <button>：抹成圆头像，不带微信默认那层灰底和描边 */
  &__avatar {
    box-sizing: border-box;
    flex: none;
    width: 88rpx;
    height: 88rpx;
    margin: 0 0 0 auto;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: 50%;
    background-color: transparent;

    &::after {
      border: none;
    }
  }

  &__input {
    flex: 1;
    min-width: 0;
    font-size: 28rpx;
    text-align: right;
  }

  &__value {
    flex: 1;
    min-width: 0;
    text-align: right;
    font-size: 28rpx;

    &--empty {
      color: var(--ink-2, #{$n-400});
    }
  }

  &__wrap {
    flex: 1;
    min-width: 0;
  }

  &__picker {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8rpx;
  }

  &__tail {
    flex: none;
    max-width: 260rpx;
    /* 有的行没有 flex:1 的值，靠它把说明与箭头顶到最右，别跟在标题后面 */
    margin-left: auto;
    text-align: right;
    font-size: 20rpx;
    line-height: 1.5;
    color: var(--ink-2, #{$n-400});
  }

  &__action {
    flex: none;
    font-size: 26rpx;
    color: var(--brand, #{$brand});
  }

  /* 手机号组件必须是 <button open-type>，所以把按钮抹回一行文字的样子 */
  &__btn {
    flex: none;
    margin: 0 0 0 auto;
    padding: 0;
    border: none;
    border-radius: 0;
    background-color: transparent;
    line-height: 1.4;
    font-size: 26rpx;
    font-weight: 400;
    color: var(--brand, #{$brand});

    &::after {
      border: none;
    }

    &.is-off {
      opacity: 0.45;
    }
  }

  &__ph {
    color: var(--ink-2, #{$n-400});
  }
}

.avatar {
  width: 88rpx;
  height: 88rpx;
  margin-left: auto;
  flex: none;
  border-radius: 50%;
  background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));

  &--text {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 34rpx;
    color: var(--brand, #{$brand});
  }
}

/* 胶囊选项跟其他行一样右对齐，保持「标题在左、内容在右」的一条竖线 */
.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12rpx;
  margin-left: auto;

  &__item {
    padding: 10rpx 22rpx;
    font-size: 24rpx;
  }
}

.note {
  display: block;
  padding: 0 0 26rpx;
  font-size: 20rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-400});
}

/* 弹层里的说明跟在输入框后面，上间距得自己留 */
.sheet .note {
  padding: 20rpx 0 8rpx;
}

.field {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__label {
    flex: none;
    width: 120rpx;
    font-size: 26rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__input {
    flex: 1;
    min-width: 0;
    font-size: 28rpx;
  }

  &__btn {
    flex: none;
    font-size: 24rpx;
    color: var(--brand, #{$brand});

    &.is-off {
      opacity: 0.45;
    }
  }

  &__ph {
    color: var(--ink-2, #{$n-400});
  }

  /* 联调回显的验证码：和报错文案都直接铺在输入框下面，顾客看得见凭据从哪来 */
  &__dev {
    display: block;
    padding: 16rpx 0 4rpx;
    font-size: 24rpx;
    color: var(--brand-sub, #{$brand-sub});
  }

  &__err {
    display: block;
    padding: 16rpx 0 4rpx;
    font-size: 24rpx;
    line-height: 1.6;
    color: $err;
  }
}
</style>
