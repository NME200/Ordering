/**
 * 微信运行时才有的能力（wx.login / 手机号组件）。
 *
 * 为什么不用 `#ifdef MP-WEIXIN` 条件编译：那段在 vue-tsc 眼里是两份同名声明，
 * 类型检查会直接挂，而这个工程把 `npm run typecheck` 当交付门槛。
 * `uniPlatform` 是 uni 自己给的运行期口径，H5 与小程序一眼能分开。
 */

let platformCached: boolean | null = null;

/** 当前是不是跑在微信小程序里。H5 预览、开发者工具的 web 视图都是 false */
export function isWeixinMp(): boolean {
  if (platformCached !== null) return platformCached;
  try {
    const info = uni.getSystemInfoSync() as unknown as { uniPlatform?: string };
    platformCached = info.uniPlatform === 'mp-weixin';
  } catch {
    platformCached = false;
  }
  return platformCached;
}

/**
 * 取一次 `wx.login` 的 code。
 *
 * code **五分钟有效且只能用一次**，所以每次要现取，绝不缓存、绝不拿旧的重试。
 * 失败要抛出去：登录链路会吞掉它退回设备身份，但「补绑微信身份」要能让界面知道没成。
 */
export function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (res) => {
        const code = (res as unknown as { code?: string }).code ?? '';
        if (code) resolve(code);
        else reject(new Error('微信没有返回登录凭据'));
      },
      fail: (err: unknown) => {
        const msg = (err as { errMsg?: string })?.errMsg ?? '';
        reject(new Error(msg || 'wx.login 调用失败'));
      },
    });
  });
}

/** 手机号组件回调里我们真正关心的部分 */
export interface WxPhoneDetail {
  code?: string;
  errMsg?: string;
  errno?: number;
}

/**
 * 顾客点「拒绝」和「组件不可用」都拿不到 code，但含义完全不同：
 * 前者不该弹报错（那是顾客的选择），后者必须把微信的原话摊开（那是配置问题）。
 */
export function phoneDeniedMessage(detail: WxPhoneDetail): string {
  const msg = String(detail.errMsg ?? '');
  if (/deny|cancel/i.test(msg)) return '';
  if (/no permission/i.test(msg)) {
    return '这个小程序还没在微信公众平台开通「手机号快速验证」，需要企业主体并完成微信认证';
  }
  return msg ? `微信没有返回手机号：${msg}` : '微信没有返回手机号，请再点一次';
}

/** 头像落库的边长：圆形头像在页面上最大 116rpx，256px 已经够两倍屏 */
const AVATAR_EDGE = 256;

/** 读文件系统的最小形状声明 —— 这个 API 只有小程序运行时才有 */
interface FileSystem {
  readFile(options: {
    filePath: string;
    encoding: string;
    success?: (res: { data?: string | ArrayBuffer }) => void;
    fail?: (err: unknown) => void;
  }): void;
}

function fileSystem(): FileSystem | null {
  const getter = (uni as unknown as { getFileSystemManager?: () => FileSystem }).getFileSystemManager;
  return typeof getter === 'function' ? getter.call(uni) : null;
}

/** 微信给的临时路径带扩展名；认不出来时按 png 报，前端选出来的头像基本都是 png */
function imageExt(path: string): string {
  const match = /\.(png|jpe?g|webp)(\?|$)/i.exec(path);
  const ext = (match?.[1] ?? 'png').toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

/** 先压一道。压不动就用原图 —— 大不了大一点，不该因此让顾客选不上头像 */
function shrink(src: string): Promise<string> {
  return new Promise((resolve) => {
    uni.compressImage({
      src,
      width: `${AVATAR_EDGE}px`,
      quality: 60,
      success: (res) => resolve(String(res.tempFilePath || src)),
      fail: () => resolve(src),
    });
  });
}

/**
 * 把 chooseAvatar 回调里的临时文件转成可直接入库的 data URI。
 *
 * 微信给的是 `wxfile://` / `http://tmp/` 这种**一次性本机路径**：
 * 存进库里别人打不开、顾客重启就失效，所以必须当场转成 base64。
 * 不压一张相册图能到几百 KB，会把顾客列表这类带账号数据的接口拖死。
 */
export async function avatarToDataUri(tempPath: string): Promise<string> {
  const fs = fileSystem();
  if (!fs) throw new Error('当前环境读不到头像文件');
  const path = await shrink(tempPath);
  const base64 = await new Promise<string>((resolve, reject) => {
    fs.readFile({
      filePath: path,
      encoding: 'base64',
      success: (res) => {
        const data = String(res.data ?? '');
        if (data) resolve(data);
        else reject(new Error('头像读取为空'));
      },
      fail: () => reject(new Error('读不到刚选的头像，请重新选一次')),
    });
  });
  return `data:image/${imageExt(path)};base64,${base64}`;
}
