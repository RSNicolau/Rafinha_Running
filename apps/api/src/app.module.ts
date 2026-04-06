import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './modules/cache/cache.module';
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
import { NutritionModule } from './modules/nutrition/nutrition.module';
import { HealthModule } from './modules/health/health.module';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    PrismaModule,
    CacheModule,
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
    NutritionModule,
    HealthModule,
    EmailModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule {}
