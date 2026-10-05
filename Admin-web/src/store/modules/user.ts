import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as authApi from '@shared/api/auth';
import type { LoginParams, Profile } from '@shared/types/auth';
import { Role, Portal, type Permission } from '@shared/types/enums';
import { clearToken, getToken, setToken } from '@shared/utils/auth';
import { hasPermission as checkPermission } from '@shared/utils/permission';

/**
 * 登录态与当前账号信息。
 *
 * 只保存「跨组件共享」的状态：令牌与当前账号档案；
 * 权限点由后端 profile 返回，前端据此做菜单 / 按钮级展示控制。
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
  const isPlatformAdmin = computed(() => profile.value?.role === Role.PLATFORM_ADMIN);

  /**
   * 登录并写入令牌。
   *
   * 本工程固定以「平台管理端」身份登录：端归属由服务端校验，
   * 商户 / 收银员账号在此会被拒绝（403 / 20007），这是预期行为。
   */
  async function login(params: Omit<LoginParams, 'portal'>): Promise<Profile> {
    const result = await authApi.login({ ...params, portal: Portal.ADMIN });
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

  /**
   * 判断当前账号是否属于指定角色（未声明即放行）。
   *
   * 与权限点的区别：权限点是可以被授权下放的，角色不行。
   * 平台账户与「给运营专员授权」这件事必须留在平台管理员手里，
   * 所以那条路由用 roles 而不是 permission 把关。
   */
  function hasRole(required?: readonly Role[]): boolean {
    if (!required || required.length === 0) {
      return true;
    }
    const role = profile.value?.role;
    return role !== undefined && required.includes(role);
  }

  return {
    token,
    profile,
    isLoggedIn,
    permissions,
    displayName,
    roleLabel,
    isPlatformAdmin,
    login,
    loadProfile,
    logout,
    reset,
    hasPermission,
    hasRole,
  };
});
