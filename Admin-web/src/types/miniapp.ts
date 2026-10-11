/**
 * 小程序凭据（系统设置）相关类型。
 *
 * 与后端 `modules/miniapp/dto/miniapp-config.dto.ts` 逐字段对齐。
 * AppSecret 只在写入时出现，任何出参都只有 `appSecretConfigured` 这个布尔值 ——
 * 密钥不回显是硬规则。
 *
 * 桌码的类型不在这里：出码是商家自己门店的动作，类型在 Web-shared 共享层。
 */

export type MiniappEnvVersion = 'release' | 'trial' | 'develop';

export interface MiniappConfig {
  appId: string | null;
  appSecretConfigured: boolean;
  /** AppID 与 AppSecret 都有值，商家那边才出得了码 */
  credentialsReady: boolean;
  /** .env 里的 CONFIG_SECRET_KEY 是否可用；没有它连密钥都存不了 */
  masterKeyReady: boolean;
  /** 出码写给哪个版本。未发布时必须是 trial / develop，否则扫不开 */
  envVersion: MiniappEnvVersion;
  remark: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

/** 保存入参：appSecret 留空表示保持原值 */
export interface SaveMiniappConfigPayload {
  appId?: string;
  appSecret?: string;
  envVersion?: MiniappEnvVersion;
  remark?: string;
}

export interface MiniappTestResult {
  ok: boolean;
  message: string;
}
