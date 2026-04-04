/**
 * Polar Open AccessLink API v3 Integration
 *
 * OAuth 2.0 flow + exercise transaction sync for Polar sports watches.
 * Docs: https://www.polar.com/accesslink-api/
 *
 * Flow:
 *   1. OAuth → get access_token (never expires for user grants)
 *   2. Register user: POST /v3/users → must be done once per user
 *   3. Pull exercise data via transactions:
 *      a. Create transaction: POST /v3/users/{id}/exercise-transactions
 *      b. List activities:    GET  /v3/users/{id}/exercise-transactions/{txId}
 *      c. Get detail:         GET  /v3/users/{id}/exercise-transactions/{txId}/exercises/{exId}
 *      d. Commit transaction: PUT  /v3/users/{id}/exercise-transactions/{txId}
 *
 * Required env vars:
 *   POLAR_CLIENT_ID
 *   POLAR_CLIENT_SECRET
 *   POLAR_REDIRECT_URI   (e.g. https://your-api.railway.app/api/integrations/POLAR/callback)
 *   POLAR_WEBHOOK_SECRET (for webhook signature validation — optional)
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { FitnessIntegration, IntegrationProvider, WorkoutSource, WorkoutStatus } from '@prisma/client';

const POLAR_AUTH_URL   = 'https://flow.polar.com/oauth2/authorization';
const POLAR_TOKEN_URL  = 'https://polarremote.com/v2/oauth2/token';
const POLAR_API_BASE   = 'https://www.polaraccesslink.com/v3';

interface PolarTokenResponse {
  access_token:  string;
  token_type:    string;
  x_user_id:     number;  // Polar user ID
}

interface PolarExercise {
  id:              string;
  upload_time:     string; // ISO8601
  polar_user:      string;
  device:          string;
  start_time:      string; // ISO8601 (local)
  start_time_utc_offset: number; // minutes
  duration:        string; // ISO8601 duration, e.g. "PT1H32M12S"
  calories:        number;
  distance?:       number; // meters
  heart_rate?: {
    average: number;
    maximum: number;
  };
  training_load?:  number;
  sport:           string; // "RUNNING", "CYCLING", …
  has_route:       boolean;
}

@Injectable()
export class PolarService {
  private readonly logger = new Logger(PolarService.name);

  private readonly clientId     = process.env.POLAR_CLIENT_ID     || '';
  private readonly clientSecret = process.env.POLAR_CLIENT_SECRET || '';
  private readonly redirectUri  = process.env.POLAR_REDIRECT_URI  ||
    'http://localhost:3000/api/integrations/POLAR/callback';

  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────
  // OAuth Flow
  // ──────────────────────────────────────

  async getAuthUrl(userId: string) {
    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestException(
        'Integração com Polar ainda não configurada. Configure POLAR_CLIENT_ID e POLAR_CLIENT_SECRET.',
      );
    }

    const state = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.appConfig.upsert({
      where:  { key: `oauth_state:polar:${state}` },
      create: { key: `oauth_state:polar:${state}`, value: { userId, expiresAt } },
      update: { value: { userId, expiresAt } },
    });

    const params = new URLSearchParams({
      client_id:     this.clientId,
      response_type: 'code',
      redirect_uri:  this.redirectUri,
      scope:         'accesslink.read_all',
      state,
    });

    return {
      url: `${POLAR_AUTH_URL}?${params.toString()}`,
      provider: IntegrationProvider.POLAR,
    };
  }

  async handleCallback(code: string, state: string) {
    const stateRecord = await this.prisma.appConfig.findUnique({
      where: { key: `oauth_state:polar:${state}` },
    });
    if (!stateRecord) throw new BadRequestException('Estado OAuth inválido ou expirado');

    const { userId, expiresAt } = stateRecord.value as any;
    if (new Date() > new Date(expiresAt)) {
      await this.prisma.appConfig.delete({ where: { key: `oauth_state:polar:${state}` } });
      throw new BadRequestException('Estado OAuth expirado. Tente novamente.');
    }
    await this.prisma.appConfig.delete({ where: { key: `oauth_state:polar:${state}` } });

    const tokenData = await this.exchangeCodeForToken(code);
    const polarUserId = String(tokenData.x_user_id);

    // Register user with AccessLink API (idempotent — 409 means already registered, which is fine)
    await this.registerUser(tokenData.access_token, polarUserId);

    await this.prisma.fitnessIntegration.upsert({
      where: { userId_provider: { userId, provider: IntegrationProvider.POLAR } },
      create: {
        userId,
        provider:       IntegrationProvider.POLAR,
        accessToken:    tokenData.access_token,
        refreshToken:   null, // Polar access tokens don't expire (no refresh needed)
        expiresAt:      null,
        externalUserId: polarUserId,
        isActive:       true,
      },
      update: {
        accessToken:    tokenData.access_token,
        externalUserId: polarUserId,
        isActive:       true,
      },
    });

    return { success: true, provider: IntegrationProvider.POLAR };
  }

  // ──────────────────────────────────────
  // Sync Activities FROM Polar
  // ──────────────────────────────────────

  async syncActivities(userId: string, integration: FitnessIntegration) {
    this.logger.log(`Sincronizando atividades Polar para usuário ${userId}`);

    const polarUserId = integration.externalUserId;
    const accessToken = integration.accessToken;

    // 1. Create exercise transaction
    const txRes = await fetch(
      `${POLAR_API_BASE}/users/${polarUserId}/exercise-transactions`,
      {
        method:  'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept:        'application/json',
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    // 204 = no new data; 201 = transaction created
    if (txRes.status === 204) {
      this.logger.log('Polar: no new exercises since last sync');
      return { provider: 'POLAR', synced: 0 };
    }

    if (!txRes.ok) {
      this.logger.warn(`Polar transaction create failed: ${txRes.status}`);
      return { provider: 'POLAR', synced: 0 };
    }

    const tx: any = await txRes.json();
    const txId = tx['transaction-id'];

    // 2. List exercises in transaction
    const listRes = await fetch(
      `${POLAR_API_BASE}/users/${polarUserId}/exercise-transactions/${txId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept:        'application/json',
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    const listData: any = listRes.ok ? await listRes.json() : { exercises: [] };
    const exerciseUrls: string[] = listData.exercises || [];
    let synced = 0;

    // 3. Fetch and process each exercise
    for (const exUrl of exerciseUrls) {
      try {
        const exRes = await fetch(exUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept:        'application/json',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!exRes.ok) continue;
        const exercise: PolarExercise = await exRes.json() as any;

        if (!this.isRunningActivity(exercise.sport)) continue;

        const saved = await this.saveExercise(userId, exercise);
        if (saved) synced++;
      } catch (err: any) {
        this.logger.error(`Polar exercise fetch error: ${err.message}`);
      }
    }

    // 4. Commit transaction to mark data as consumed
    await fetch(
      `${POLAR_API_BASE}/users/${polarUserId}/exercise-transactions/${txId}`,
      {
        method:  'PUT',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal:  AbortSignal.timeout(10000),
      },
    ).catch(() => {/* non-fatal */});

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    });

    return { provider: 'POLAR', synced };
  }

  // ──────────────────────────────────────
  // Webhook Support (push-based sync)
  // ──────────────────────────────────────

  /**
   * Register a webhook with Polar AccessLink.
   * Polar will POST exercise events to webhookUrl.
   */
  async registerWebhook(webhookUrl: string) {
    if (!this.clientId || !this.clientSecret) {
      return { status: 'error', message: 'POLAR_CLIENT_ID/SECRET não configurados' };
    }

    // Use client credentials grant to get a management token
    const tokenRes = await fetch(POLAR_TOKEN_URL, {
      method:  'POST',
      signal:  AbortSignal.timeout(10000),
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        Authorization:   'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      return { status: 'error', message: `Falha ao obter token de gerenciamento: ${tokenRes.status}` };
    }

    const token: any = await tokenRes.json();

    const res = await fetch(`${POLAR_API_BASE}/webhooks`, {
      method:  'POST',
      signal:  AbortSignal.timeout(10000),
      headers: {
        Authorization:  `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify({
        events:     ['EXERCISE'],
        url:        webhookUrl,
        secret_token: process.env.POLAR_WEBHOOK_SECRET || randomBytes(16).toString('hex'),
      }),
    });

    if (res.status === 200 || res.status === 201) {
      const data: any = await res.json();
      this.logger.log(`Polar webhook registered: ${data.id}`);
      return { status: 'registered', webhookId: data.id };
    }

    if (res.status === 409) {
      return { status: 'already_registered' };
    }

    const errorText = await res.text();
    this.logger.error(`Polar webhook registration failed: ${res.status} ${errorText}`);
    return { status: 'error', message: `Falha ao registrar webhook: ${res.status}` };
  }

  /**
   * Handle an inbound Polar webhook exercise event.
   * event.entity_id = Polar exercise URL to fetch
   */
  async handleWebhookExercise(data: {
    userId:       string; // Polar user ID (x_user_id as string)
    entity_id:    string; // URL to fetch the exercise
    event_type:   string; // 'EXERCISE'
    timestamp:    string;
  }) {
    const integration = await this.prisma.fitnessIntegration.findFirst({
      where: {
        externalUserId: data.userId,
        provider:       IntegrationProvider.POLAR,
        isActive:       true,
      },
    });

    if (!integration) {
      this.logger.warn(`Polar webhook: no integration found for user ${data.userId}`);
      return;
    }

    try {
      const exRes = await fetch(data.entity_id, {
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          Accept:        'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!exRes.ok) return;
      const exercise: PolarExercise = await exRes.json() as any;

      if (this.isRunningActivity(exercise.sport)) {
        await this.saveExercise(integration.userId, exercise);
      }
    } catch (err: any) {
      this.logger.error(`Polar webhook exercise processing error: ${err.message}`);
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    });
  }

  // ──────────────────────────────────────
  // Private: Polar API HTTP Calls
  // ──────────────────────────────────────

  private async exchangeCodeForToken(code: string): Promise<PolarTokenResponse> {
    const body = new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });

    const res = await fetch(POLAR_TOKEN_URL, {
      method:  'POST',
      signal:  AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:  'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`Polar token exchange failed: ${res.status} ${errorText}`);
      throw new BadRequestException('Falha na autenticação com Polar Flow');
    }

    return res.json() as any;
  }

  /** Register user with AccessLink API — required once before any data access */
  private async registerUser(accessToken: string, polarUserId: string): Promise<void> {
    const res = await fetch(`${POLAR_API_BASE}/users`, {
      method:  'POST',
      signal:  AbortSignal.timeout(10000),
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify({ 'member-id': polarUserId }),
    });

    // 200 = already registered, 201 = newly registered, both fine
    if (res.status !== 200 && res.status !== 201 && res.status !== 409) {
      this.logger.warn(`Polar user registration returned ${res.status} — continuing anyway`);
    }
  }

  // ──────────────────────────────────────
  // Private: Workout Helpers
  // ──────────────────────────────────────

  private async saveExercise(userId: string, exercise: PolarExercise): Promise<boolean> {
    const externalId = `polar_${exercise.id}`;

    const existing = await this.prisma.workoutResult.findFirst({ where: { externalId } });
    if (existing) return false;

    const startTime     = new Date(exercise.start_time);
    const durationSec   = this.parseDuration(exercise.duration);
    const distanceM     = exercise.distance || 0;
    const matched       = await this.findMatchingWorkout(userId, startTime, distanceM);

    if (!matched) return false;

    const pace = this.calculatePace(distanceM, durationSec);

    await this.prisma.workoutResult.upsert({
      where:  { workoutId: matched.id },
      create: {
        workoutId:      matched.id,
        source:         WorkoutSource.POLAR,
        externalId,
        distanceMeters: Math.round(distanceM),
        durationSeconds: durationSec,
        avgPace:        pace,
        avgHeartRate:   exercise.heart_rate?.average || null,
        maxHeartRate:   exercise.heart_rate?.maximum || null,
        calories:       exercise.calories || null,
      },
      update: {
        source:          WorkoutSource.POLAR,
        externalId,
        distanceMeters:  Math.round(distanceM),
        durationSeconds: durationSec,
        avgPace:         pace,
        avgHeartRate:    exercise.heart_rate?.average || null,
        maxHeartRate:    exercise.heart_rate?.maximum || null,
        calories:        exercise.calories || null,
      },
    });

    await this.prisma.workout.update({
      where: { id: matched.id },
      data:  { status: WorkoutStatus.COMPLETED, completedAt: startTime },
    });

    return true;
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

  /** Parse ISO8601 duration (PT1H32M12S) → total seconds */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const h = parseInt(match[1] || '0', 10);
    const m = parseInt(match[2] || '0', 10);
    const s = parseInt(match[3] || '0', 10);
    return h * 3600 + m * 60 + s;
  }

  private calculatePace(distanceMeters: number, durationSeconds: number): string {
    if (distanceMeters <= 0) return '0:00';
    const paceSeconds = (durationSeconds / distanceMeters) * 1000;
    const minutes     = Math.floor(paceSeconds / 60);
    const seconds     = Math.round(paceSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private isRunningActivity(sport: string): boolean {
    const sport_upper = (sport || '').toUpperCase();
    return sport_upper === 'RUNNING' ||
           sport_upper === 'TRAIL_RUNNING' ||
           sport_upper === 'TREADMILL_RUNNING';
  }
}
