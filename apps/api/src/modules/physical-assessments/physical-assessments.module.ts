import { Module } from '@nestjs/common';
import { PhysicalAssessmentsController } from './physical-assessments.controller';
import { PhysicalAssessmentsService } from './physical-assessments.service';

@Module({
  controllers: [PhysicalAssessmentsController],
  providers: [PhysicalAssessmentsService],
  exports: [PhysicalAssessmentsService],
})
export class PhysicalAssessmentsModule {}
