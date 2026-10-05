/**
 * 运行期配置。
 *
 * 小程序没有 .env，编译期区分不了 dev/build 的域名切换，所以集中在这一个文件里：
 * 本地跑 HBuilderX 时走 DEV，发行前把 PROD 换成已备案的 https 域名（微信强制 https + 白名单）。
 */

/** 后端 API 前缀，见 ordering-serve/src/main.ts 的 API_PREFIX */
const API_PATH = '/api/v1';

const DEV_ORIGIN = 'http://127.0.0.1:3100';

/** 发行前必须替换：微信公众平台「开发设置 → 服务器域名」里也要加同一条 */
const PROD_ORIGIN = 'https://api.example.com';

/** 开发版 / 体验版小程序连本地后端时，需要在开发者工具里关掉「校验合法域名」 */
export const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * 运行期覆盖：本地缓存里写 `API_BASE=http://内网IP:3100/api/v1` 就优先用它。
 *
 * 小程序没有 .env，编译期定死的地址在「体验版要连测试机」时只能重新发版；
 * 留这一个口子就够排查了。微信侧仍要求该域名进服务器域名白名单（开发版可关校验）。
 */
const OVERRIDE = String(uni.getStorageSync('API_BASE') || '');

export const BASE_URL = OVERRIDE || `${IS_DEV ? DEV_ORIGIN : PROD_ORIGIN}${API_PATH}`;
