<script lang="ts">
import { defineComponent, ref, watch, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import { bindPhoneByWechat, updateProfile } from '@/api/customer';
import { useCustomerStore } from '@/store/customer';
import { avatarToDataUri, phoneDeniedMessage, type WxPhoneDetail } from '@/utils/wx';
import type { CustomerProfile } from '@/types/customer';

/**
 * 「微信一键登录」半屏面板。
 *
 * 先说清一件事：**微信从 2022-10 起不再让小程序直接读昵称和头像**
 * （`getUserProfile` 现在只会回「微信用户」+ 灰色头像，那是假数据）。
 * 官方给的替代是「头像昵称填写能力」：
 * - `<button open-type="chooseAvatar">` 弹出的选择面板里，第一项就是他的微信头像，点一下即选中；
 * - `<input type="nickname">` 聚焦时键盘上方出现「使用微信昵称」，点一下就填好。
 * 所以这里最少是两下点击，做不到零点击 —— 市面所有小程序都是这个交互，
 * 面板里那句说明就是为了让顾客明白这不是我们偷懒。
 *
 * 头像选完必须**当场转 base64 上传**：微信给的是本机一次性临时路径，
 * 直接存库的话别人打不开、顾客重启就失效（口径见后端 Customer.avatar）。
 */
export default defineComponent({
  name: 'WechatLoginSheet',
  components: { LineIcon },

  props: {
    visible: { type: Boolean, default: false },
    profile: { type: Object as PropType<CustomerProfile | null>, default: null },
  },

  emits: {
    close: () => true,
    saved: (_profile: CustomerProfile) => true,
  },

  setup(props, { emit }) {
    const customer = useCustomerStore();

    const nickname = ref('');
    const avatar = ref('');
    const phone = ref('');
    const phoneBusy = ref(false);
    const avatarBusy = ref(false);
    const saving = ref(false);

    /** 每次打开都以账号现状为准：顾客可能刚在设置页改过昵称 */
    watch(
      () => props.visible,
      (open) => {
        if (!open) return;
        nickname.value = props.profile?.nickname ?? '';
        avatar.value = props.profile?.avatar ?? '';
        phone.value = props.profile?.phone ?? '';
      },
      { immediate: true },
    );

    async function onChooseAvatar(event: { detail?: { avatarUrl?: string } }): Promise<void> {
      const tempPath = String(event.detail?.avatarUrl ?? '');
      if (!tempPath) {
        uni.showToast({ title: '没有选到头像，请再点一次', icon: 'none' });
        return;
      }
      if (avatarBusy.value) return;
      avatarBusy.value = true;
      try {
        avatar.value = await avatarToDataUri(tempPath);
      } catch (error) {
        uni.showToast({ title: (error as Error).message, icon: 'none' });
      } finally {
        avatarBusy.value = false;
      }
    }

    /** type=nickname 的真值是在收起键盘时才落到事件里的，v-model 不一定接得住 */
    function onNicknameBlur(event: { detail?: { value?: string } }): void {
      nickname.value = String(event.detail?.value ?? nickname.value ?? '').trim();
    }

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
        customer.profile = next;
        phone.value = next.phone ?? '';
        uni.showToast({ title: '手机号已绑定', icon: 'none' });
      } catch {
        // 请求层已经把微信/后端的原话弹出来了
      } finally {
        phoneBusy.value = false;
      }
    }

    async function submit(): Promise<void> {
      const payload: { nickname?: string; avatar?: string } = {};
      const name = nickname.value.trim();
      if (name) payload.nickname = name;
      if (avatar.value) payload.avatar = avatar.value;
      // 什么都没动：直接收起，不发一个空 PUT
      if (!payload.nickname && !payload.avatar) {
        emit('close');
        return;
      }
      if (saving.value) return;
      saving.value = true;
      try {
        const next = await updateProfile(payload);
        customer.profile = next;
        uni.showToast({ title: '资料已更新', icon: 'none' });
        emit('saved', next);
        emit('close');
      } catch {
        // 同上：后端原因已由请求层弹出
      } finally {
        saving.value = false;
      }
    }

    return {
      nickname,
      avatar,
      phone,
      phoneBusy,
      avatarBusy,
      saving,
      onChooseAvatar,
      onNicknameBlur,
      onWxPhone,
      submit,
      close: () => emit('close'),
    };
  },
});
</script>

