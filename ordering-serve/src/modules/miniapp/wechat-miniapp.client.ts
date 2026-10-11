import { Injectable, Logger } from '@nestjs/common';

/**
 * 微信小程序服务端接口客户端（出码、登录换 openid、手机号快速验证）。
 *
 * 用 Node 原生 fetch：本项目没有 HTTP 客户端依赖，为一个接口引 axios 不值得。
 *
 * 三个必须知道的坑：
 * 1. `getwxacodeunlimit` 成功时回的是**图片字节**，失败时才回 JSON，
 *    所以要先看 content-type 再决定解析方式；
 * 2. `check_path` 关掉是为了让「还没发版」时也能出码贴台面牌，
 *    代价是页面真不存在时，顾客扫码会打不开 —— 界面上要把这句话写给运营看。
 * 3. `sns/jscode2session` 是唯一**不需要 access_token** 的那个（也不吃 IP 白名单），
 *    所以它失败的原因基本只有 AppID/AppSecret 不配对或 code 已被用过。
 */

/** 微信接口的错误结构 */
interface WxErrorBody {
  errcode?: number;
  errmsg?: string;
}

/** getuserphonenumber 的 phone_info。phoneNumber 带 +86 前缀，落库用 purePhoneNumber */
interface WxPhoneInfo {
  phoneNumber?: string;
  purePhoneNumber?: string;
  countryCode?: string | number;
}

/** 微信侧返回的业务错误，带上原文，别让运营对着「生成失败」猜 */
export class WechatApiError extends Error {
  constructor(
    readonly errcode: number,
    message: string,
  ) {
    super(`微信接口 ${errcode}：${message}`);
    this.name = 'WechatApiError';
  }
}

const API_HOST = 'https://api.weixin.qq.com';
/** 单次请求超时：微信接口偶发挂住，不能让后台的生成请求一直转圈 */
const TIMEOUT_MS = 8000;

@Injectable()
export class WechatMiniappClient {
  private readonly logger = new Logger(WechatMiniappClient.name);
  /** access_token 内存缓存：微信侧每天可换票次数有限，别每张桌换一次 */
  private cached: { appId: string; token: string; expireAt: number } | null = null;

  /** 换 access_token；同一 AppID 在有效期内复用 */
  async accessToken(appId: string, appSecret: string): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.appId === appId && this.cached.expireAt > now + 60_000) {
      return this.cached.token;
    }

    const url =
      `${API_HOST}/cgi-bin/token?grant_type=client_credential` +
      `&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
    const body = await this.requestJson<{ access_token?: string; expires_in?: number } & WxErrorBody>(url);

    if (!body.access_token) {
      throw new WechatApiError(
        Number(body.errcode ?? -1),
        body.errmsg ?? '未返回 access_token，请检查 AppID / AppSecret 与服务器出口 IP 白名单',
      );
    }

    this.cached = {
      appId,
      token: body.access_token,
      expireAt: now + Number(body.expires_in ?? 7200) * 1000,
    };
    return this.cached.token;
  }

  /** 生成小程序码，成功回 PNG 字节 */
  async createQrcode(
    accessToken: string,
    input: { page: string; scene: string; envVersion?: string; width?: number },
  ): Promise<Buffer> {
    const url = `${API_HOST}/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: input.page,
        scene: input.scene,
        // 关掉页面存在性校验：小程序还没发版时也能出码试扫。实测不传这一项，
        // 未发布的小程序无论写哪个页面都回 41030 invalid page
        check_path: false,
        // 不传就是 release。只有联调期才需要 trial / develop，那种场景不配给运营
        ...(input.envVersion ? { env_version: input.envVersion } : {}),
        width: input.width ?? 280,
        auto_color: false,
        // 微信要的是 {r,g,b} 三个 0-255 整数，不是 '#000000' 那种字符串 ——
        // 传字符串整个请求体会被判 47001 data format error（实测踩过）
        line_color: { r: 0, g: 0, b: 0 },
      }),
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const error = (await response.json()) as WxErrorBody;
      throw new WechatApiError(Number(error.errcode ?? -1), error.errmsg ?? '未知错误');
    }
    if (!response.ok) {
      throw new WechatApiError(-1, `HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * `wx.login` 拿到的 code 换 openid。
   *
   * code **五分钟有效且只能用一次**，所以这个方法的调用方不允许重试同一个 code：
   * 失败就让它失败，顾客再点一次会拿到新 code。
   * session_key 只字不提、不外传 —— 它能把顾客的手机号 / 地址密文解开。
   */
  async code2Session(
    appId: string,
    appSecret: string,
    code: string,
  ): Promise<{ openid: string; unionid: string | null }> {
    const url =
      `${API_HOST}/sns/jscode2session?appid=${encodeURIComponent(appId)}` +
      `&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(code)}` +
      '&grant_type=authorization_code';
    const body = await this.requestJson<
      { openid?: string; unionid?: string } & WxErrorBody
    >(url);

    if (!body.openid) {
      throw new WechatApiError(Number(body.errcode ?? -1), body.errmsg ?? '未返回 openid');
    }
    return { openid: body.openid, unionid: body.unionid ?? null };
  }

  /**
   * 「手机号快速验证组件」的 code 换手机号。
   *
   * 这是**扣费接口**（0.03 元/次，新号有 1000 次体验额度），所以：
   * - 一次点击只换一次，换失败不许拿同一个 code 重试；
   * - 微信侧的原文错误必须回传给界面，「额度用完」和「用户取消」得区分开。
   */
  async phoneNumber(
    accessToken: string,
    code: string,
  ): Promise<{ phoneNumber: string; purePhoneNumber: string; countryCode: string }> {
    const url = `${API_HOST}/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`;
    const body = await this.requestJson<{ phone_info?: WxPhoneInfo } & WxErrorBody>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const info = body.phone_info;
    if (!info?.purePhoneNumber) {
      throw new WechatApiError(Number(body.errcode ?? -1), body.errmsg ?? '未返回手机号');
    }
    return {
      phoneNumber: info.phoneNumber ?? info.purePhoneNumber,
      purePhoneNumber: info.purePhoneNumber,
      countryCode: String(info.countryCode ?? ''),
    };
  }

  /** 让缓存失效（改完凭据后调用，避免继续用旧 AppID 的票） */
  resetToken(): void {
    this.cached = null;
  }

  private async requestJson<T extends WxErrorBody>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetch(url, init);
    const body = (await response.json()) as T;
    if (body.errcode) {
      throw new WechatApiError(Number(body.errcode), body.errmsg ?? '未知错误');
    }
    return body;
  }

  /** 统一出口：把网络层失败也翻译成运营看得懂的话 */
  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await globalThis.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`调用微信接口失败：${url.split('?')[0]} ${reason}`);
      throw new WechatApiError(-1, `请求微信接口失败（${reason}）。请确认服务器能访问 api.weixin.qq.com`);
    }
  }
}
