import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { FitnessIntegration, IntegrationProvider, WorkoutSource, WorkoutStatus } from '@prisma/client';
import { encrypt, decrypt } from '../../../common/utils/encryption';

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

@Injectable()
export class StravaService {
  private readonly logger = new Logger(StravaService.name);

  private readonly clientId = process.env.STRAVA_CLIENT_ID || '';
  private readonly clientSecret = process.env.STRAVA_CLIENT_SECRET || '';
  private readonly redirectUri =
    process.env.STRAVA_REDIRECT_URI || 'http://localhost:3000/api/integrations/STRAVA/callback';

  constructor(private prisma: PrismaService) {}

  async getAuthUrl(userId: string) {
    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestException(
        'Integração com Strava ainda não configurada. O administrador precisa configurar as credenciais do Strava (STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET).',
      );
    }

    // Use a random nonce as state (CSRF protection)
    const state = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min TTL

    await this.prisma.appConfig.upsert({
      where: { key: `oauth_state:strava:${state}` },
      create: { key: `oauth_state:strava:${state}`, value: { userId, expiresAt } },
      update: { value: { userId, expiresAt } },
    });

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: 'activity:read_all',
      state,
      approval_prompt: 'auto',
    });

    return {
      url: `https://www.strava.com/oauth/authorize?${params.toString()}`,
      provider: IntegrationProvider.STRAVA,
    };
  }

  async handleCallback(code: string, state: string) {
    // Verify and consume the state nonce
    const stateRecord = await this.prisma.appConfig.findUnique({
      where: { key: `oauth_state:strava:${state}` },
    });
    if (!stateRecord) throw new BadRequestException('Estado OAuth inválido ou expirado');

    const { userId, expiresAt } = stateRecord.value as any;
    if (new Date() > new Date(expiresAt)) {
      await this.prisma.appConfig.delete({ where: { key: `oauth_state:strava:${state}` } });
      throw new BadRequestException('Estado OAuth expirado. Tente novamente.');
    }
    await this.prisma.appConfig.delete({ where: { key: `oauth_state:strava:${state}` } });

    const tokenData = await this.exchangeCodeForToken(code);

    await this.prisma.fitnessIntegration.upsert({
      where: {
        userId_provider: { userId, provider: IntegrationProvider.STRAVA },
      },
      create: {
        userId,
        provider: IntegrationProvider.STRAVA,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        expiresAt: new Date(tokenData.expires_at * 1000),
        externalUserId: String(tokenData.athlete?.id || ''),
        isActive: true,
      },
      update: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        expiresAt: new Date(tokenData.expires_at * 1000),
        isActive: true,
      },
    });

    return { success: true, provider: IntegrationProvider.STRAVA };
  }

  async syncActivities(userId: string, integration: FitnessIntegration) {
    this.logger.log(`Sincronizando atividades Strava para usuário ${userId}`);

    const accessToken = await this.ensureValidToken(integration);
    const activities = await this.fetchRecentActivities(accessToken);
    let synced = 0;

    for (const activity of activities) {
      if (activity.type !== 'Run' && activity.type !== 'TrailRun') continue;

      const externalId = `strava_${activity.id}`;
      const existing = await this.prisma.workoutResult.findFirst({
        where: { externalId },
      });
      if (existing) continue;

      const matchedWorkout = await this.findMatchingWorkout(
        userId,
        new Date(activity.start_date),
        activity.distance,
      );

      if (matchedWorkout) {
        const avgPace = this.calculatePace(activity.distance, activity.moving_time);
        await this.prisma.workoutResult.upsert({
          where: { workoutId: matchedWorkout.id },
          create: {
            workoutId: matchedWorkout.id,
            source: WorkoutSource.STRAVA,
            externalId,
            distanceMeters: Math.round(activity.distance),
            durationSeconds: activity.moving_time,
            avgPace,
            avgHeartRate: activity.average_heartrate || null,
            maxHeartRate: activity.max_heartrate || null,
            calories: Math.round(activity.calories || 0),
            elevationGain: activity.total_elevation_gain || null,
          },
          update: {
            source: WorkoutSource.STRAVA,
            externalId,
            distanceMeters: Math.round(activity.distance),
            durationSeconds: activity.moving_time,
            avgPace,
            avgHeartRate: activity.average_heartrate || null,
            maxHeartRate: activity.max_heartrate || null,
            calories: Math.round(activity.calories || 0),
            elevationGain: activity.total_elevation_gain || null,
          },
        });

        await this.prisma.workout.update({
          where: { id: matchedWorkout.id },
          data: {
            status: WorkoutStatus.COMPLETED,
            completedAt: new Date(activity.start_date),
          },
        });

        synced++;
      }
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    return { provider: 'STRAVA', synced };
  }

  /**
   * Register the Strava webhook subscription with Strava's API.
   * Safe to call multiple times — returns 'already_registered' if already set up.
   */
  async registerWebhook(callbackUrl: string): Promise<{ status: string; subscriptionId?: number; message?: string }> {
    const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
    if (!this.clientId || !this.clientSecret) {
      return { status: 'error', message: 'STRAVA_CLIENT_ID ou STRAVA_CLIENT_SECRET não configurados' };
    }
    if (!verifyToken) {
      return { status: 'error', message: 'STRAVA_WEBHOOK_VERIFY_TOKEN não configurado' };
    }

    const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        callback_url: callbackUrl,
        verify_token: verifyToken,
      }),
    });

    const data = await res.json() as any;

    if (res.status === 201) {
      this.logger.log(`Strava webhook registrado: subscriptionId=${data.id}`);
      return { status: 'registered', subscriptionId: data.id };
    }
    if (res.status === 422) {
      return { status: 'already_registered', message: 'Webhook já está registrado no Strava' };
    }
    this.logger.error(`Strava webhook registration failed: ${res.status} ${JSON.stringify(data)}`);
    return { status: 'error', message: `Strava retornou ${res.status}: ${JSON.stringify(data)}` };
  }

  /**
   * Sync a single activity by ID (called from Strava webhook)
   */
  async syncSingleActivity(userId: string, integration: FitnessIntegration, activityId: string) {
    const accessToken = await this.ensureValidToken(integration);

    const res = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      this.logger.warn(`Strava fetch activity ${activityId} failed: ${res.status}`);
      return;
    }

    const activity = (await res.json()) as any;
    if (activity.type !== 'Run' && activity.type !== 'TrailRun') return;

    const externalId = `strava_${activity.id}`;
    const existing = await this.prisma.workoutResult.findFirst({ where: { externalId } });
    if (existing) return;

    const matchedWorkout = await this.findMatchingWorkout(
      userId,
      new Date(activity.start_date),
      activity.distance,
    );

    if (matchedWorkout) {
      const avgPace = this.calculatePace(activity.distance, activity.moving_time);
      await this.prisma.workoutResult.upsert({
        where: { workoutId: matchedWorkout.id },
        create: {
          workoutId: matchedWorkout.id,
          source: WorkoutSource.STRAVA,
          externalId,
          distanceMeters: Math.round(activity.distance),
          durationSeconds: activity.moving_time,
          avgPace,
          avgHeartRate: activity.average_heartrate || null,
          maxHeartRate: activity.max_heartrate || null,
          calories: Math.round(activity.calories || 0),
          elevationGain: activity.total_elevation_gain || null,
        },
        update: {
          source: WorkoutSource.STRAVA,
          externalId,
          distanceMeters: Math.round(activity.distance),
          durationSeconds: activity.moving_time,
          avgPace,
          avgHeartRate: activity.average_heartrate || null,
          maxHeartRate: activity.max_heartrate || null,
          calories: Math.round(activity.calories || 0),
          elevationGain: activity.total_elevation_gain || null,
        },
      });

      await this.prisma.workout.update({
        where: { id: matchedWorkout.id },
        data: { status: WorkoutStatus.COMPLETED, completedAt: new Date(activity.start_date) },
      });

      this.logger.log(`Synced Strava activity ${activityId} → workout ${matchedWorkout.id}`);
    }
  }

  // ── Private: Strava API HTTP Calls ──

  private async exchangeCodeForToken(code: string) {
    const res = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`Strava token exchange failed: ${res.status} ${errorText}`);
      throw new BadRequestException('Falha na autenticação com Strava');
    }

    return res.json() as any;
  }

  private async refreshAccessToken(refreshToken: string) {
    const res = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      throw new BadRequestException('Falha ao renovar token Strava. Reconecte sua conta.');
    }

    return res.json() as any;
  }

  private async fetchRecentActivities(accessToken: string) {
    const after = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

    const res = await fetch(
      `${STRAVA_API_BASE}/athlete/activities?after=${after}&per_page=30`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) },
    );

    if (!res.ok) {
      this.logger.warn(`Strava fetch activities failed: ${res.status}`);
      return [];
    }

    return (await res.json()) as any[];
  }

  private async ensureValidToken(integration: FitnessIntegration): Promise<string> {
    if (integration.expiresAt && integration.expiresAt > new Date()) {
      return decrypt(integration.accessToken);
    }

    if (!integration.refreshToken) {
      throw new BadRequestException('Token Strava expirado. Reconecte sua conta.');
    }

    this.logger.log(`Renovando token Strava para integração ${integration.id}`);
    const newTokens = await this.refreshAccessToken(decrypt(integration.refreshToken));

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken: encrypt(newTokens.access_token),
        refreshToken: encrypt(newTokens.refresh_token),
        expiresAt: new Date(newTokens.expires_at * 1000),
      },
    });

    return newTokens.access_token;
  }

  private async findMatchingWorkout(userId: string, date: Date, distanceMeters: number) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const tolerance = 0.1;

    return this.prisma.workout.findFirst({
      where: {
        athleteId: userId,
        scheduledDate: { gte: startOfDay, lte: endOfDay },
        status: WorkoutStatus.SCHEDULED,
        ...(distanceMeters > 0 && {
          targetDistanceMeters: {
            gte: Math.round(distanceMeters * (1 - tolerance)),
            lte: Math.round(distanceMeters * (1 + tolerance)),
          },
        }),
      },
    });
  }

  private calculatePace(distanceMeters: number, durationSeconds: number): string {
    if (distanceMeters <= 0) return '0:00';
    const paceSeconds = (durationSeconds / distanceMeters) * 1000;
    const minutes = Math.floor(paceSeconds / 60);
    const seconds = Math.round(paceSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}
