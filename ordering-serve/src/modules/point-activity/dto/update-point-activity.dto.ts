import { PartialType } from '@nestjs/swagger';
import { CreatePointActivityDto } from './create-point-activity.dto';

/**
 * 编辑积分活动入参：全部字段可选。
 *
 * 启停**不在这里**（走 `PATCH /point-activities/:id/status`），与门店停用同一套口径：
 * 否则「改个活动文案顺手把已经关掉的活动打开」会变成一个谁都没留意的动作。
 */
export class UpdatePointActivityDto extends PartialType(CreatePointActivityDto) {}
