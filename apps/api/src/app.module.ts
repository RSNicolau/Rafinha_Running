import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
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
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PhysicalAssessmentsModule } from './modules/physical-assessments/physical-assessments.module';
import { CoachBrainModule } from './modules/coach-brain/coach-brain.module';
import { StoreModule } from './modules/store/store.module';
import { PlatformModule } from './modules/platform/platform.module';
import { BadgesModule } from './modules/badges/badges.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NicheModule } from './modules/niche/niche.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { HealthModule as HealthCheckModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { AthleteDocumentsModule } from './modules/athlete-documents/athlete-documents.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
          : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        autoLogging: true,
        redact: ['req.headers.authorization'],
      },
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },    // 20 req/s
      { name: 'medium', ttl: 60000, limit: 100 },  // 100 req/min
    ]),
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
    SchedulerModule,
    AiAssistantModule,
    OnboardingModule,
    PhysicalAssessmentsModule,
    CoachBrainModule,
    StoreModule,
    PlatformModule,
    BadgesModule,
    ReportsModule,
    NicheModule,
    AppointmentsModule,
    HealthCheckModule,
    MetricsModule,
    UploadsModule,
    AthleteDocumentsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule {}
