import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RankingsModule } from '../rankings/rankings.module';
import { CoachBrainModule } from '../coach-brain/coach-brain.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, RankingsModule, CoachBrainModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
