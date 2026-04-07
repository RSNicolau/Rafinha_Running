/**
 * Google Fit Integration
 *
 * OAuth 2.0 + activity sync for Google Fit.
 * Uses Google Fitness REST API v1.
 *
 * Required env vars:
 *   GOOGLE_FIT_CLIENT_ID
 *   GOOGLE_FIT_CLIENT_SECRET
 *   GOOGLE_FIT_REDIRECT_URI
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { FitnessIntegration, IntegrationProvider, WorkoutSource, WorkoutStatus } from '@prisma/client';
import { encrypt, decrypt } from '../../../common/utils/encryption';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_FIT_API = 'https://www.googleapis.com/fitness/v1/users/me';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleFitSession {
  id: string;
  name: string;
  startTimeMillis: string;
  endTimeMillis: string;
  activityType: number; // 8 = running
  application: { packageName: string };
}

@Injectable()
export class GoogleFitService {
  private readonly logger = new Logger(GoogleFitService.name);

  private readonly clientId = process.env.GOOGLE_FIT_CLIENT_ID || '';
  private readonly clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET || '';
  private readonly redirectUri = process.env.GOOGLE_FIT_REDIRECT_URI ||
    'http://localhost:3000/api/integrations/GOOGLE_FIT/callback';

  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────
  // OAuth Flow
  // ──────────────────────────────────────

  async getAuthUrl(userId: string) {
    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestException(
        'Integração com Google Fit ainda não configurada. Configure GOOGLE_FIT_CLIENT_ID e GOOGLE_FIT_CLIENT_SECRET.',
      );
    }

    const state = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.appConfig.upsert({
      where: { key: `oauth_state:google_fit:${state}` },
      create: { key: `oauth_state:google_fit:${state}`, value: { userId, expiresAt } },
      update: { value: { userId, expiresAt } },
    });

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.heart_rate.read',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return {
      url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
      provider: IntegrationProvider.GOOGLE_FIT,
    };
  }

  async handleCallback(code: string, state: string) {
    const stateRecord = await this.prisma.appConfig.findUnique({
      where: { key: `oauth_state:google_fit:${state}` },
    });
    if (!stateRecord) throw new BadRequestException('Estado OAuth inválido ou expirado');

    const { userId, expiresAt } = stateRecord.value as any;
    if (new Date() > new Date(expiresAt)) {
      await this.prisma.appConfig.delete({ where: { key: `oauth_state:google_fit:${state}` } });
      throw new BadRequestException('Estado OAuth expirado. Tente novamente.');
    }
    await this.prisma.appConfig.delete({ where: { key: `oauth_state:google_fit:${state}` } });

    const tokenData = await this.exchangeCodeForToken(code);

    await this.prisma.fitnessIntegration.upsert({
      where: { userId_provider: { userId, provider: IntegrationProvider.GOOGLE_FIT } },
      create: {
        userId,
        provider: IntegrationProvider.GOOGLE_FIT,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        isActive: true,
      },
      update: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        isActive: true,
      },
    });

    return { success: true, provider: IntegrationProvider.GOOGLE_FIT };
  }

  // ──────────────────────────────────────
  // Sync Activities FROM Google Fit
  // ──────────────────────────────────────

  async syncActivities(userId: string, integration: FitnessIntegration) {
    this.logger.log(`Sincronizando atividades Google Fit para usuário ${userId}`);

    const accessToken = await this.ensureValidToken(integration);
    const sessions = await this.fetchRunningSessions(accessToken);
    let synced = 0;

    for (const session of sessions) {
      const externalId = `gfit_${session.id}`;

      const existing = await this.prisma.workoutResult.findFirst({ where: { externalId } });
      if (existing) continue;

      const startTime = new Date(parseInt(session.startTimeMillis));
      const endTime = new Date(parseInt(session.endTimeMillis));
      const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      // Fetch distance and HR data for this session
      const distance = await this.fetchSessionDistance(accessToken, session.startTimeMillis, session.endTimeMillis);
      const hrData = await this.fetchSessionHeartRate(accessToken, session.startTimeMillis, session.endTimeMillis);

      const matched = await this.findMatchingWorkout(userId, startTime, distance);

      if (matched) {
        const pace = this.calculatePace(distance, durationSeconds);

        await this.prisma.workoutResult.upsert({
          where: { workoutId: matched.id },
          create: {
            workoutId: matched.id,
            source: WorkoutSource.GOOGLE_FIT,
            externalId,
            distanceMeters: Math.round(distance),
            durationSeconds,
            avgPace: pace,
            avgHeartRate: hrData.avg || null,
            maxHeartRate: hrData.max || null,
          },
          update: {
            source: WorkoutSource.GOOGLE_FIT,
            externalId,
            distanceMeters: Math.round(distance),
            durationSeconds,
            avgPace: pace,
            avgHeartRate: hrData.avg || null,
            maxHeartRate: hrData.max || null,
          },
        });

        await this.prisma.workout.update({
          where: { id: matched.id },
          data: { status: WorkoutStatus.COMPLETED, completedAt: startTime },
        });

        synced++;
      }
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    return { provider: 'GOOGLE_FIT', synced };
  }

  // ──────────────────────────────────────
  // Private: Google API HTTP Calls
  // ──────────────────────────────────────

  private async exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`Google token exchange failed: ${res.status} ${errorText}`);
      throw new BadRequestException('Falha na autenticação com Google Fit');
    }

    return res.json() as any;
  }

  private async refreshAccessToken(integration: FitnessIntegration): Promise<GoogleTokenResponse> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: decrypt(integration.refreshToken!),
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) throw new BadRequestException('Token Google Fit expirado. Reconecte sua conta.');
    return res.json() as any;
  }

  /** Fetch running sessions from the last 7 days */
  private async fetchRunningSessions(accessToken: string): Promise<GoogleFitSession[]> {
    const startTimeMillis = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const endTimeMillis = Date.now();

    const url = `${GOOGLE_FIT_API}/sessions?startTime=${new Date(startTimeMillis).toISOString()}&endTime=${new Date(endTimeMillis).toISOString()}&activityType=8`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      this.logger.warn(`Google Fit fetch sessions failed: ${res.status}`);
      return [];
    }

    const data: any = await res.json();
    return (data.session || []).filter((s: any) => s.activityType === 8); // 8 = running
  }

  /** Fetch total distance for a session time range */
  private async fetchSessionDistance(accessToken: string, startMillis: string, endMillis: string): Promise<number> {
    const url = `${GOOGLE_FIT_API}/dataset:aggregate`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: 'com.google.distance.delta' }],
        startTimeMillis: parseInt(startMillis),
        endTimeMillis: parseInt(endMillis),
        bucketByTime: { durationMillis: parseInt(endMillis) - parseInt(startMillis) },
      }),
    });

    if (!res.ok) return 0;

    const data: any = await res.json();
    let totalDistance = 0;
    for (const bucket of data.bucket || []) {
      for (const dataset of bucket.dataset || []) {
        for (const point of dataset.point || []) {
          for (const val of point.value || []) {
            totalDistance += val.fpVal || 0;
          }
        }
      }
    }
    return totalDistance;
  }

  /** Fetch heart rate data for a session time range */
  private async fetchSessionHeartRate(
    accessToken: string,
    startMillis: string,
    endMillis: string,
  ): Promise<{ avg: number | null; max: number | null }> {
    const url = `${GOOGLE_FIT_API}/dataset:aggregate`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
        startTimeMillis: parseInt(startMillis),
        endTimeMillis: parseInt(endMillis),
        bucketByTime: { durationMillis: parseInt(endMillis) - parseInt(startMillis) },
      }),
    });

    if (!res.ok) return { avg: null, max: null };

    const data: any = await res.json();
    const hrValues: number[] = [];

    for (const bucket of data.bucket || []) {
      for (const dataset of bucket.dataset || []) {
        for (const point of dataset.point || []) {
          for (const val of point.value || []) {
            if (val.fpVal) hrValues.push(val.fpVal);
          }
        }
      }
    }

    if (!hrValues.length) return { avg: null, max: null };
    const avg = Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length);
    const max = Math.round(Math.max(...hrValues));
    return { avg, max };
  }

  // ──────────────────────────────────────
  // Private: Token & Workout Helpers
  // ──────────────────────────────────────

  private async ensureValidToken(integration: FitnessIntegration): Promise<string> {
    if (integration.expiresAt && integration.expiresAt > new Date()) {
      return decrypt(integration.accessToken);
    }

    if (!integration.refreshToken) {
      throw new BadRequestException('Token Google Fit expirado. Reconecte sua conta.');
    }

    this.logger.log(`Renovando token Google Fit para integração ${integration.id}`);
    const newTokens = await this.refreshAccessToken(integration);

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken: encrypt(newTokens.access_token),
        refreshToken: newTokens.refresh_token ? encrypt(newTokens.refresh_token) : integration.refreshToken,
        expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
      },
    });

    return newTokens.access_token;
  }

  private async findMatchingWorkout(userId: string, date: Date, distanceMeters: number) {
    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
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
