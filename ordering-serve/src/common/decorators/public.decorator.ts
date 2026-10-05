import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * 标记接口为公开访问，跳过 JWT 登录校验。
 * 例如：登录、健康检查、C 端菜单查询。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
