import type { Profile } from '../types/auth';
import type { Permission } from '../types/enums';

/**
 * 共享视图与宿主工程之间的**会话契约**。
 *
 * 共享视图（Web-shared/src/views 下的业务列表页）同时被多个前端复用，
 * 它们需要知道「当前账号能做什么」，但不能直接依赖某个工程的 Pinia store
 * （那会让共享包反向依赖宿主目录结构）。
 *
 * 因此约定：各工程在 `main.ts` 启动时调用 `registerSession()` 把自己的
 * user store 注册进来，共享视图通过 `useSession()` 读取。
 *
 * Pinia 的 setup store 天然满足本接口（ref / computed 在 store 代理上已解包），
 * 注册时若类型不匹配会在编译期报错。
 */
export interface SessionContext {
  /** 是否平台管理员 —— 决定是否展示「商户维度」的筛选与字段 */
  readonly isPlatformAdmin: boolean;

  /** 当前账号档案；未登录或尚未拉取时为 null */
  readonly profile: Profile | null;

  /** 拥有的权限点（用于菜单 / 按钮级展示控制） */
  readonly permissions: readonly Permission[];

  /** 判断是否拥有指定权限点（多个之间为「或」） */
  hasPermission(required?: Permission | readonly Permission[]): boolean;
}

let currentSession: SessionContext | null = null;

/** 由各工程在应用启动时注册会话实现 */
export function registerSession(session: SessionContext): void {
  currentSession = session;
}

/** 读取当前会话；未注册时直接报错，避免出现「静默无权限」的诡异表现 */
export function useSession(): SessionContext {
  if (!currentSession) {
    throw new Error(
      '会话未注册：请在应用入口调用 registerSession(useUserStore())（见 Web-shared/src/session/index.ts）',
    );
  }
  return currentSession;
}
