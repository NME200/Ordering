<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import {
  createAddress,
  ensureSession,
  fetchAddresses,
  removeAddress,
  setDefaultAddress,
  updateAddress,
} from '@/api/customer';
import { useAppStore } from '@/store/app';
import type { CustomerAddress } from '@/types/customer';

/** 标签只给这三类：后端 `tag` 是自由文本，但参考稿就是这三档，多给反而没人挑 */
const TAGS = ['家', '公司', '学校'];

/** 与后端 PHONE_PATTERN 同一条正则，前端先拦住，省一次无谓的 400 */
const PHONE_RE = /^1[3-9]\d{9}$/;

/** 与后端 MAX_ADDRESS_PER_CUSTOMER 对齐；写在这里是为了能把按钮置灰而不是等提交报错 */
const MAX_ADDRESS = 20;

/**
 * 后端出参是**明文**手机号（下单要原样带给商家），打码只发生在列表展示这一层：
 * 这是顾客自己的地址，编辑时必须回填明文，否则保存下来就成了 138\*\*\*\*8888。
 */
function maskPhone(phone: string): string {
  return PHONE_RE.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone;
}

interface AddressForm {
  receiverName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  tag: string;
  isDefault: boolean;
}

function emptyForm(): AddressForm {
  return {
    receiverName: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    tag: '',
    isDefault: false,
  };
}

/**
 * 收货地址（ui.md 第 12 节）。
 *
 * 内容型页面：条目直接铺在背景上，行间只用一条 `var(--divider)` 细线，
 * 不画卡片、不给阴影 —— 地址是「读信息」的地方，卡片只会把密度压下去。
 */
export default defineComponent({
  components: { LineIcon },

  setup() {
    const app = useAppStore();

    const list = ref<CustomerAddress[]>([]);
    const loading = ref(false);
    const error = ref('');

    const sheetOpen = ref(false);
    const saving = ref(false);
    /** null 表示新增；非 null 是正在编辑的那条 ID */
    const editingId = ref<number | null>(null);
    const form = ref<AddressForm>(emptyForm());

    async function load(): Promise<void> {
      loading.value = true;
      error.value = '';
      try {
        // 地址接口全部要求顾客令牌；冷启动直接进这一页时令牌可能还没有
        await ensureSession();
        list.value = await fetchAddresses();
      } catch (cause) {
        error.value = (cause as Error).message || '地址加载失败';
      } finally {
        loading.value = false;
      }
    }

    const full = computed(() => list.value.length >= MAX_ADDRESS);

    function openCreate(): void {
      if (full.value) {
        uni.showToast({ title: `最多保存 ${MAX_ADDRESS} 个收货地址`, icon: 'none' });
        return;
      }
      editingId.value = null;
      form.value = emptyForm();
      sheetOpen.value = true;
    }

    function openEdit(item: CustomerAddress): void {
      editingId.value = item.id;
      form.value = {
        receiverName: item.receiverName,
        phone: item.phone,
        province: item.province,
        city: item.city,
        district: item.district,
        detail: item.detail,
        tag: item.tag ?? '',
        isDefault: item.isDefault,
      };
      sheetOpen.value = true;
    }

    function closeSheet(): void {
      if (saving.value) return;
      sheetOpen.value = false;
    }

    /** 再点已选中的标签等于取消：标签是选填，只能有一个取消入口 */
    function pickTag(tag: string): void {
      form.value.tag = form.value.tag === tag ? '' : tag;
    }

    function validate(): string {
      const value = form.value;
      if (!value.receiverName.trim()) return '请填写收货人';
      if (!PHONE_RE.test(value.phone.trim())) return '手机号格式不正确';
      if (!value.province.trim() || !value.city.trim() || !value.district.trim()) {
        return '省、市、区都要填';
      }
      if (!value.detail.trim()) return '请填写详细地址';
      return '';
    }

    async function save(): Promise<void> {
      if (saving.value) return;
      const message = validate();
      if (message) {
        uni.showToast({ title: message, icon: 'none' });
        return;
      }
      const value = form.value;
      const payload = {
        receiverName: value.receiverName.trim(),
        phone: value.phone.trim(),
        province: value.province.trim(),
        city: value.city.trim(),
        district: value.district.trim(),
        detail: value.detail.trim(),
        tag: value.tag || null,
      };

      saving.value = true;
      try {
        if (editingId.value === null) {
          const created = await createAddress(payload);
          // 默认位走 /default：它在同一事务里清零其它地址的默认位，
          // create 的 isDefault 只负责「第一条无条件默认」这一件事。
          if (value.isDefault && !created.isDefault) await setDefaultAddress(created.id);
        } else {
          // 取消默认是允许的操作（后端注释明确写了不该静默发生），所以 0 也要显式传
          await updateAddress(editingId.value, { ...payload, isDefault: value.isDefault ? 1 : 0 });
        }
        sheetOpen.value = false;
        await load();
        uni.showToast({ title: '已保存', icon: 'none' });
      } catch {
        // request 已把后端原文 toast 出来，这里保持弹层不关闭让顾客改
      } finally {
        saving.value = false;
      }
    }

    function askRemove(item: CustomerAddress): void {
      uni.showModal({
        title: '删除地址',
        content: `确定删除「${item.receiverName}」的「${item.fullAddress}」吗？`,
        confirmText: '删除',
        success: (res) => {
          if (res.confirm) void doRemove(item.id);
        },
      });
    }

    async function doRemove(id: number): Promise<void> {
      try {
        await removeAddress(id);
        await load();
      } catch {
        // 后端原文已 toast
      }
    }

    return {
      app,
      list,
      loading,
      error,
      full,
      sheetOpen,
      saving,
      editingId,
      form,
      TAGS,
      MAX_ADDRESS,
      maskPhone,
      load,
      openCreate,
      openEdit,
      closeSheet,
      pickTag,
      save,
      askRemove,
    };
  },

  onLoad() {
    void this.app.loadConfig();
    void this.load();
  },

  onPullDownRefresh() {
    void this.load().finally(() => uni.stopPullDownRefresh());
  },
});
</script>

