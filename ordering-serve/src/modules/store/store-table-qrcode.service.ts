import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { MiniappConfigService } from '../miniapp/miniapp-config.service';
import { WechatApiError, WechatMiniappClient } from '../miniapp/wechat-miniapp.client';
import { QRCODE_LANDING_PAGE, renderScene, validateScene } from '../miniapp/constants/miniapp.constants';
import {
  GenerateTableQrcodeAllDto,
  TableQrcodeImageDto,
  TableQrcodeRowDto,
} from './dto/store-table-qrcode.dto';
import { StoreTableQrcode } from './entities/store-table-qrcode.entity';
import { StoreTableService } from './store-table.service';

/**
 * 门店桌码生成（商家自己后台的动作）。
 *
 * 一张码 = 一张桌：scene 里带门店与桌号，顾客扫开直接落在这家店的点餐页、桌号已填好。
 * 平台只出凭据，不参与出码 —— 哪家店有几张桌是商家的事。
 *
 * 三道前置：
 * 1. 门店范围（绑店账号只能碰自己的店，商户管理员只能碰本商户的店）；
 * 2. 桌号必须是本店**启用中**的台位，给不存在的桌出码等于印一张扫开没用的贴纸；
 * 3. scene 要过微信的长度与字符集限制，桌号里带中文空格要当场说清楚，
 *    而不是等微信回一句 `invalid scene` 让商家猜。
 */
@Injectable()
export class StoreTableQrcodeService {
  private readonly logger = new Logger(StoreTableQrcodeService.name);

  constructor(
    @InjectRepository(StoreTableQrcode)
    private readonly qrcodeRepository: Repository<StoreTableQrcode>,
    private readonly storeTableService: StoreTableService,
    private readonly miniappConfig: MiniappConfigService,
    private readonly wechat: WechatMiniappClient,
  ) {}

  /** 本店已生成的桌码（不含图片） */
  async list(storeId: number, currentUser: AuthUser): Promise<TableQrcodeRowDto[]> {
    await this.storeTableService.assertStoreInScope(storeId, currentUser);
    const rows = await this.qrcodeRepository.find({ where: { storeId }, order: { tableNo: 'ASC' } });
    return rows.map((row) => TableQrcodeRowDto.from(row));
  }

  /** 生成单张（已存在则覆盖重生成） */
  async generate(
    storeId: number,
    tableNo: string,
    currentUser: AuthUser,
  ): Promise<TableQrcodeImageDto> {
    await this.storeTableService.assertStoreInScope(storeId, currentUser);

    const no = tableNo.trim();
    if (!(await this.storeTableService.isUsable(storeId, no))) {
      throw BusinessException.badRequest(
        ErrorCode.STORE_TABLE_UNUSABLE,
        `桌号「${no}」不是本店启用中的台位，请先在桌码管理里把这张桌录进来`,
      );
    }
    const scene = renderScene({ storeId, tableNo: no });
    const sceneErrors = validateScene(scene);
    if (sceneErrors.length) {
      throw BusinessException.badRequest(ErrorCode.PARAM_INVALID, sceneErrors.join('；'));
    }

    const { appId, appSecret, envVersion } = await this.miniappConfig.readCredentials();
    const accessToken = await this.translateWechatFailure(() =>
      this.wechat.accessToken(appId, appSecret),
    );
    const png = await this.translateWechatFailure(() =>
      this.wechat.createQrcode(accessToken, { page: QRCODE_LANDING_PAGE, scene, envVersion }),
    );

    const existed = await this.qrcodeRepository.findOne({ where: { storeId, tableNo: no } });
    const row = existed ?? this.qrcodeRepository.create({ storeId, tableNo: no });
    row.scene = scene;
    row.page = QRCODE_LANDING_PAGE;
    row.envVersion = envVersion;
    row.imageBase64 = png.toString('base64');
    row.generatedByName = currentUser.nickname;

    const saved = await this.qrcodeRepository.save(row);
    this.logger.log(
      `桌码已生成：门店 ${storeId} 桌 ${no}（操作人 ${currentUser.username}）`,
    );
    return TableQrcodeImageDto.withImage(saved);
  }

  /**
   * 批量生成：把本店所有启用中的台位都出码。
   *
   * 单张失败不中断整批 —— 12 张桌里有 1 张桌号带中文，不该让另外 11 张也拿不到码，
   * 失败项逐条回给界面列出来。
   */
  async generateAll(
    storeId: number,
    currentUser: AuthUser,
  ): Promise<GenerateTableQrcodeAllDto> {
    const tables = await this.storeTableService.list(storeId, currentUser);
    const result: GenerateTableQrcodeAllDto = { total: tables.length, generated: 0, failed: [] };

    for (const table of tables) {
      try {
        await this.generate(storeId, table.tableNo, currentUser);
        result.generated += 1;
      } catch (error) {
        result.failed.push({
          tableNo: table.tableNo,
          reason:
            error instanceof WechatApiError || error instanceof BusinessException
              ? error.message
              : '生成失败',
        });
      }
    }
    return result;
  }

  /**
   * 把微信侧的错误转成业务错误。
   *
   * `WechatApiError` 不是 BusinessException，直接抛会被全局过滤器包成 500「服务器内部错误」，
   * 商家看到的就是一句没用的话 —— 而真正的原因（invalid appid、出口 IP 不在白名单、
   * scene 不合法）就写在微信的 errmsg 里，必须原样带到界面上。
   */
  private async translateWechatFailure<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof WechatApiError) {
        throw BusinessException.badRequest(ErrorCode.MINIAPP_WECHAT_API_FAILED, error.message);
      }
      throw error;
    }
  }
}
