/**
 * 线稿图标库（ui.md：统一 1.5px 细线、线性、无填充）。
 *
 * 为什么不用 iconfont 也不下发图片：小程序不能下载代码与资源，图标必须打进包里；
 * 而 `<image>` 里的 SVG 又吃不到 CSS 变量。所以这里存 SVG **片段**，
 * 运行时把颜色与线宽拼进去再转 data URI —— 平台改主色，图标跟着变，
 * 且新增图标必须随小程序发版（与后端 `APP_ICON_KEYS` 同一份清单）。
 */

/** 24×24 网格，线宽 1.5，端点与转角取圆角，与参考稿一致 */
export const ICON_PATHS: Record<string, string> = {
  /* ---------- 场景入口 ---------- */
  takeout: '<path d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  delivery:
    '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M9 17.5h6l-2-8h6"/><path d="M4 9.5h4"/>',
  dinein:
    '<path d="M4 13.5h16a8 8 0 0 1-16 0Z"/><path d="M3 19.5h18"/><path d="M8 9.5V4M11 9.5V4"/><path d="M8 6.8h3"/>',
  queue:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M7.5 10h9M7.5 14h5"/>',
  store:
    '<path d="M4 9.5 6 4.5h12l2 5"/><path d="M4.5 9.5h15V19a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5Z"/><path d="M9.5 19.5v-5h5v5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  notice:
    '<path d="M4 10.5v3a1 1 0 0 0 1 1h2.5L13 19V5L7.5 9.5H5a1 1 0 0 0-1 1Z"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6"/>',
  hot: '<path d="M12 20.5c3.6 0 6-2.4 6-5.6 0-4.4-4.2-5.7-4-11.4-2.6 1.4-3.6 4-3.2 6.2-1-.4-1.6-1.4-1.6-2.7C7 9.6 6 12 6 14.9c0 3.2 2.4 5.6 6 5.6Z"/>',
  coupon:
    '<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h14a1.5 1.5 0 0 1 1.5 1.5v1.4a2.1 2.1 0 0 0 0 4.2v1.4A1.5 1.5 0 0 1 19 17H5a1.5 1.5 0 0 1-1.5-1.5v-1.4a2.1 2.1 0 0 0 0-4.2Z"/><path d="M10 10.5h4M12 10v4"/>',
  balance:
    '<circle cx="12" cy="12" r="8.5"/><path d="M9 8.5 12 12l3-3.5M12 12v5M9.8 13.6h4.4"/>',
  points: '<path d="m12 4 2.3 5 5.2.6-3.9 3.6 1.1 5.3-4.7-2.8-4.7 2.8 1.1-5.3L3.5 9.6l5.2-.6Z"/>',
  memberCard:
    '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 9.5h18"/><path d="M6.5 14h5"/>',
  invoice:
    '<path d="M6 3.5h9L19 8v12l-2-1.2L15 20l-3-1.2L9 20l-3-1.2V3.5Z"/><path d="M9.5 9h5M9.5 12.5h5"/>',
  service:
    '<path d="M4.5 12.5a7.5 7.5 0 0 1 15 0"/><path d="M3.5 14.5A1.8 1.8 0 0 1 5 13h.5v5H5a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M20.5 14.5A1.8 1.8 0 0 0 19 13h-.5v5H19a1.5 1.5 0 0 0 1.5-1.5Z"/><path d="M18.5 18.5c0 1.4-2 2.2-4.5 2.2"/>',
  setting:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.8M12 17.7v2.8M3.5 12h2.8M17.7 12h2.8M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>',
  gift:
    '<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9C9.5 9 8 7.8 8 6.4S9.2 4.5 10.3 5.1 12 9 12 9Zm0 0c2.5 0 4-1.2 4-2.6S14.8 4.5 13.7 5.1 12 9 12 9Z"/>',
  birthday:
    '<path d="M4.5 20.5h15v-5a3 3 0 0 0-3-3h-9a3 3 0 0 0-3 3Z"/><path d="M8 12.5V10M12 12.5V10M16 12.5V10"/><path d="M8 8.5V7M12 8.5V7M16 8.5V7"/>',
  address:
    '<path d="M12 21s7-6.3 7-11.4A7 7 0 0 0 5 9.6C5 14.7 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  unpaid:
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pending:
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5V12l4.5 2.6"/>',
  review:
    '<path d="M20.5 12.5a7.5 7.5 0 0 1-7.5 7.5H6l-2 2.5V12.5A7.5 7.5 0 0 1 11.5 5h1.5a7.5 7.5 0 0 1 7.5 7.5Z"/><path d="m12 8.4 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3Z"/>',
  refund:
    '<path d="M4.5 10.5a7.5 7.5 0 1 1 1.2 6.4"/><path d="M4 5.5v5h5"/>',
  freeShipping:
    '<path d="M3 7.5h10.5V17H3Z"/><path d="M13.5 10.5H18l3 3V17h-7.5Z"/><circle cx="7" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/>',
  doublePoints:
    '<path d="m8 4 1.6 3.4 3.4.4-2.6 2.4.8 3.4L8 12 4.8 13.6l.8-3.4L3 7.8l3.4-.4Z"/><path d="m16 11 1.2 2.6 2.6.3-2 1.9.6 2.6-2.4-1.4-2.4 1.4.6-2.6-2-1.9 2.6-.3Z"/>',
  phone:
    '<path d="M8.5 4.5 10 8 8.2 9.8a10 10 0 0 0 6 6L16 14l3.5 1.5.5 3.2a1.5 1.5 0 0 1-1.7 1.6C10.4 20.4 3.6 13.6 3.2 5.7A1.5 1.5 0 0 1 4.8 4Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12h3.5"/>',

  /* ---------- 界面自用（不可由装修配置） ---------- */
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  minus: '<path d="M5.5 12h13"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 13 4.5 4.5L19 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  cart:
    '<path d="M3.5 5.5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.4a1.5 1.5 0 0 0 1.5-1.2L20 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>',
  scan:
    '<path d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4H8.5M15.5 4H18.5A1.5 1.5 0 0 1 20 5.5V8.5M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5H15.5M8.5 20H5.5A1.5 1.5 0 0 1 4 18.5v-3"/><path d="M4 12h16"/>',
  star: '<path d="m12 4 2.3 5 5.2.6-3.9 3.6 1.1 5.3-4.7-2.8-4.7 2.8 1.1-5.3L3.5 9.6l5.2-.6Z"/>',
  trash:
    '<path d="M5 7.5h14M9.5 7.5V5.5h5v2M6.5 7.5l.8 11.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3l.8-11.2"/>',
  edit: '<path d="M5 19.5h4L20 8.5a2 2 0 0 0-2.8-2.8L6 16.8Z"/><path d="m15.5 8 2.5 2.5"/>',
  home: '<path d="M4 11 12 4.5 20 11v8a.5.5 0 0 1-.5.5H4.5A.5.5 0 0 1 4 19Z"/><path d="M9.5 19.5V13h5v6.5"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  order:
    '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
};

/** 找不到就退化成空心圆：装修端配错名字时不能画出空白或裂图 */
const FALLBACK_PATH = '<circle cx="12" cy="12" r="8"/>';

/**
 * 生成 data URI。
 *
 * 颜色必须是**实际色值**（如 `#c8752b`），不能传 `var(--brand)`：
 * SVG 在 `<image>` 里是独立文档，读不到页面 CSS 变量。
 */
export function iconSrc(name: string, color = '#3a322c', strokeWidth = 1.5): string {
  const body = ICON_PATHS[name] ?? FALLBACK_PATH;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
