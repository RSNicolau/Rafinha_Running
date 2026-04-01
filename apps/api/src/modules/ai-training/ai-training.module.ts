import { Module } from '@nestjs/common';
import { AiTrainingService } from './ai-training.service';
import { AiTrainingController } from './ai-training.controller';

@Module({
  controllers: [AiTrainingController],
  providers: [AiTrainingService],
  exports: [AiTrainingService],
})
export class AiTrainingModule {}
