import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GarminService } from './garmin/garmin.service';
import { StravaService } from './strava/strava.service';
import { CorosService } from './coros/coros.service';
import { PolarService } from './polar/polar.service';
import { GoogleFitService } from './google-fit/google-fit.service';
import { IntegrationProvider } from '@prisma/client';

@Injectable()
export class IntegrationsService {
  constructor(
    private prisma: PrismaService,
    private garminService: GarminService,
    private stravaService: StravaService,
    private corosService: CorosService,
    private polarService: PolarService,
    private googleFitService: GoogleFitService,
  ) {}

  async getUserIntegrations(userId: string) {
    return this.prisma.fitnessIntegration.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        externalUserId: true,
        createdAt: true,
      },
    });
  }

  async getConnectUrl(userId: string, provider: IntegrationProvider) {
    switch (provider) {
      case IntegrationProvider.GARMIN:
        return this.garminService.getAuthUrl(userId);
      case IntegrationProvider.STRAVA:
        return this.stravaService.getAuthUrl(userId);
      case IntegrationProvider.COROS:
        return this.corosService.getAuthUrl(userId);
      case IntegrationProvider.POLAR:
        return this.polarService.getAuthUrl(userId);
      case IntegrationProvider.GOOGLE_FIT:
        return this.googleFitService.getAuthUrl(userId);
      default:
        throw new NotFoundException(`Integração ${provider} não suportada`);
    }
  }

  async handleCallback(
    provider: IntegrationProvider,
    code: string,
    state: string,
  ) {
    switch (provider) {
      case IntegrationProvider.GARMIN:
        return this.garminService.handleCallback(code, state);
      case IntegrationProvider.STRAVA:
        return this.stravaService.handleCallback(code, state);
      case IntegrationProvider.COROS:
        return this.corosService.handleCallback(code, state);
      case IntegrationProvider.POLAR:
        return this.polarService.handleCallback(code, state);
      case IntegrationProvider.GOOGLE_FIT:
        return this.googleFitService.handleCallback(code, state);
      default:
        throw new NotFoundException(`Integração ${provider} não suportada`);
    }
  }

  async disconnect(userId: string, integrationId: string) {
    const integration = await this.prisma.fitnessIntegration.findFirst({
      where: { id: integrationId, userId },
    });

    if (!integration) {
      throw new NotFoundException('Integração não encontrada');
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integrationId },
      data: { isActive: false },
    });

    return { message: 'Integração desconectada' };
  }

  async syncActivities(userId: string) {
    const integrations = await this.prisma.fitnessIntegration.findMany({
      where: { userId, isActive: true },
    });

    const results = [];

    for (const integration of integrations) {
      switch (integration.provider) {
        case IntegrationProvider.GARMIN:
          results.push(await this.garminService.syncActivities(userId, integration));
          break;
        case IntegrationProvider.STRAVA:
          results.push(await this.stravaService.syncActivities(userId, integration));
          break;
        case IntegrationProvider.COROS:
          results.push(await this.corosService.syncActivities(userId, integration));
          break;
        case IntegrationProvider.POLAR:
          results.push(await this.polarService.syncActivities(userId, integration));
          break;
        case IntegrationProvider.GOOGLE_FIT:
          results.push(await this.googleFitService.syncActivities(userId, integration));
          break;
      }
    }

    return { synced: results };
  }

  // ── Strava Webhook Setup ──

  async setupStravaWebhook(apiBaseUrl: string) {
    const callbackUrl = `${apiBaseUrl}/webhooks/strava`;
    return this.stravaService.registerWebhook(callbackUrl);
  }

  // ── Polar Webhook Setup ──

  async setupPolarWebhook(apiBaseUrl: string) {
    const callbackUrl = `${apiBaseUrl}/webhooks/polar`;
    return this.polarService.registerWebhook(callbackUrl);
  }

  // ── Garmin Push (Training API) ──

  async pushWorkoutToGarmin(workoutId: string) {
    return this.garminService.pushWorkoutToGarmin(workoutId);
  }

  async pushPlanToGarmin(planId: string) {
    return this.garminService.pushPlanToGarmin(planId);
  }

  // ── Garmin Health ──

  async getMyGarminHealthToday(userId: string) {
    return this.garminService.getMyHealthToday(userId);
  }

  async getAthleteGarminHealthToday(coachId: string, athleteId: string) {
    return this.garminService.getHealthToday(coachId, athleteId);
  }

  async getAthleteGarminHealthHistory(coachId: string, athleteId: string, days: number) {
    return this.garminService.getHealthHistory(coachId, athleteId, days);
  }

  // ── Strava Webhook Handlers ──

  async handleStravaActivity(data: {
    athleteId: string;
    activityId: string;
    aspectType: string;
    updates?: any;
  }) {
    const integration = await this.prisma.fitnessIntegration.findFirst({
      where: {
        externalUserId: data.athleteId,
        provider: IntegrationProvider.STRAVA,
        isActive: true,
      },
    });

    if (!integration) return;

    if (data.aspectType === 'create') {
      await this.stravaService.syncSingleActivity(
        integration.userId,
        integration,
        data.activityId,
      );
    } else if (data.aspectType === 'delete') {
      await this.prisma.workoutResult.updateMany({
        where: { externalId: data.activityId },
        data: { externalId: null },
      });
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });
  }

  async handleStravaDeauth(stravaAthleteId: string) {
    await this.prisma.fitnessIntegration.updateMany({
      where: {
        externalUserId: stravaAthleteId,
        provider: IntegrationProvider.STRAVA,
      },
      data: { isActive: false },
    });
  }

  // ── Garmin Webhook Handlers ──

  async handleGarminActivity(data: {
    userId: string;
    activityId: string;
    activityType: string;
    startTime: number;
    duration: number;
    distance: number;
    averagePace?: number;
    averageHeartRate?: number;
    maxHeartRate?: number;
    calories?: number;
  }) {
    const integration = await this.prisma.fitnessIntegration.findFirst({
      where: {
        externalUserId: data.userId,
        provider: IntegrationProvider.GARMIN,
        isActive: true,
      },
    });

    if (!integration) return;

    await this.garminService.processWebhookActivity(integration.userId, data);

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });
  }

  async handleGarminDeauth(garminUserId: string) {
    await this.prisma.fitnessIntegration.updateMany({
      where: {
        externalUserId: garminUserId,
        provider: IntegrationProvider.GARMIN,
      },
      data: { isActive: false },
    });
  }

  async handleGarminHealth(data: {
    userId: string;
    restingHR?: number;
    stressLevel?: number;
    totalSteps?: number;
    date?: string;
    hrv?: number;
    sleepScore?: number;
    sleepHours?: number;
    spo2?: number;
    caloriesActive?: number;
  }) {
    const integration = await this.prisma.fitnessIntegration.findFirst({
      where: {
        externalUserId: data.userId,
        provider: IntegrationProvider.GARMIN,
        isActive: true,
      },
    });

    if (!integration) return;

    const snapshotDate = data.date ? new Date(data.date) : new Date();

    // Upsert full health snapshot
    await this.prisma.garminHealthSnapshot.upsert({
      where: {
        athleteId_date: {
          athleteId: integration.userId,
          date: snapshotDate,
        },
      },
      create: {
        athleteId: integration.userId,
        date: snapshotDate,
        restingHR: data.restingHR,
        stressScore: data.stressLevel,
        steps: data.totalSteps,
        hrv: data.hrv,
        sleepScore: data.sleepScore,
        sleepHours: data.sleepHours,
        spo2: data.spo2,
        caloriesActive: data.caloriesActive,
      },
      update: {
        restingHR: data.restingHR ?? undefined,
        stressScore: data.stressLevel ?? undefined,
        steps: data.totalSteps ?? undefined,
        hrv: data.hrv ?? undefined,
        sleepScore: data.sleepScore ?? undefined,
        sleepHours: data.sleepHours ?? undefined,
        spo2: data.spo2 ?? undefined,
        caloriesActive: data.caloriesActive ?? undefined,
      },
    });

    // Update resting HR on athlete profile if provided
    if (data.restingHR) {
      await this.prisma.athleteProfile.updateMany({
        where: { userId: integration.userId },
        data: { restingHR: data.restingHR },
      });
    }

    // Auto-adjust alert: HRV < 70% of 7-day average → alert coach
    if (data.hrv) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentSnapshots = await this.prisma.garminHealthSnapshot.findMany({
        where: {
          athleteId: integration.userId,
          date: { gte: sevenDaysAgo },
          hrv: { not: null },
        },
        select: { hrv: true },
      });

      if (recentSnapshots.length >= 3) {
        const avgHrv = recentSnapshots.reduce((sum, s) => sum + (s.hrv || 0), 0) / recentSnapshots.length;
        if (data.hrv < avgHrv * 0.7) {
          // Low HRV alert — check for today's workout
          const athlete = await this.prisma.user.findUnique({
            where: { id: integration.userId },
            include: { athleteProfile: { include: { coach: true } } },
          });
          if (athlete?.athleteProfile?.coachId) {
            const coachId = athlete.athleteProfile.coachId;

            // Find today's scheduled workout
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

            const todayWorkout = await this.prisma.workout.findFirst({
              where: {
                athleteId: integration.userId,
                scheduledDate: { gte: startOfDay, lt: endOfDay },
                status: 'SCHEDULED',
              },
            });

            const highIntensityTypes = ['interval', 'tempo', 'veloc', 'fartlek', 'INTERVAL', 'TEMPO'];
            const isHighIntensity = todayWorkout && (
              highIntensityTypes.some((t) =>
                todayWorkout.type?.toLowerCase().includes(t.toLowerCase()) ||
                todayWorkout.title?.toLowerCase().includes(t.toLowerCase()),
              )
            );

            if (isHighIntensity && todayWorkout) {
              // Specific alert with workout details
              await this.prisma.notification.create({
                data: {
                  userId: coachId,
                  type: 'SYSTEM',
                  title: `⚠️ HRV baixo — ${athlete.name}`,
                  body: `HRV: ${data.hrv}ms (média: ${Math.round(avgHrv)}ms). Treino de ${todayWorkout.type} agendado hoje. Sugestão: mudar para Recovery.`,
                  data: {
                    workoutId: todayWorkout.id,
                    athleteId: integration.userId,
                    suggestedType: 'RECOVERY',
                    currentHrv: data.hrv,
                    avgHrv: Math.round(avgHrv),
                  } as any,
                },
              });
            } else {
              // Generic HRV alert
              await this.prisma.notification.create({
                data: {
                  userId: coachId,
                  type: 'SYSTEM',
                  title: `⚠️ HRV Baixo — ${athlete.name}`,
                  body: `HRV de ${data.hrv}ms (média 7d: ${Math.round(avgHrv)}ms). Considere ajustar o treino de hoje para recuperação.`,
                  data: { athleteId: integration.userId, hrv: data.hrv, avgHrv: Math.round(avgHrv) } as any,
                },
              });
            }
          }
        }
      }
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });
  }

  // ── COROS Webhook Handlers ──

  async handleCorosActivity(data: {
    openId: string;
    activityId: string;
    mode: number;
    startTime: number;
    endTime: number;
    totalTime: number;
    distance: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    calorie?: number;
  }) {
    const integration = await this.prisma.fitnessIntegration.findFirst({
      where: {
        externalUserId: data.openId,
        provider: IntegrationProvider.COROS,
        isActive: true,
      },
    });

    if (!integration) return;

    // Trigger a full sync for this user to process the new activity
    await this.corosService.syncActivities(integration.userId, integration);
  }

  async handleCorosDeauth(openId: string) {
    await this.prisma.fitnessIntegration.updateMany({
      where: {
        externalUserId: openId,
        provider: IntegrationProvider.COROS,
      },
      data: { isActive: false },
    });
  }

  // ── Polar Webhook Handlers ──

  async handlePolarExercise(data: {
    userId: string;
    entity_id: string;
    event_type: string;
    timestamp: string;
  }) {
    await this.polarService.handleWebhookExercise(data);
  }
}
