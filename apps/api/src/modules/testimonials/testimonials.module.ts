import { Module } from '@nestjs/common';
import { TestimonialsService } from './testimonials.service';
import { TestimonialsController } from './testimonials.controller';

@Module({
  controllers: [TestimonialsController],
  providers: [TestimonialsService],
  exports: [TestimonialsService],
})
export class TestimonialsModule {}
