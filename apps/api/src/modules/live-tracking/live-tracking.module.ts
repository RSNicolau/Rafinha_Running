import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LiveTrackingGateway } from './live-tracking.gateway';
import { LiveTrackingService } from './live-tracking.service';
import { LiveTrackingController } from './live-tracking.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ secret: process.env.JWT_SECRET! }),
  ],
  providers: [LiveTrackingGateway, LiveTrackingService],
  controllers: [LiveTrackingController],
  exports: [LiveTrackingService],
})
export class LiveTrackingModule {}
