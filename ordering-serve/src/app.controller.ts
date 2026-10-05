import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

/** 服务健康检查，供联调与部署探活使用 */
@ApiTags('系统')
@Controller()
export class AppController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
