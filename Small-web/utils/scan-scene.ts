/**
 * 扫码内容的纯解析（不依赖 pinia 与 uni，便于单独验证）。
 *
 * 微信在四个地方放桌码信息，形状各不相同，少认一种就会出现「码没问题、
 * 小程序说读不出门店」：
 * 1. `App.onLaunch/onShow` 的 `options.query.scene`：`s%3D1%26t%3DB12`（整体被 URL 编码）；
 * 2. 落地页 `onLoad(query)` 的 `query.scene`：同上；
 * 3. `wx.scanCode` 的 `res.path`：**`pages/menu/menu?scene=s=1&t=B12`** ——
 *    scene 是 path 查询串里的一个键，而且解码后会出现两个 `=`，真机与模拟器都回这个形状；
 * 4. 普通二维码 / 早期纯数字门店码：`storeId=1&tableNo=A12`、`https://host/...?storeId=1`、`1`。
 *
 * 键名一律容忍 `s/t` 与 `storeId/tableNo` 两组写法。
 */
export interface ScanTarget {
  storeId: number;
  tableNo: string;
}

/** 递归深度上限：只为了防住自引用内容，正常最深两层 */
const MAX_DEPTH = 3;

function tryDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // 已经是明文，或含裸 % —— 两种情况都按原样继续
    return value;
  }
}

function parsePairs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split('&')) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const key = pair.slice(0, index).trim().toLowerCase();
    out[key] = tryDecode(pair.slice(index + 1).trim());
  }
  return out;
}

function readStoreId(pairs: Record<string, string>): number {
  const raw = (pairs.s ?? pairs.storeid ?? pairs.store_id ?? '').trim();
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function readTableNo(pairs: Record<string, string>): string {
  return String(pairs.t ?? pairs.table ?? pairs.tableno ?? pairs.table_no ?? '').trim();
}

function parseOnce(value: string, depth: number): ScanTarget | null {
  // 带路径的内容（小程序码的 path、普通二维码的 URL）只看最后一个问号后面那段
  const queryIndex = value.lastIndexOf('?');
  const body = (queryIndex >= 0 ? value.slice(queryIndex + 1) : value).trim();
  if (!body) return null;

  const pairs = parsePairs(body);
  const storeId = readStoreId(pairs);
  const tableNo = readTableNo(pairs);
  if (storeId) return { storeId, tableNo };

  // scene 藏在别人的值里（`...?scene=s=1&t=B12`）：钻进去再解一层。
  // 外层被 & 切开时桌号会落在外层键上，所以两边的值合并取用。
  if (depth < MAX_DEPTH) {
    for (const nested of [pairs.scene, pairs.q]) {
      if (!nested) continue;
      const inner = parseScan(nested, depth + 1);
      if (inner) return { storeId: inner.storeId, tableNo: inner.tableNo || tableNo };
    }
  }

  // 早期贴在桌上的纯数字码：整串就是门店 ID
  if (/^\d{1,9}$/.test(body)) return { storeId: Number(body), tableNo: '' };
  return null;
}

/** 解析一段扫码内容；读不出门店就返回 null */
export function parseScan(raw: string | null | undefined, depth = 0): ScanTarget | null {
  const value = String(raw ?? '').trim();
  if (!value || depth > MAX_DEPTH) return null;
  const direct = parseOnce(value, depth);
  if (direct) return direct;
  // 整体被编码过（`s%3D1%26t%3DB12` 这种没有裸 & 的串）：解一次码再试
  const decoded = tryDecode(value);
  return decoded === value ? null : parseOnce(decoded, depth);
}
