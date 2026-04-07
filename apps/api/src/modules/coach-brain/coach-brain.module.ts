import { Module } from '@nestjs/common';
import { CoachBrainController } from './coach-brain.controller';
import { CoachBrainService } from './coach-brain.service';

@Module({
  controllers: [CoachBrainController],
  providers: [CoachBrainService],
  exports: [CoachBrainService],
})
export class CoachBrainModule {}
