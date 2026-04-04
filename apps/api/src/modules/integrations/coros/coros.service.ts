/**
 * COROS Open API Integration
 *
 * OAuth 2.0 flow + activity sync for COROS GPS watches.
 * Docs: https://open.coros.com/
 *
 * Required env vars:
 *   COROS_CLIENT_ID
 *   COROS_CLIENT_SECRET
 *   COROS_REDIRECT_URI   (e.g. https://your-api.railway.app/api/integrations/COROS/callback)
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { FitnessIntegration, IntegrationProvider, WorkoutSource, WorkoutStatus } from '@prisma/client';

const COROS_AUTH_URL   = 'https://open.coros.com/oauth2/authorize';
const COROS_TOKEN_URL  = 'https://open.coros.com/oauth2/accesstoken';
const COROS_API_BASE   = 'https://open.coros.com';

interface CorosTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  openId: string; // COROS user ID
}

interface CorosActivity {
  activityId: string;
  mode: number;       // 100 = running, 200 = cycling, …
  startTime: number;  // Unix timestamp (seconds)
  endTime: number;
  totalTime: number;  // seconds
  distance: number;   // meters
  avgHeartRate?: number;
  maxHeartRate?: number;
  calorie?: number;
  totalAscent?: number;
}

@Injectable()
export class CorosService {
  private readonly logger = new Logger(CorosService.name);

  private readonly clientId     = process.env.COROS_CLIENT_ID     || '';
  private readonly clientSecret = process.env.COROS_CLIENT_SECRET || '';
  private readonly redirectUri  = process.env.COROS_REDIRECT_URI  ||
    'http://localhost:3000/api/integrations/COROS/callback';

  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────
  // OAuth Flow
  // ──────────────────────────────────────

  async getAuthUrl(userId: string) {
    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestException(
        'Integração com COROS ainda não configurada. Configure COROS_CLIENT_ID e COROS_CLIENT_SECRET.',
      );
    }

    const state = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.appConfig.upsert({
      where:  { key: `oauth_state:coros:${state}` },
      create: { key: `oauth_state:coros:${state}`, value: { userId, expiresAt } },
      update: { value: { userId, expiresAt } },
    });

    const params = new URLSearchParams({
      client_id:     this.clientId,
      response_type: 'code',
      redirect_uri:  this.redirectUri,
      scope:         'activity.read',
      state,
    });

    return {
      url: `${COROS_AUTH_URL}?${params.toString()}`,
      provider: IntegrationProvider.COROS,
    };
  }

  async handleCallback(code: string, state: string) {
    const stateRecord = await this.prisma.appConfig.findUnique({
      where: { key: `oauth_state:coros:${state}` },
    });
    if (!stateRecord) throw new BadRequestException('Estado OAuth inválido ou expirado');

    const { userId, expiresAt } = stateRecord.value as any;
    if (new Date() > new Date(expiresAt)) {
      await this.prisma.appConfig.delete({ where: { key: `oauth_state:coros:${state}` } });
      throw new BadRequestException('Estado OAuth expirado. Tente novamente.');
    }
    await this.prisma.appConfig.delete({ where: { key: `oauth_state:coros:${state}` } });

    const tokenData = await this.exchangeCodeForToken(code);

    await this.prisma.fitnessIntegration.upsert({
      where: { userId_provider: { userId, provider: IntegrationProvider.COROS } },
      create: {
        userId,
        provider:       IntegrationProvider.COROS,
        accessToken:    tokenData.access_token,
        refreshToken:   tokenData.refresh_token,
        expiresAt:      new Date(Date.now() + tokenData.expires_in * 1000),
        externalUserId: tokenData.openId,
        isActive:       true,
      },
      update: {
        accessToken:    tokenData.access_token,
        refreshToken:   tokenData.refresh_token,
        expiresAt:      new Date(Date.now() + tokenData.expires_in * 1000),
        externalUserId: tokenData.openId,
        isActive:       true,
      },
    });

    return { success: true, provider: IntegrationProvider.COROS };
  }

  // ──────────────────────────────────────
  // Sync Activities FROM COROS
  // ──────────────────────────────────────

  async syncActivities(userId: string, integration: FitnessIntegration) {
    this.logger.log(`Sincronizando atividades COROS para usuário ${userId}`);

    const accessToken = await this.ensureValidToken(integration);
    const activities  = await this.fetchRecentActivities(accessToken, integration.externalUserId || '');
    let synced = 0;

    for (const activity of activities) {
      const externalId = `coros_${activity.activityId}`;

      const existing = await this.prisma.workoutResult.findFirst({ where: { externalId } });
      if (existing) continue;

      const startTime = new Date(activity.startTime * 1000);
      const matched   = await this.findMatchingWorkout(userId, startTime, activity.distance);

      if (matched) {
        const pace = this.calculatePace(activity.distance, activity.totalTime);

        await this.prisma.workoutResult.upsert({
          where:  { workoutId: matched.id },
          create: {
            workoutId:     matched.id,
            source:        WorkoutSource.COROS,
            externalId,
            distanceMeters: Math.round(activity.distance),
            durationSeconds: Math.round(activity.totalTime),
            avgPace:        pace,
            avgHeartRate:   activity.avgHeartRate  || null,
            maxHeartRate:   activity.maxHeartRate  || null,
            calories:       activity.calorie       || null,
            elevationGain:  activity.totalAscent   || null,
          },
          update: {
            source:        WorkoutSource.COROS,
            externalId,
            distanceMeters: Math.round(activity.distance),
            durationSeconds: Math.round(activity.totalTime),
            avgPace:        pace,
            avgHeartRate:   activity.avgHeartRate  || null,
            maxHeartRate:   activity.maxHeartRate  || null,
            calories:       activity.calorie       || null,
            elevationGain:  activity.totalAscent   || null,
          },
        });

        await this.prisma.workout.update({
          where: { id: matched.id },
          data:  { status: WorkoutStatus.COMPLETED, completedAt: startTime },
        });

        synced++;
      }
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    });

    return { provider: 'COROS', synced };
  }

  // ──────────────────────────────────────
  // Private: COROS API HTTP Calls
  // ──────────────────────────────────────

  private async exchangeCodeForToken(code: string): Promise<CorosTokenResponse> {
    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      redirect_uri:  this.redirectUri,
    });

    const res = await fetch(COROS_TOKEN_URL, {
      method:  'POST',
      signal:  AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`COROS token exchange failed: ${res.status} ${errorText}`);
      throw new BadRequestException('Falha na autenticação com COROS');
    }

    return res.json() as any;
  }

  private async refreshAccessToken(integration: FitnessIntegration): Promise<CorosTokenResponse> {
    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: integration.refreshToken!,
      client_id:     this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(COROS_TOKEN_URL, {
      method:  'POST',
      signal:  AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!res.ok) throw new BadRequestException('Token COROS expirado. Reconecte sua conta.');
    return res.json() as any;
  }

  /**
   * COROS activity query endpoint:
   *   GET /v2/activity/query?openId={id}&after={unix}&before={unix}&mode=100&size=20
   * mode 100 = Running
   */
  private async fetchRecentActivities(
    accessToken: string,
    openId: string,
  ): Promise<CorosActivity[]> {
    const after  = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const before = Math.floor(Date.now() / 1000);

    const url = `${COROS_API_BASE}/v2/activity/query?` +
      `openId=${encodeURIComponent(openId)}&after=${after}&before=${before}&mode=100&size=50`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      this.logger.warn(`COROS fetch activities failed: ${res.status}`);
      return [];
    }

    const data: any = await res.json();
    // COROS response: { message: 'OK', result: { activityList: [...] } }
    return data?.result?.activityList || data?.data || [];
  }

  // ──────────────────────────────────────
  // Private: Token & Workout Helpers
  // ──────────────────────────────────────

  private async ensureValidToken(integration: FitnessIntegration): Promise<string> {
    if (integration.expiresAt && integration.expiresAt > new Date()) {
      return integration.accessToken;
    }

    if (!integration.refreshToken) {
      throw new BadRequestException('Token COROS expirado. Reconecte sua conta.');
    }

    this.logger.log(`Renovando token COROS para integração ${integration.id}`);
    const newTokens = await this.refreshAccessToken(integration);

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken:  newTokens.access_token,
        refreshToken: newTokens.refresh_token,
        expiresAt:    new Date(Date.now() + newTokens.expires_in * 1000),
      },
    });

    return newTokens.access_token;
  }

  private async findMatchingWorkout(userId: string, date: Date, distanceMeters: number) {
    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(date); endOfDay.setHours(23, 59, 59, 999);
    const tolerance  = 0.1;

    return this.prisma.workout.findFirst({
      where: {
        athleteId:     userId,
        scheduledDate: { gte: startOfDay, lte: endOfDay },
        status:        WorkoutStatus.SCHEDULED,
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
    const minutes     = Math.floor(paceSeconds / 60);
    const seconds     = Math.round(paceSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}
