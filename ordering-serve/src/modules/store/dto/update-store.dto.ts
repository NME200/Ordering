import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateStoreDto } from './create-store.dto';

/**
 * 编辑门店入参 —— 只有资料字段。
 *
 * 刻意剔除 merchantId（门店不允许跨租户迁移）与 status：
 * 启停是治理动作，走 `PATCH /stores/:id/status` 并单独校验 `store:disable`，
 * 混在资料编辑里会让商户「改个地址顺手把平台停用的店打开」。
 */
export class UpdateStoreDto extends PartialType(OmitType(CreateStoreDto, ['merchantId'])) {}
