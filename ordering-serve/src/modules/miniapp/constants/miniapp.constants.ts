/**
 * 桌码的固定口径。
 *
 * scene 与落地页**不作为可配置项暴露给任何人**：桌码的作用只有一个 ——
 * 扫开就落到这家店的点餐页并把桌号带上。把它做成配置项，等于给运营一个
 * 能把所有台面牌配废的开关，而配错的代价是顾客扫开打不开，只能重印贴纸。
 *
 * 长度与字符集是微信 `getwxacodeunlimit` 的硬限制（scene 最长 32 字符，
 * 只接受字母数字与少量符号），所以出码前仍然要判一次：
 * 桌号是商家自己填的自由文本，填了中文或空格，微信只会回一句 invalid scene。
 */

export const MINIAPP_CONFIG_KEY = 'default';

/** scene 模板：门店 ID + 桌号。小程序侧认 s/t 与 storeId/tableNo 两组键 */
export const SCENE_TEMPLATE = 's={storeId}&t={tableNo}';

/** 扫码落地页：点餐页。改这里要同步小程序 pages.json */
export const QRCODE_LANDING_PAGE = 'pages/menu/menu';

/**
 * 小程序码指向的版本。
 *
 * 这是唯一还需要人决定的技术开关，而且只在**没发布**的时候用得上：
 * release 的码要小程序已发布才扫得开；开发中想真机验证桌号，必须出 trial（体验版，
 * 扫码的人要在体验成员里）或 develop（开发版）的码。
 * 注意微信开发者工具的模拟器扫小程序码拿不到 scene，只能用真机微信扫。
 */
export const MINIAPP_ENV_VERSIONS = ['release', 'trial', 'develop'] as const;
export type MiniappEnvVersion = (typeof MINIAPP_ENV_VERSIONS)[number];
export const DEFAULT_ENV_VERSION: MiniappEnvVersion = 'release';

/** 微信对 scene 的长度限制 */
export const SCENE_MAX_LENGTH = 32;
/** 微信 scene 允许的字符集（字母数字 + 这一小撮符号） */
export const SCENE_ALLOWED = /^[A-Za-z0-9!#$&'()*+\-,:;=?@~_.]+$/;

/** 按固定模板渲染 scene */
export function renderScene(input: { storeId: number; tableNo: string }): string {
  return SCENE_TEMPLATE.replace(/\{storeId\}/g, String(input.storeId)).replace(
    /\{tableNo\}/g,
    input.tableNo.trim(),
  );
}

/**
 * 校验渲染结果能不能真的出码。
 * 返回错误说明；空数组表示可以。
 */
export function validateScene(scene: string): string[] {
  const errors: string[] = [];
  if (scene.length > SCENE_MAX_LENGTH) {
    errors.push(`scene「${scene}」长 ${scene.length} 字符，超过微信的 ${SCENE_MAX_LENGTH} 字符上限`);
  }
  if (!SCENE_ALLOWED.test(scene)) {
    errors.push('桌号只能包含字母、数字与 - _ 等有限字符，中文与空格做不出能扫的码');
  }
  return errors;
}
