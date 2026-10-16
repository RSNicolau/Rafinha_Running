import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TwoFactorService } from './two-factor.service';
import { UploadsModule } from '../uploads/uploads.module';
import { InvitesModule } from '../invites/invites.module';

@Module({
  imports: [UploadsModule, InvitesModule],
  controllers: [UsersController],
  providers: [UsersService, TwoFactorService],
  exports: [UsersService, TwoFactorService],
})
export class UsersModule {}
