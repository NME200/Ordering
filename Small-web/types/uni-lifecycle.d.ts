import 'vue';

/**
 * 页面生命周期钩子的类型声明。
 *
 * uni-app 的 `onLoad` / `onShow` 等是**页面组件选项**，不在 Vue 的类型里；
 * 而 Composition API 的 `@dcloudio/uni-app` 只有 Vue2 版能装进 HBuilderX 项目
 * （Vue3 运行时由 HBuilderX 内置提供），所以这里走「选项式钩子 + 补声明」这条路。
 */
declare module 'vue' {
  interface ComponentCustomOptions {
    onLoad?(query: Record<string, string | undefined>): void;
    onShow?(): void;
    onHide?(): void;
    onReady?(): void;
    onPullDownRefresh?(): void;
    onReachBottom?(): void;
    onUnload?(): void;
    onShareAppMessage?(res: { from: string }): Record<string, unknown>;
  }
}
