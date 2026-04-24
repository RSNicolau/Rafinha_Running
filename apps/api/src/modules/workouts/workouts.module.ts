import { Module } from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { WorkoutsController } from './workouts.controller';
import { TrainingLoadService } from './training-load.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [NotificationsModule, BadgesModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, TrainingLoadService],
  exports: [WorkoutsService, TrainingLoadService],
})
export class WorkoutsModule {}
