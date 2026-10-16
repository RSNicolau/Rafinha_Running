import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WorkoutsService } from './workouts.service';
import { WorkoutsController } from './workouts.controller';
import { WorkoutFitController } from './workout-fit.controller';
import { TrainingLoadService } from './training-load.service';
import { CoachWorkoutsService } from './coach-workouts.service';
import { WorkoutFitService } from './fit/workout-fit.service';
import { WeeklyPlanEmailService } from './weekly-plan-email.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { GarminSyncModule } from '../integrations/garmin/garmin-sync.module';

/**
 * JwtModule sem config: os tokens de download do .FIT usam segredo derivado próprio (ver fit/fit-token.ts).
 */
@Module({
  imports: [NotificationsModule, BadgesModule, GarminSyncModule, JwtModule.register({})],
  controllers: [WorkoutsController, WorkoutFitController],
  providers: [WorkoutsService, TrainingLoadService, CoachWorkoutsService, WorkoutFitService, WeeklyPlanEmailService],
  exports: [WorkoutsService, TrainingLoadService, WeeklyPlanEmailService],
})
export class WorkoutsModule {}
