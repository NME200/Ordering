/**
 * uni-app 在编译期把 `process.env.NODE_ENV` 替换成字面量（dev/build），
 * 但 @dcloudio/types 不带这个声明，所以在这里补一条最小面。
 */
declare const process: {
  env: { NODE_ENV: 'development' | 'production' | string };
};
