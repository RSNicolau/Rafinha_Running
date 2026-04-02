import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TrainingPlansModule } from './modules/training-plans/training-plans.module';
import { WorkoutsModule } from './modules/workouts/workouts.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { EventsModule } from './modules/events/events.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { LiveTrackingModule } from './modules/live-tracking/live-tracking.module';
import { AiTrainingModule } from './modules/ai-training/ai-training.module';
import { BrandingModule } from './modules/branding/branding.module';
import { InvitesModule } from './modules/invites/invites.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    TrainingPlansModule,
    WorkoutsModule,
    IntegrationsModule,
    PaymentsModule,
    ChatModule,
    NotificationsModule,
    AdminModule,
    EventsModule,
    RankingsModule,
    LiveTrackingModule,
    AiTrainingModule,
    BrandingModule,
    InvitesModule,
  ],
})
export class AppModule {}
