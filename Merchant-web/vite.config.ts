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
 * ⚠️ 新增 Element Plus 组件时，需要同步在此补一行对应的 `style/css` 入口。
 */
const OPTIMIZE_DEPS = [
  'vue',
  'vue-router',
  'pinia',
  'axios',
  // 数据大屏：Web-shared 里的 ScreenChart 引的是 echarts 的按需子入口。
  // 与 axios 同一条理由 —— 根目录之外的共享源码用到的依赖必须在这里列出，
  // 否则 Vite 不会替它解析，页面直接报 Failed to resolve import "echarts/charts"。
  'echarts/core',
  'echarts/charts',
  'echarts/components',
  'echarts/renderers',
  'element-plus',
  'element-plus/es',
  '@element-plus/icons-vue',
  'element-plus/es/locale/lang/zh-cn',
  'element-plus/es/components/base/style/css',
  // 「平台积分活动」只读页与桌码管理页的提示条（el-alert）
  'element-plus/es/components/alert/style/css',
  'element-plus/es/components/button/style/css',
  'element-plus/es/components/checkbox/style/css',
  'element-plus/es/components/checkbox-group/style/css',
  'element-plus/es/components/config-provider/style/css',
  'element-plus/es/components/date-picker/style/css',
  'element-plus/es/components/descriptions/style/css',
  'element-plus/es/components/descriptions-item/style/css',
  'element-plus/es/components/dialog/style/css',
  'element-plus/es/components/drawer/style/css',
  'element-plus/es/components/dropdown/style/css',
  'element-plus/es/components/dropdown-item/style/css',
  'element-plus/es/components/dropdown-menu/style/css',
  'element-plus/es/components/empty/style/css',
  'element-plus/es/components/form/style/css',
  'element-plus/es/components/form-item/style/css',
  'element-plus/es/components/icon/style/css',
  'element-plus/es/components/image/style/css',
  // el-image 的开图预览（ImageUploadField 与菜品列表的缩略图）会单独引这个样式入口
  'element-plus/es/components/image-viewer/style/css',
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
  // 评价页的星级展示
  'element-plus/es/components/rate/style/css',
  'element-plus/es/components/scrollbar/style/css',
  'element-plus/es/components/select/style/css',
  'element-plus/es/components/switch/style/css',
  'element-plus/es/components/tab-pane/style/css',
  'element-plus/es/components/table/style/css',
  'element-plus/es/components/table-column/style/css',
  'element-plus/es/components/tabs/style/css',
  'element-plus/es/components/tag/style/css',
  'element-plus/es/components/timeline/style/css',
  'element-plus/es/components/timeline-item/style/css',
];

/**
 * Merchant-web（商户后台）Vite 配置。
 *
 * 与 Admin-web 的差异：端口 5174、登录端为 merchant。
 * 共享层（请求封装 / 类型 / 设计令牌 / 通用组件 / 业务列表页）来自 `Web-shared`。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3100';

  return {
    plugins: [
      vue(),
      Components({
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
       * 共享源码包自身不安装依赖，其内部的 `vue` / `axios` / `element-plus`
       * 等裸导入需要解析到本项目的 node_modules。dedupe 强制这些依赖
       * 始终从项目根解析，顺带保证只加载一份 Vue 实例。
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
      port: 5174,
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
