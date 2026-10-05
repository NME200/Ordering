<script lang="ts">
import { defineComponent } from 'vue';
import { useAppStore } from '@/store/app';

/**
 * 应用生命周期。
 *
 * 冷启动就把平台下发的装修配置拉回来（带版本号协商），
 * 拉不到就用 store/app 里的兜底主题 —— 顾客不该因为配置接口限流而看到没上色的界面。
 */
export default defineComponent({
  onLaunch() {
    const app = useAppStore();
    app.hydrate();
    void app.loadConfig();
  },
});
</script>

<style>
/*
 * 全局视觉基元：简洁风格的底线写在这里，页面只补自己特有的部分。
 * 规则是「零投影、无卡片框」，分组只允许两种语言 —— 发丝线 .hair 与间隙条 .gap。
 */
page {
  background-color: #ffffff;
  color: #241f1c;
  font-family: 'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', 'Hiragino Sans GB', system-ui, -apple-system, sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
}

/* 金额、单号、时间用等宽数字，避免刷新时数字宽度跳动 */
.num {
  font-family: 'DIN Alternate', 'Bahnschrift', 'JetBrains Mono', Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.hair {
  height: 1rpx;
  background-color: #f0ece9;
}

.gap {
  height: 20rpx;
  background-color: #f7f5f3;
}

/* 状态用圆点 + 文字表达，颜色只作辅助，黑白屏也分得清营业与打烊 */
.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: #d6cfc8;
  flex: none;
}

.dot--on {
  background-color: #3f8f63;
}

.dot--off {
  background-color: #a89e97;
}

.btn {
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: var(--brand, #c2603c);
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 600;
}

.btn.is-off {
  background-color: #e7e2dd;
  color: #a89e97;
}

.btn-ghost {
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border: 1rpx solid #e7e2dd;
  border-radius: 999rpx;
  font-size: 28rpx;
  color: #4b433e;
}
</style>
