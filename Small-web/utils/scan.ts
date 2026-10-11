import { useAppStore } from '@/store/app';
import { parseScan, type ScanTarget } from './scan-scene';

/**
 * 扫码进桌号的落地层：把解析结果写进 app store。
 * 纯解析在 scan-scene.ts（那个文件不碰 pinia 与 uni，可以单独验证）。
 */
export type { ScanTarget };
export { parseScan };

/**
 * 从页面 query / App 生命周期 options 里取扫码信息并写进 store。
 * 命中就返回解析结果（界面据此提示「已入座 B12 桌」），没命中返回 null。
 */
export function applyScanQuery(query: Record<string, unknown> | null | undefined): ScanTarget | null {
  const q = (query ?? {}) as Record<string, unknown>;
  const hit =
    parseScan(q.scene ? String(q.scene) : '') ??
    parseScan(q.q ? String(q.q) : '') ??
    parseScan(
      [
        q.storeId !== undefined ? `storeId=${String(q.storeId)}` : '',
        q.tableNo !== undefined ? `tableNo=${String(q.tableNo)}` : '',
      ].join('&'),
    );
  if (!hit) return null;
  useAppStore().applyScan(hit);
  return hit;
}

/**
 * 应用一次 `uni.scanCode` 的结果（顾客已经在小程序里，想换桌或补扫）。
 *
 * 三个字段按码的类型分：小程序码给 `scene`、已登记路径的码给 `path`
 * （实测形如 `pages/menu/menu?scene=s=1&t=B12`）、普通二维码只给 `result`。
 * 三个都试，否则同一张码在「微信扫」「小程序内扫」下表现不一致。
 */
export function applyScanResult(
  result: { scene?: string; path?: string; result?: string } | null | undefined,
): ScanTarget | null {
  const hit =
    parseScan(result?.scene ?? '') ??
    parseScan(result?.path ?? '') ??
    parseScan(result?.result ?? '');
  if (!hit) return null;
  useAppStore().applyScan(hit);
  return hit;
}
