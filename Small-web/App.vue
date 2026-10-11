<script lang="ts">
import { defineComponent } from 'vue';
import { useAppStore } from '@/store/app';
import { useCustomerStore } from '@/store/customer';
import { applyScanQuery } from '@/utils/scan';

/**
 * 应用生命周期。
 *
 * 冷启动就把平台下发的装修配置拉回来（带版本号协商），并把主色同步到原生 tabBar，
 * 否则会出现「页面是新的、底部导航还是出厂色」这种割裂。
 * 弹窗队列挂在首页触发，不在这里发 —— 冷启动弹窗要等首屏画完，见 utils/popup-manager。
 */
export default defineComponent({
  onLaunch() {
    const app = useAppStore();
    app.hydrate();
    void app.loadConfig();
    // 静默注册：顾客没有「登录」这个动作，进小程序就该有 ID，
    // 否则第一次点「我的」会看到一整页空壳。失败不打扰，进页面时 store 会再试。
    void useCustomerStore().bootstrap();
  },

  /**
   * 扫码入座：微信把小程序码里的 scene 放在进入参数的 `query.scene` 里，
   * 冷启动和后台切前台都要重新读一次（扫第二张桌的码也走这里）。
   * 桌号只认码，界面上没有手填的地方。
   *
   * 用 `getEnterOptionsSync` 而不是 onShow 的入参：uni 的 App 钩子类型声明成无参，
   * 加参数会编译不过。H5 没有这个 API，靠点餐页自己读 query 兜底。
   */
  onShow() {
    const getter = (
      uni as unknown as { getEnterOptionsSync?: () => { query?: Record<string, unknown> } }
    ).getEnterOptionsSync;
    if (typeof getter !== 'function') return;
    applyScanQuery(getter.call(uni)?.query ?? null);
  },
});
</script>

<style>
/*
 * 全局视觉基元（ui.md v3）：极浅暖灰白底 + 半透明白毛玻璃卡片 + 暖橙胶囊 CTA。
 *
 * 两条硬规则：
 * 1. 所有强调色只允许 `var(--brand)` / `var(--brand-sub)`，由平台装修配置运行期下发；
 *    写死 SCSS 色值的地方平台改色就跟不上（上一轮的真实事故）。
 * 2. 卡片只用「半透明白 + 毛玻璃」收边，不给投影；浏览型页面才用卡片，
 *    内容型页面（确认订单 / 订单列表 / 订单详情 / 地址）直接铺在背景上，靠细分割线分区。
 */
page {
  background-color: var(--page-bg, #faf8f6);
  color: var(--ink, #3a322c);
  font-family: 'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', 'Hiragino Sans GB', system-ui, -apple-system, sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
}

/* 金额、单号、时间用等宽数字，避免刷新时数字宽度跳动 */
.num {
  font-family: 'DIN Alternate', 'Bahnschrift', 'JetBrains Mono', Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

/* 浏览型页面的容器：半透明白 + 毛玻璃，透出下方暖灰底 */
.card {
  background-color: var(--card-bg, rgba(255, 255, 255, 0.7));
  backdrop-filter: blur(20px);
  border-radius: var(--radius, 16px);
}

/* 内容型页面的分组手段：极细分割线 */
.hair {
  height: 1rpx;
  background-color: var(--divider, #efebe7);
}

/* 主按钮：胶囊，主色实心 */
.btn-main {
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  border-radius: 48rpx;
  background-color: var(--brand, #c8752b);
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
}

.btn-main.is-off {
  background-color: var(--divider, #efebe7);
  color: var(--ink-2, #9a908a);
}

/* 次按钮：白底 + 主色描边 + 主色字 */
.btn-ghost {
  height: 84rpx;
  line-height: 82rpx;
  text-align: center;
  border: 1rpx solid var(--brand, #c8752b);
  border-radius: 42rpx;
  background-color: rgba(255, 255, 255, 0.6);
  font-size: 28rpx;
  color: var(--brand, #c8752b);
}

/* 菜品行右侧的圆形加号：主色实心圆 */
.round-btn {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--brand, #c8752b);
  color: #fff;
  font-size: 34rpx;
  flex: none;
}

.round-btn--plain {
  background-color: rgba(255, 255, 255, 0.7);
  border: 1rpx solid var(--divider, #efebe7);
  color: var(--ink-2, #9a908a);
}

/* 规格胶囊：未选 = 浅灰底；选中 = **主色实底白字**（ui.md 第 4 节） */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx 32rpx;
  border-radius: 999rpx;
  background-color: var(--chip-bg, #f4f1ee);
  font-size: 26rpx;
  color: var(--ink, #3a322c);
}

.chip.is-on {
  background-color: var(--brand, #c8752b);
  color: #fff;
  font-weight: 600;
}

.chip.is-off {
  opacity: 0.4;
}

/* 状态用圆点 + 文字，颜色只作辅助通道 */
.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: var(--divider, #efebe7);
  flex: none;
}

.dot--on {
  background-color: #3f8f63;
}

.dot--off {
  background-color: #c3bab2;
}

/* 底部抽屉：顶部 24px 圆角，半透明白毛玻璃（弹层比卡片更不透明，保证可读） */
.sheet-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 30;
  background-color: rgba(58, 50, 44, 0.55);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px);
  border-radius: 48rpx 48rpx 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  flex-direction: column;
  max-height: 84vh;
}

.sheet__handle {
  width: 72rpx;
  height: 8rpx;
  margin: 16rpx auto 0;
  border-radius: 999rpx;
  background-color: var(--divider, #efebe7);
}

.sheet__close {
  position: absolute;
  top: 24rpx;
  right: 28rpx;
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet__head {
  box-sizing: border-box;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 24rpx 32rpx 8rpx;
}

.sheet__title {
  font-size: 34rpx;
  font-weight: 700;
}

.sheet__body {
  flex: 1;
  box-sizing: border-box;
  width: 100%;
  padding: 8rpx 32rpx;
}

.sheet__foot {
  box-sizing: border-box;
  width: 100%;
  padding: 20rpx 32rpx 32rpx;
}
</style>