<template>
  <view class="addr" :style="app.cssVars">
    <view v-if="loading && !list.length" class="tip">正在加载地址…</view>

    <view v-else-if="error" class="tip">
      <text>{{ error }}</text>
      <text class="tip__retry" @click="load">重试</text>
    </view>

    <view v-else-if="!list.length" class="tip">
      <text>还没有收货地址</text>
      <text class="tip__sub">外卖配送的单子要用收货地址，先把默认地址存好</text>
    </view>

    <view v-else class="list">
      <view v-for="item in list" :key="item.id" class="item">
        <view class="item__pic">
          <LineIcon name="address" :size="16" tone="sub" />
        </view>
        <view class="item__main">
          <view class="item__top">
            <text class="item__name">{{ item.receiverName }}</text>
            <text class="item__phone num">{{ maskPhone(item.phone) }}</text>
            <text v-if="item.tag" class="item__tag">{{ item.tag }}</text>
            <text v-if="item.isDefault" class="item__default">默认</text>
          </view>
          <text class="item__full">{{ item.fullAddress }}</text>
        </view>
        <view class="item__ops">
          <view class="op" @click="openEdit(item)">
            <LineIcon name="edit" :size="18" tone="sub" />
          </view>
          <view class="op" @click="askRemove(item)">
            <LineIcon name="trash" :size="18" tone="sub" />
          </view>
        </view>
      </view>
      <text class="end num">{{ list.length }} / {{ MAX_ADDRESS }}</text>
    </view>

    <view class="bar">
      <view class="btn-main" :class="{ 'is-off': full }" @click="openCreate">＋ 新增收货地址</view>
    </view>

    <view v-if="sheetOpen" class="sheet-mask" @click="closeSheet">
      <view class="sheet" @click.stop>
        <view class="sheet__handle" />
        <view class="sheet__head">
          <text class="sheet__title">{{ editingId === null ? '新增收货地址' : '编辑收货地址' }}</text>
        </view>
        <view class="sheet__close" @click="closeSheet">
          <LineIcon name="close" :size="18" tone="sub" />
        </view>

        <scroll-view class="sheet__body" scroll-y>
          <view class="field">
            <text class="field__label">收货人</text>
            <input
              v-model="form.receiverName"
              class="field__input"
              placeholder="姓名"
              placeholder-class="field__ph"
              maxlength="32"
            />
          </view>

          <view class="field">
            <text class="field__label">手机号</text>
            <input
              v-model="form.phone"
              class="field__input"
              type="number"
              placeholder="11 位手机号"
              placeholder-class="field__ph"
              maxlength="11"
            />
          </view>

          <view class="field field--stack">
            <text class="field__label">省市区</text>
            <view class="region">
              <input
                v-model="form.province"
                class="region__input"
                placeholder="省"
                placeholder-class="field__ph"
                maxlength="32"
              />
              <input
                v-model="form.city"
                class="region__input"
                placeholder="市"
                placeholder-class="field__ph"
                maxlength="32"
              />
              <input
                v-model="form.district"
                class="region__input"
                placeholder="区/县"
                placeholder-class="field__ph"
                maxlength="32"
              />
            </view>
          </view>
          <!-- 包里没带行政区划数据，也不该为了三段文本引第三方字典：手填一次的成本远低于多几百 KB 首屏 -->
          <text class="hint">没有内置地区字典，按快递面单的习惯填三段，例如「广东省」「深圳市」「南山区」。</text>

          <view class="field">
            <text class="field__label">详细地址</text>
            <input
              v-model="form.detail"
              class="field__input"
              placeholder="街道、门牌号、楼层房间号"
              placeholder-class="field__ph"
              maxlength="255"
            />
          </view>

          <view class="field field--stack">
            <text class="field__label">标签</text>
            <view class="chips">
              <view
                v-for="tag in TAGS"
                :key="tag"
                class="chip chips__item"
                :class="{ 'is-on': form.tag === tag }"
                @click="pickTag(tag)"
              >
                <text>{{ tag }}</text>
              </view>
            </view>
          </view>

          <view class="field">
            <text class="field__label">设为默认</text>
            <view class="switch" :class="{ 'is-on': form.isDefault }" @click="form.isDefault = !form.isDefault">
              <view class="switch__dot" />
            </view>
            <text class="field__tail">第一条地址会自动成为默认</text>
          </view>

          <text class="hint">收货人手机号会原样给到门店，用于配送联系；列表里显示的是打码后的号码。</text>
        </scroll-view>

        <view class="sheet__foot">
          <view class="btn-main" :class="{ 'is-off': saving }" @click="save">
            {{ saving ? '正在保存…' : '保存' }}
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* 内容型页面：只铺背景 + 细线，卡片一律不画（ui.md 全局规则、第 12 节） */
.addr {
  min-height: 100vh;
  padding: 8rpx var(--content-pad, 28rpx) 240rpx;
  background-color: var(--page-bg, #{$n-50});
  color: var(--ink, #{$n-900});
}

.tip {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 140rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: var(--ink-2, #{$n-500});

  &__retry {
    color: var(--brand, #{$brand});
  }

  &__sub {
    font-size: 22rpx;
    line-height: 1.6;
    color: var(--ink-2, #{$n-400});
  }
}

.item {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  padding: 30rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &__pic {
    flex: none;
    padding-top: 6rpx;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__top {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  &__name {
    font-size: 30rpx;
    font-weight: 600;
  }

  &__phone {
    font-size: 26rpx;
    color: var(--ink-2, #{$n-500});
  }

  &__tag {
    padding: 2rpx 12rpx;
    border-radius: 999rpx;
    background-color: var(--brand-soft, rgba(200, 117, 43, 0.08));
    font-size: 20rpx;
    color: var(--brand-sub, #{$brand-sub});
  }

  /* 参考稿的「默认」就是一枚橙色小字，不做底色 */
  &__default {
    font-size: 22rpx;
    font-weight: 600;
    color: var(--brand, #{$brand});
  }

  &__full {
    display: block;
    margin-top: 8rpx;
    font-size: 26rpx;
    line-height: 1.6;
    color: var(--ink-2, #{$n-500});
  }

  &__ops {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8rpx;
  }
}

.op {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.end {
  display: block;
  margin-top: 28rpx;
  text-align: center;
  font-size: 20rpx;
  color: var(--ink-2, #{$n-400});
}

.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  padding: 20rpx var(--content-pad, 28rpx) calc(20rpx + env(safe-area-inset-bottom));
  background-color: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  border-top: 1rpx solid var(--divider, #{$n-200});
}

.field {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});

  &--stack {
    flex-direction: column;
    align-items: flex-start;
    gap: 16rpx;
  }

  &__label {
    flex: none;
    width: 140rpx;
    font-size: 26rpx;
    color: var(--ink-2, #{$n-500});
  }

  &--stack &__label {
    width: auto;
  }

  &__input {
    flex: 1;
    min-width: 0;
    font-size: 28rpx;
  }

  &__tail {
    flex: 1;
    text-align: right;
    font-size: 20rpx;
    color: var(--ink-2, #{$n-400});
  }

  &__ph {
    color: var(--ink-2, #{$n-400});
  }
}

.region {
  display: flex;
  align-items: center;
  gap: 12rpx;
  box-sizing: border-box;
  width: 100%;

  &__input {
    flex: 1;
    min-width: 0;
    height: 72rpx;
    padding: 0 16rpx;
    border-radius: var(--radius, 16px);
    background-color: var(--divider, #{$n-200});
    font-size: 26rpx;
  }
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;

  &__item {
    font-size: 26rpx;
  }
}

/* 自绘开关：原生 switch 的着色只能传色值字面量，吃不到 var(--brand)，换肤会脱节 */
.switch {
  box-sizing: border-box;
  width: 88rpx;
  height: 48rpx;
  padding: 4rpx;
  border-radius: 999rpx;
  background-color: var(--divider, #{$n-200});
  transition: background-color 0.2s;

  &__dot {
    width: 40rpx;
    height: 40rpx;
    border-radius: 50%;
    background-color: #fff;
  }

  &.is-on {
    background-color: var(--brand, #{$brand});

    .switch__dot {
      margin-left: 40rpx;
    }
  }
}

.hint {
  display: block;
  padding: 12rpx 0 4rpx;
  font-size: 20rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-400});
}
</style>
