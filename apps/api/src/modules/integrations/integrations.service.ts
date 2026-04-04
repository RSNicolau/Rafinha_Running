import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GarminService } from './garmin/garmin.service';
import { StravaService } from './strava/strava.service';
import { CorosService } from './coros/coros.service';
import { PolarService } from './polar/polar.service';
import { IntegrationProvider } from '@prisma/client';

@Injectable()
export class IntegrationsService {
  constructor(
    private prisma: PrismaService,
    private garminService: GarminService,
    private stravaService: StravaService,
    private corosService: CorosService,
    private polarService: PolarService,
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
  }) {
    const integration = await this.prisma.fitnessIntegration.findFirst({
      where: {
        externalUserId: data.userId,
        provider: IntegrationProvider.GARMIN,
        isActive: true,
      },
    });

    if (!integration) return;

    if (data.restingHR) {
      await this.prisma.athleteProfile.updateMany({
        where: { userId: integration.userId },
        data: { restingHR: data.restingHR },
      });
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
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
