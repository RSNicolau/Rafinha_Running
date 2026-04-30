import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TwoFactorService } from './two-factor.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [UsersController],
  providers: [UsersService, TwoFactorService],
  exports: [UsersService, TwoFactorService],
})
export class UsersModule {}
