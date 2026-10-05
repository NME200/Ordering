/// <reference types="vite/client" />

/** 环境变量类型声明，保证 `import.meta.env.*` 全程有类型（禁止 any） */
interface ImportMetaEnv {
  /** 接口基础路径 */
  readonly VITE_API_BASE_URL: string;
  /** 仅开发环境：Vite 代理目标 */
  readonly VITE_PROXY_TARGET?: string;
  /** 应用标题 */
  readonly VITE_APP_TITLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** 允许在 TS 中导入 .vue 单文件组件 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
