import { Module } from '@nestjs/common';
import { NicheController } from './niche.controller';
import { NicheService } from './niche.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NicheController],
  providers: [NicheService],
  exports: [NicheService],
})
export class NicheModule {}
