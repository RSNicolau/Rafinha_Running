import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RankingsModule } from '../rankings/rankings.module';
import { CoachBrainModule } from '../coach-brain/coach-brain.module';
import { PaymentsModule } from '../payments/payments.module';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, RankingsModule, CoachBrainModule, PaymentsModule, MembershipsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