<template>
  <view v-if="visible" class="sheet-mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="sheet__handle" />
      <view class="sheet__head">
        <text class="sheet__title">微信一键登录</text>
      </view>
      <view class="sheet__close" @click="close">
        <LineIcon name="close" :size="18" tone="sub" />
      </view>

      <view class="sheet__body">
        <view class="wx-login__pick">
          <button class="wx-login__avatar" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
            <image v-if="avatar" class="wx-login__avatar-img" :src="avatar" mode="aspectFill" />
            <view v-else class="wx-login__avatar-ph">
              <LineIcon name="user" :size="34" tone="sub" />
            </view>
          </button>
          <text class="wx-login__hint">{{ avatarBusy ? '正在读取头像…' : '点一下选头像' }}</text>
        </view>

        <view class="wx-login__row">
          <text class="wx-login__label">昵称</text>
          <input
            v-model="nickname"
            class="wx-login__input"
            type="nickname"
            placeholder="点键盘上方的微信昵称"
            placeholder-class="wx-login__ph"
            maxlength="32"
            confirm-type="done"
            @blur="onNicknameBlur"
            @confirm="onNicknameBlur"
          />
        </view>

        <view class="wx-login__row">
          <text class="wx-login__label">手机号</text>
          <text v-if="phone" class="wx-login__value num">{{ phone }}</text>
          <text v-if="phone" class="wx-login__tag">已绑定</text>
          <button
            v-else
            class="wx-login__btn"
            :class="{ 'is-off': phoneBusy }"
            open-type="getPhoneNumber"
            @getphonenumber="onWxPhone"
          >
            {{ phoneBusy ? '绑定中…' : '一键绑定' }}
          </button>
        </view>

        <text class="wx-login__note">
          微信已不允许小程序直接读取昵称和头像，所以上面两处需要你各点一下确认；
          不填也能正常下单，只是「我的」页会一直显示食客编号。
        </text>
      </view>

      <view class="sheet__foot">
        <view class="btn-main" :class="{ 'is-off': saving }" @click="submit">
          {{ saving ? '正在保存…' : '完成' }}
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 面板本体沿用 App.vue 的 .sheet-* 全局样式，这里只画内容 */
.wx-login__pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx 0 8rpx;
}

/* chooseAvatar 只能是 <button>，所以把按钮样式全部抹平 */
.wx-login__avatar {
  box-sizing: border-box;
  width: 160rpx;
  height: 160rpx;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1rpx solid var(--divider, #{$n-200});
  border-radius: 50%;
  background-color: var(--chip-bg, #{$n-100});

  &::after {
    border: none;
  }
}

.wx-login__avatar-img {
  width: 100%;
  height: 100%;
}

.wx-login__avatar-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wx-login__hint {
  font-size: 22rpx;
  color: var(--ink-2, #{$n-400});
}

.wx-login__row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});
}

.wx-login__label {
  flex: none;
  width: 120rpx;
  font-size: 28rpx;
}

.wx-login__input {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  text-align: right;
}

.wx-login__value {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  text-align: right;
}

.wx-login__tag {
  flex: none;
  font-size: 22rpx;
  color: #3f8f63;
}

.wx-login__btn {
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

.wx-login__ph {
  color: var(--ink-2, #{$n-400});
}

.wx-login__note {
  display: block;
  padding: 20rpx 0 8rpx;
  font-size: 20rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-400});
}
</style>
