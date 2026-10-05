import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as authApi from '@shared/api/auth';
import type { LoginParams, Profile } from '@shared/types/auth';
import { Portal, Role, type Permission } from '@shared/types/enums';
import { clearToken, getToken, setToken } from '@shared/utils/auth';
import { hasPermission as checkPermission } from '@shared/utils/permission';

/**
 * 登录态与当前账号信息（收银台）。
 *
 * 与 Admin/Merchant 的唯一差别：登录时携带的 `portal` 是 `CASHIER`。
 * 端归属由服务端校验，平台管理员 / 商户管理员在此会被拒绝（403 / 20007）。
 * 能进收银台的角色只有两个：收银员、门店管理员（见后端 portal-map）。
 *
 * 该 store 会在 `main.ts` 中注册为共享视图的会话实现（见 Web-shared/src/session）。
 */
export const useUserStore = defineStore('user', () => {
  /** 访问令牌，初始化时从本地存储恢复，刷新页面不掉线 */
  const token = ref<string>(getToken());

  /** 当前账号档案；未登录或尚未拉取时为 null */
  const profile = ref<Profile | null>(null);

  const isLoggedIn = computed(() => token.value !== '');
  const permissions = computed<readonly Permission[]>(() => profile.value?.permissions ?? []);
  const displayName = computed(() => profile.value?.nickname || profile.value?.username || '');
  const roleLabel = computed(() => profile.value?.roleLabel ?? '');

  /**
   * 是否平台管理员。
   *
   * 收银台里恒为 false —— 保留该字段是为了复用共享视图
   * （共享视图用它决定是否展示「商户维度」的筛选与字段）。
   */
  const isPlatformAdmin = computed(() => profile.value?.role === Role.PLATFORM_ADMIN);

  /**
   * 是否门店管理员。
   *
   * 门店管理员被允许进收银台替班收银，但比收银员多两项敏感能力：
   * `order:cancel`（取消）与 `payment:refund`（退款），界面据此显示对应入口。
   */
  const isStoreManager = computed(() => profile.value?.role === Role.STORE_MANAGER);

  /** 是否收银员 */
  const isCashier = computed(() => profile.value?.role === Role.CASHIER);

  /** 当前账号所属商户 ID */
  const merchantId = computed(() => profile.value?.merchantId ?? null);

  /**
   * 当前账号绑定的门店 ID。
   *
   * 收银员与门店管理员都是**门店绑定角色**（后端 STORE_BOUND_ROLES），
   * 数据范围被服务端强制限定为本店，前端传的 storeId 一律被忽略；
   * 未绑定门店的这类账号在接口层直接 403。
   */
  const storeId = computed(() => profile.value?.storeId ?? null);

  /** 登录并写入令牌（本工程固定以「收银台」身份登录） */
  async function login(params: Omit<LoginParams, 'portal'>): Promise<Profile> {
    const result = await authApi.login({ ...params, portal: Portal.CASHIER });
    token.value = result.accessToken;
    setToken(result.accessToken);
    profile.value = result.user;
    return result.user;
  }

  /** 拉取当前账号档案（含权限点） */
  async function loadProfile(): Promise<Profile> {
    const data = await authApi.fetchProfile();
    profile.value = data;
    return data;
  }

  /** 退出登录：先通知服务端把令牌拉黑，再清本地状态 */
  async function logout(): Promise<void> {
    try {
      if (token.value) {
        await authApi.logout();
      }
    } catch {
      // 登出接口失败不应阻塞用户离开，本地状态照常清理
    } finally {
      reset();
    }
  }

  /** 仅清理本地登录态 */
  function reset(): void {
    token.value = '';
    profile.value = null;
    clearToken();
  }

  /** 判断当前账号是否拥有指定权限点（多个之间为「或」） */
  function hasPermission(required?: Permission | readonly Permission[]): boolean {
    return checkPermission(permissions.value, required);
  }

  return {
    token,
    profile,
    isLoggedIn,
    permissions,
    displayName,
    roleLabel,
    isPlatformAdmin,
    isStoreManager,
    isCashier,
    merchantId,
    storeId,
    login,
    loadProfile,
    logout,
    reset,
    hasPermission,
  };
});
