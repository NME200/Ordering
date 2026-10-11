import { validateSync, ValidationError } from 'class-validator';

/**
 * class-validator 错误收集（含嵌套数组项）。
 *
 * `@ValidateNested({ each: true })` 的错误挂在 `children` 上、本级 `constraints` 是 undefined，
 * 只读顶层就会把「宫格里第 3 个入口的图标不存在」这类问题整条吞掉，
 * 脏配置照样能落库 —— 所以统一在这里递归展开，并用「第 N 项」把位置还给运营。
 */
export function flattenValidationError(error: ValidationError, label = ''): string[] {
  const indexed = /^\d+$/.test(error.property);
  const nextLabel = indexed ? `${label} 第 ${Number(error.property) + 1} 项` : label;
  const own = error.constraints
    ? Object.values(error.constraints).map((message) => (nextLabel ? `${nextLabel}：${message}` : message))
    : [];
  const children = (error.children ?? []).flatMap((child) => flattenValidationError(child, nextLabel));
  return [...own, ...children];
}

/**
 * 按校验类跑一次同步校验，返回可读的错误文案列表。
 *
 * `whitelist` + `forbidNonWhitelisted`：未声明的字段直接判错 ——
 * 宁可让配置端报错，也不把拼错的属性名或随手塞进来的脚本静默存进库。
 */
export function collectValidationErrors(target: object, label = ''): string[] {
  return validateSync(target, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    flattenValidationError(error, label),
  );
}
