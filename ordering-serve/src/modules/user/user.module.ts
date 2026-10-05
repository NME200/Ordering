import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreModule } from '../store/store.module';
import { User } from './entities/user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * 员工账号模块。
 * 依赖 StoreModule 校验门店归属；导出 UserService 供 AuthModule 使用。
 */
@Module({
  imports: [TypeOrmModule.forFeature([User]), StoreModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
