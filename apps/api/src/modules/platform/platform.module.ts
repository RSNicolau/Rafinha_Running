import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, AdminModule],
  controllers: [PlatformController],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
