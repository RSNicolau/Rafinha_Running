import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GarminService } from './garmin/garmin.service';
import { StravaService } from './strava/strava.service';
import { CorosService } from './coros/coros.service';
import { GoogleFitService } from './google-fit/google-fit.service';
import { IntegrationProvider, UserRole } from '@prisma/client';
import { StravaWebhookEvent } from './strava/strava.service';
import { OAuthClient, peekOAuthState } from './oauth-state';
import {
  isGarminConfigured, isProviderConnectable, providerAvailability, publicApiBaseUrl,
} from './integration-env';

const MANUAL_SYNC_COOLDOWN_MS = 60_000;

export interface AuthUser {
  id: string;
  role?: UserRole | string | null;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly lastManualSync = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private garminService: GarminService,
    private stravaService: StravaService,
    private corosService: CorosService,
    private googleFitService: GoogleFitService,
  ) {}

  getProviders() {
    return providerAvailability();
  }

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

  async getConnectUrl(
    userId: string,
    provider: IntegrationProvider,
    client: OAuthClient = 'web',
  ): Promise<{ url: string; provider: IntegrationProvider; state: string }> {
    if (!isProviderConnectable(provider)) {
      const info = providerAvailability().find((p) => p.provider === provider);
      throw new BadRequestException(info?.reason || `Integração ${provider} indisponível`);
    }
    switch (provider) {
      case IntegrationProvider.GARMIN:
        return this.garminService.getAuthUrl(userId, client);
      case IntegrationProvider.STRAVA:
        return this.stravaService.getAuthUrl(userId, client);
      case IntegrationProvider.COROS:
        return this.corosService.getAuthUrl(userId, client);
      case IntegrationProvider.GOOGLE_FIT:
        return this.googleFitService.getAuthUrl(userId, client);
      default:
        throw new NotFoundException(`Integração ${provider} não suportada`);
    }
  }

  /** Lê (sem consumir) o estado OAuth — usado pelo callback público para decidir web × mobile. */
  peekOAuthState(provider: IntegrationProvider, state: string) {
    return peekOAuthState(this.prisma, provider, state);
  }

  async handleCallback(
    provider: IntegrationProvider,
    code: string,
    state: string,
    opts: { expectedUserId?: string; grantedScope?: string } = {},
  ) {
    if (!isProviderConnectable(provider)) {
      throw new BadRequestException(`Integração ${provider} indisponível`);
    }
    switch (provider) {
      case IntegrationProvider.GARMIN:
        return this.garminService.handleCallback(code, state, opts);
      case IntegrationProvider.STRAVA:
        return this.stravaService.handleCallback(code, state, opts);
      case IntegrationProvider.COROS:
        return this.corosService.handleCallback(code, state, opts);
      case IntegrationProvider.GOOGLE_FIT:
        return this.googleFitService.handleCallback(code, state, opts);
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

    if (integration.provider === IntegrationProvider.STRAVA && integration.isActive) {
      await this.stravaService.deauthorize(integration);
    }

    // Desativa e apaga os tokens (não guardamos credenciais de conexões encerradas)
    await this.prisma.fitnessIntegration.update({
      where: { id: integrationId },
      data: { isActive: false, accessToken: '', refreshToken: null, expiresAt: null },
    });

    return { message: 'Integração desconectada' };
  }

  async syncActivities(userId: string) {
    // Protege a cota de API do app (Strava: 100 req/15 min, 1000/dia para o app inteiro)
    const last = this.lastManualSync.get(userId) ?? 0;
    if (Date.now() - last < MANUAL_SYNC_COOLDOWN_MS) {
      throw new HttpException('Aguarde um minuto antes de sincronizar novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.lastManualSync.set(userId, Date.now());
    if (this.lastManualSync.size > 10_000) this.lastManualSync.clear();

    const integrations = await this.prisma.fitnessIntegration.findMany({
      where: { userId, isActive: true },
    });

    const results: any[] = [];

    for (const integration of integrations) {
      if (!isProviderConnectable(integration.provider)) continue;
      try {
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
          case IntegrationProvider.GOOGLE_FIT:
            results.push(await this.googleFitService.syncActivities(userId, integration));
            break;
        }
      } catch (err: any) {
        this.logger.warn(`Sync ${integration.provider} falhou para ${userId}: ${err?.message}`);
        results.push({ provider: integration.provider, synced: 0, error: err?.message || 'erro' });
      }
    }

    return { synced: results };
  }

  // ── Strava Webhook Setup ──

  /** URL de callback derivada SÓ do ambiente (nunca do header Host da requisição). */
  stravaWebhookCallbackUrl(): string {
    return process.env.STRAVA_WEBHOOK_CALLBACK_URL || `${publicApiBaseUrl()}/webhooks/strava`;
  }

  async setupStravaWebhook() {
    return this.stravaService.registerWebhook(this.stravaWebhookCallbackUrl());
  }

  // ── Garmin Push (Training API) ──

  /**
   * Quem pode operar treinos/planos de um atleta: o próprio atleta, o coach dele
   * (AthleteProfile.coachId) ou ADMIN/SUPER_ADMIN. Sem acesso → 404 (não revela existência).
   */
  private async assertCanManageAthlete(user: AuthUser, athleteId: string, notFoundMsg: string) {
    if (!user?.id) throw new ForbiddenException('Acesso negado');
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) return;
    if (user.id === athleteId) return;
    if (user.role === UserRole.COACH) {
      const profile = await this.prisma.athleteProfile.findUnique({
        where: { userId: athleteId },
        select: { coachId: true },
      });
      if (profile?.coachId && profile.coachId === user.id) return;
    }
    throw new NotFoundException(notFoundMsg);
  }

  private assertGarminAvailable() {
    if (!isGarminConfigured()) {
      throw new BadRequestException(
        'Integração direta com Garmin indisponível. Use Strava: conecte seu relógio à Strava e ele sincroniza automaticamente.',
      );
    }
  }

  async pushWorkoutToGarmin(user: AuthUser, workoutId: string) {
    this.assertGarminAvailable();
    const workout = await this.prisma.workout.findUnique({
      where: { id: workoutId },
      select: { id: true, athleteId: true },
    });
    if (!workout) throw new NotFoundException('Treino não encontrado');
    await this.assertCanManageAthlete(user, workout.athleteId, 'Treino não encontrado');
    return this.garminService.pushWorkoutToGarmin(workoutId);
  }

  async pushPlanToGarmin(user: AuthUser, planId: string) {
    this.assertGarminAvailable();
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id: planId },
      select: { id: true, athleteId: true, deletedAt: true },
    });
    if (!plan || plan.deletedAt) throw new NotFoundException('Plano não encontrado');
    await this.assertCanManageAthlete(user, plan.athleteId, 'Plano não encontrado');
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
    const safeDays = Math.min(Math.max(1, days || 30), 365);
    return this.garminService.getHealthHistory(coachId, athleteId, safeDays);
  }

  // ── Strava Webhook ──

  async handleStravaWebhook(event: StravaWebhookEvent) {
    return this.stravaService.handleWebhookEvent(event);
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

}
