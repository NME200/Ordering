import { reactive } from 'vue';
import { fetchPopupQueue, reportPopupEvent } from '@/api/public';
import { getVisitorKey } from '@/utils/visitor';
import { openLink } from '@/utils/nav';
import type { PopupItem, PopupScene } from '@/types/api';

const RECORD_KEY = 'popup-show-record-v1';

/** 本地频次记录：popupId → 最近一次的展示日期与是否点过 */
interface ShowRecord {
  date?: string;
  clicked?: boolean;
}

type RecordMap = Record<string, ShowRecord>;

/**
 * 弹窗容器要画的东西。页面直接绑这个对象即可 ——
 * 队列、频次、埋点全在下面处理，页面不参与策略。
 */
export const popupView = reactive({
  current: null as PopupItem | null,
  /** 1/N 角标：让顾客知道关掉还有一个，不至于以为关不完 */
  index: 0,
  total: 0,
});

let queue: PopupItem[] = [];
let showing = false;
let fetching = false;

function readRecords(): RecordMap {
  try {
    const raw = uni.getStorageSync(RECORD_KEY);
    return raw ? (JSON.parse(raw) as RecordMap) : {};
  } catch {
    return {};
  }
}

function write(id: number, patch: ShowRecord): void {
  const all = readRecords();
  all[id] = { ...all[id], ...patch };
  uni.setStorageSync(RECORD_KEY, all);
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 能不能弹：本地判频次。
 *
 * 后端不判这件事（匿名接口认不得「这个人」），所以本地记录是第一道闸；
 * 同时每次展示都回写 show_log，运营看到的是权威数据，两道不互相依赖。
 * 点过一次就再也不弹 —— 有转化意图的人不该被继续打扰。
 */
function canShow(popup: PopupItem, records: RecordMap): boolean {
  const record = records[popup.popupId];
  if (record?.clicked) return false;
  if (popup.frequency === 'once') return !record;
  if (popup.frequency === 'daily') return record?.date !== today();
  return true;
}

function show(next: PopupItem): void {
  queue = queue.filter((item) => item.popupId !== next.popupId);
  popupView.current = next;
  popupView.index = popupView.total - queue.length;
  showing = true;
  write(next.popupId, { date: today() });
  void reportPopupEvent(next.popupId, getVisitorKey(), 'show');
}

/** 队列里还有就继续，没有就收起容器 */
function next(): void {
  const head = queue[0];
  if (!head) {
    showing = false;
    popupView.current = null;
    popupView.total = 0;
    return;
  }
  show(head);
}

/**
 * 用户点了主按钮：上报 + 跳转 + **终止队列**。
 *
 * 关掉才继续弹下一个，点过就不再弹 —— 参考稿与文档都是这条规则，
 * 反过来的话顾客每次进店都要把同一批活动点一遍才能走。
 */
export function onPopupClick(): void {
  const current = popupView.current;
  if (!current) return;
  void reportPopupEvent(current.popupId, getVisitorKey(), 'click');
  write(current.popupId, { clicked: true });
  queue = [];
  showing = false;
  popupView.current = null;
  popupView.total = 0;
  openLink(current.content.link);
}

export function onPopupClose(): void {
  const current = popupView.current;
  if (!current) return;
  void reportPopupEvent(current.popupId, getVisitorKey(), 'close');
  showing = false;
  popupView.current = null;
  // 关一个再弹下一个中间留 300ms，连着糊上来体验很差
  setTimeout(next, 300);
}

/**
 * 场景触发入口（首页 onShow / 支付成功页调用）。
 *
 * `delay` 是给冷启动留的：首屏还没画完就糊脸，观感比少弹一次更糟。
 * 正在弹的时候重复触发直接忽略 —— 回首页不该把当前弹窗顶掉。
 */
export async function triggerPopup(scene: PopupScene, options: { storeId?: number; delay?: number } = {}): Promise<void> {
  if (showing || fetching) return;
  if (options.delay) {
    await new Promise((resolve) => setTimeout(resolve, options.delay));
    if (showing) return;
  }

  fetching = true;
  try {
    const res = await fetchPopupQueue(scene, options.storeId);
    const records = readRecords();
    const allowed = (res.popups ?? []).filter((item) => canShow(item, records));
    const limit = Math.max(1, res.maxShow || 1);
    queue = allowed.slice(0, limit);
    popupView.total = queue.length;
    next();
  } catch {
    // 静默：活动弹窗拿不到不该惊动顾客
  } finally {
    fetching = false;
  }
}
