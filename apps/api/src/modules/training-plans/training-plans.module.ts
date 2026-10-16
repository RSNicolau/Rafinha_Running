import { Module } from '@nestjs/common';
import { TrainingPlansService } from './training-plans.service';
import { TrainingPlansController } from './training-plans.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { GarminSyncModule } from '../integrations/garmin/garmin-sync.module';

@Module({
  imports: [NotificationsModule, GarminSyncModule],
  controllers: [TrainingPlansController],
  providers: [TrainingPlansService],
  exports: [TrainingPlansService],
})
export class TrainingPlansModule {}
