import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { defineConfig, loadEnv } from 'vite';

/**
 * 需要预打包的依赖。
 *
 * 为什么要显式列出：Element Plus 的按需样式入口（`.../style/css`）是随路由
 * 懒加载逐个被发现的，Vite 每发现一个新入口就要重建依赖缓存并删除旧目录。
 * 本机存在 safe-delete 钩子，批量删除超过阈值会被拦截，导致 dev server 直接退出。
 * 把全部入口一次性声明清楚，依赖集合从首次启动就稳定，不再触发重建。
 *
 * 新增 Element Plus 组件时，需要同步在此补一行对应的 `style/css` 入口。
 */
const OPTIMIZE_DEPS = [
  'vue',
  'vue-router',
  'pinia',
  'axios',
  'element-plus',
  'element-plus/es',
  '@element-plus/icons-vue',
  'element-plus/es/locale/lang/zh-cn',
  'element-plus/es/components/base/style/css',
  // 支付配置页用了 el-alert（信息与安全提示）
  'element-plus/es/components/alert/style/css',
  'element-plus/es/components/button/style/css',
  'element-plus/es/components/checkbox/style/css',
  'element-plus/es/components/checkbox-group/style/css',
  'element-plus/es/components/config-provider/style/css',
  'element-plus/es/components/date-picker/style/css',
  'element-plus/es/components/dialog/style/css',
  'element-plus/es/components/dropdown/style/css',
  'element-plus/es/components/dropdown-item/style/css',
  'element-plus/es/components/dropdown-menu/style/css',
  'element-plus/es/components/empty/style/css',
  'element-plus/es/components/form/style/css',
  'element-plus/es/components/form-item/style/css',
  'element-plus/es/components/icon/style/css',
  'element-plus/es/components/image/style/css',
  'element-plus/es/components/input/style/css',
  'element-plus/es/components/input-number/style/css',
  // v-loading 指令会引入 loading 的样式入口
  'element-plus/es/components/loading/style/css',
  'element-plus/es/components/menu/style/css',
  'element-plus/es/components/menu-item/style/css',
  'element-plus/es/components/option/style/css',
  'element-plus/es/components/pagination/style/css',
  'element-plus/es/components/radio/style/css',
  'element-plus/es/components/radio-group/style/css',
  'element-plus/es/components/scrollbar/style/css',
  'element-plus/es/components/select/style/css',
  'element-plus/es/components/switch/style/css',
  'element-plus/es/components/tab-pane/style/css',
  'element-plus/es/components/table/style/css',
  'element-plus/es/components/table-column/style/css',
  'element-plus/es/components/tabs/style/css',
  'element-plus/es/components/tag/style/css',
];

/**
 * Vite 配置。
 *
 * - Element Plus 组件按需引入（见 CODEBUDDY.md 6.6），不整包引入；
 * - 开发环境通过 /api 代理直连后端，避免端口漂移导致的 CORS 失败；
 * - 生产环境由 VITE_API_BASE_URL 指定真实接口地址。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3100';

  return {
    plugins: [
      vue(),
      Components({
        // 仅自动注册模板中用到的 Element Plus 组件及其样式
        resolvers: [ElementPlusResolver()],
        dts: 'src/types/components.d.ts',
        dirs: [],
      }),
    ],
    resolve: {
      alias: {
        /**
         * 三端共享源码包（见 Web-shared/）。
         * ⚠️ 顺序不可调换：`@shared` 必须排在 `@` 之前，
         * 否则 `@shared/x` 会先被 `@` 规则匹配成 `<src>shared/x`。
         */
        '@shared': fileURLToPath(new URL('../Web-shared/src', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
      /**
       * 共享源码包自身**不安装依赖**，它内部的 `vue` / `axios` / `element-plus`
       * 等裸导入需要解析到本项目的 node_modules。
       *
       * 默认情况下 Vite 会从「导入方所在目录」向上查找 node_modules，
       * 而共享包位于本项目之外，向上找不到，构建会直接报
       * `failed to resolve import "axios"`。`dedupe` 强制这些依赖始终
       * 从项目根解析，顺带也保证只加载一份 Vue 实例。
       */
      dedupe: [
        'vue',
        'vue-router',
        'pinia',
        'axios',
        'element-plus',
        '@element-plus/icons-vue',
      ],
    },
    optimizeDeps: {
      include: OPTIMIZE_DEPS,
    },
    server: {
      host: true,
      port: 5173,
      fs: {
        // 允许 dev server 读取项目目录之外的共享源码
        allow: [fileURLToPath(new URL('..', import.meta.url))],
      },
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 1200,
    },
  };
});

