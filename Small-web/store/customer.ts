import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ensureSession, fetchOverview, logout as apiLogout, syncWechatIdentity } from '@/api/customer';
import { clearCustomerToken, getLastMerchantId, setLastMerchantId } from '@/utils/auth';
import type { CustomerProfile, MemberAsset, OrderBucket } from '@/types/customer';

const EMPTY_BUCKETS: Record<OrderBucket, number> = { unpaid: 0, processing: 0, review: 0, refund: 0 };

/**
 * 顾客登录态与「我的」页数据。
 *
 * 三条与界面直接相关的约定：
 * 1. **冷启动即静默注册**：顾客没有「登录」这个动作，进小程序就该有 ID，
 *    所以 bootstrap 在 App.onLaunch 里跑，不等用户点「我的」；
 * 2. **资产按商户**：积分 / 余额 / 券数属于当前商户的会员档案，
 *    没进过店时 `member` 为 null，界面必须显示「进店后可见」而不是 0；
 * 3. **失败不弹 toast**：这一页是 Tab 页，网络抖一下就把顾客从页面上吓走没有意义，
 *    保留上一次数据并让界面自己标「未同步」；
 * 4. **注册完补一次微信身份**：只有小程序里做得成，做成之后本地记一笔，
 *    之后每次冷启动都不再发这个请求。
 */
export const useCustomerStore = defineStore('customer', () => {
  const profile = ref<CustomerProfile | null>(null);
  const member = ref<MemberAsset | null>(null);
  const buckets = ref<Record<OrderBucket, number>>({ ...EMPTY_BUCKETS });
  const loading = ref(false);
  /** 已经拉过一次成功数据；用来区分「没数据」和「还没拿到数据」 */
  const ready = ref(false);

  const loggedIn = computed(() => Boolean(profile.value));
  const phoneBound = computed(() => Boolean(profile.value?.phoneBound));

  /** 昵称兜底：设计稿里未登录显示「未登录」，已登录但没填昵称显示「食客 + ID 后四位」 */
  const displayName = computed(() => {
    if (!profile.value) return '未登录';
    return profile.value.nickname?.trim() || `食客${String(profile.value.id).slice(-4)}`;
  });

  /** 资产栏三项。未指定商户时全部给 null，由渲染层显示占位而不是 0 */
  const assets = computed(() => {
    const m = member.value;
    return [
      { key: 'balance', value: m ? (m.balance / 100).toFixed(2) : null },
      { key: 'point', value: m ? String(m.point) : null },
      { key: 'coupon', value: m ? String(m.couponCount) : null },
    ] as { key: 'balance' | 'point' | 'coupon'; value: string | null }[];
  });

  /** 订单角标总数，「我的订单」标题用 */
  const orderTotal = computed(() => Object.values(buckets.value).reduce((a, b) => a + b, 0));

  async function bootstrap(merchantId?: number): Promise<void> {
    if (merchantId) setLastMerchantId(merchantId);
    try {
      await ensureSession();
    } catch {
      // 注册失败不影响浏览菜单，下次进「我的」再试
    }
    // 注册成功后补一次微信身份：老账号只有这一步能拿到 openid
    void syncWechatIdentity();
  }

  /**
   * 拉「我的」页数据。
   *
   * merchantId 不传时用最近一次进店的商户 —— 顾客从首页直接切到「我的」时，
   * 这个值决定资产栏是真实数字还是一排占位。
   */
  async function refresh(merchantId?: number): Promise<void> {
    const scope = merchantId ?? member.value?.merchantId ?? getLastMerchantId() ?? undefined;
    if (loading.value) return;
    loading.value = true;
    try {
      await ensureSession();
      const res = await fetchOverview(scope);
      profile.value = res.profile;
      member.value = res.member;
      buckets.value = res.orderCount?.buckets ?? { ...EMPTY_BUCKETS };
      ready.value = true;
    } catch {
      // 静默：保留上一次的数据
    } finally {
      loading.value = false;
    }
  }

  /** 只刷四桶计数（下单 / 支付 / 取消回来后调用，比重拉整页便宜） */
  async function refreshBuckets(): Promise<void> {
    try {
      const res = await fetchOverview(member.value?.merchantId ?? getLastMerchantId() ?? undefined);
      profile.value = res.profile;
      member.value = res.member;
      buckets.value = res.orderCount?.buckets ?? { ...EMPTY_BUCKETS };
    } catch {
      // 静默
    }
  }

  async function signOut(): Promise<void> {
    try {
      await apiLogout();
    } catch {
      // 后端失败也要清本地，否则顾客会卡在「退不出去的登录态」里
    }
    clearCustomerToken();
    profile.value = null;
    member.value = null;
    buckets.value = { ...EMPTY_BUCKETS };
    ready.value = false;
  }

  return {
    profile,
    member,
    buckets,
    loading,
    ready,
    loggedIn,
    phoneBound,
    displayName,
    assets,
    orderTotal,
    bootstrap,
    refresh,
    refreshBuckets,
    signOut,
  };
});
