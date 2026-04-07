import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { encrypt, decrypt } from '../../../common/utils/encryption';
import {
  FitnessIntegration, IntegrationProvider, Workout,
  WorkoutSource, WorkoutStatus,
} from '@prisma/client';
import { convertWorkoutToGarmin, GarminWorkoutPayload } from './garmin-workout.converter';

const GARMIN_TOKEN_URL = 'https://connect.garmin.com/oauth-service/oauth/token';
const GARMIN_API_BASE = 'https://apis.garmin.com';
const GARMIN_TRAINING_API = `${GARMIN_API_BASE}/training-api/workout`;
const GARMIN_SCHEDULE_API = `${GARMIN_API_BASE}/training-api/schedule`;
const GARMIN_ACTIVITIES_API = `${GARMIN_API_BASE}/wellness-api/rest/activities`;

interface GarminTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GarminActivity {
  activityId: string;
  startTimeInSeconds: number;
  startTimeOffsetInSeconds: number;
  durationInSeconds: number;
  distanceInMeters: number;
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  activeKilocalories?: number;
  elevationGainInMeters?: number;
  activityType: string;
}

@Injectable()
export class GarminService {
  private readonly logger = new Logger(GarminService.name);

  private readonly clientId = process.env.GARMIN_CLIENT_ID || '';
  private readonly clientSecret = process.env.GARMIN_CLIENT_SECRET || '';
  private readonly redirectUri =
    process.env.GARMIN_REDIRECT_URI || 'http://localhost:3000/api/integrations/GARMIN/callback';

  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────
  // OAuth Flow
  // ──────────────────────────────────────

  async getAuthUrl(userId: string) {
    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestException(
        'Integração com Garmin ainda não configurada. O administrador precisa configurar as credenciais do Garmin (GARMIN_CLIENT_ID e GARMIN_CLIENT_SECRET).',
      );
    }

    // Use a random nonce as state (CSRF protection — store userId lookup in DB)
    const state = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min TTL

    await this.prisma.appConfig.upsert({
      where: { key: `oauth_state:garmin:${state}` },
      create: { key: `oauth_state:garmin:${state}`, value: { userId, expiresAt } },
      update: { value: { userId, expiresAt } },
    });

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: 'activity_read training_api',
      state,
    });

    return {
      url: `https://connect.garmin.com/oauthConfirm?${params.toString()}`,
      provider: IntegrationProvider.GARMIN,
    };
  }

  async handleCallback(code: string, state: string) {
    // Verify and consume the state nonce
    const stateRecord = await this.prisma.appConfig.findUnique({
      where: { key: `oauth_state:garmin:${state}` },
    });
    if (!stateRecord) throw new BadRequestException('Estado OAuth inválido ou expirado');

    const { userId, expiresAt } = stateRecord.value as any;
    if (new Date() > new Date(expiresAt)) {
      await this.prisma.appConfig.delete({ where: { key: `oauth_state:garmin:${state}` } });
      throw new BadRequestException('Estado OAuth expirado. Tente novamente.');
    }
    await this.prisma.appConfig.delete({ where: { key: `oauth_state:garmin:${state}` } });

    const tokenData = await this.exchangeCodeForToken(code);

    // Fetch the Garmin user ID from the Health API — this is what webhooks send as userId
    let garminUserId = tokenData.access_token; // fallback: use token as identifier
    try {
      const userRes = await fetch(`${GARMIN_API_BASE}/wellness-api/rest/user/id`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (userRes.ok) {
        const userData = await userRes.json() as any;
        garminUserId = userData.userId || userData.id || tokenData.access_token;
      }
    } catch {
      this.logger.warn('Could not fetch Garmin user ID — falling back to access token as identifier');
    }

    await this.prisma.fitnessIntegration.upsert({
      where: {
        userId_provider: { userId, provider: IntegrationProvider.GARMIN },
      },
      create: {
        userId,
        provider: IntegrationProvider.GARMIN,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        externalUserId: garminUserId,
        isActive: true,
      },
      update: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        externalUserId: garminUserId,
        isActive: true,
      },
    });

    return { success: true, provider: IntegrationProvider.GARMIN };
  }

  // ──────────────────────────────────────
  // Push Workouts TO Garmin
  // ──────────────────────────────────────

  /** Push a single workout to the athlete's Garmin Connect account */
  async pushWorkoutToGarmin(workoutId: string) {
    const workout = await this.prisma.workout.findUnique({
      where: { id: workoutId },
      include: { athlete: true },
    });

    if (!workout) {
      throw new BadRequestException('Treino não encontrado');
    }

    const integration = await this.getActiveIntegration(workout.athleteId);
    const accessToken = await this.ensureValidToken(integration);

    // Convert our workout model → Garmin JSON format
    const garminPayload = convertWorkoutToGarmin(workout);

    // 1. Create workout on Garmin Connect
    const garminWorkout = await this.createGarminWorkout(accessToken, garminPayload);

    // 2. Schedule it on the athlete's Garmin calendar
    const scheduleResult = await this.scheduleGarminWorkout(
      accessToken,
      garminWorkout.workoutId,
      workout.scheduledDate,
    );

    // 3. Save Garmin IDs to our DB
    await this.prisma.workout.update({
      where: { id: workoutId },
      data: {
        garminWorkoutId: String(garminWorkout.workoutId),
        garminScheduleId: scheduleResult?.scheduleId ? String(scheduleResult.scheduleId) : null,
      },
    });

    this.logger.log(
      `Treino "${workout.title}" enviado para Garmin do atleta ${workout.athleteId} ` +
      `(garminWorkoutId: ${garminWorkout.workoutId})`,
    );

    return {
      success: true,
      garminWorkoutId: garminWorkout.workoutId,
      workoutName: workout.title,
      scheduledDate: workout.scheduledDate,
    };
  }

  /** Push all workouts in a training plan to Garmin */
  async pushPlanToGarmin(planId: string) {
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id: planId },
      include: {
        workouts: {
          where: {
            status: WorkoutStatus.SCHEDULED,
            garminWorkoutId: null, // only push workouts not already on Garmin
          },
          orderBy: { scheduledDate: 'asc' },
        },
      },
    });

    if (!plan || plan.workouts.length === 0) {
      throw new BadRequestException('Plano não encontrado ou sem treinos pendentes');
    }

    const results = [];
    let pushed = 0;
    let failed = 0;

    for (const workout of plan.workouts) {
      try {
        const result = await this.pushWorkoutToGarmin(workout.id);
        results.push({ workoutId: workout.id, ...result });
        pushed++;
      } catch (error: any) {
        this.logger.error(`Falha ao enviar treino ${workout.id}: ${error?.message}`);
        results.push({ workoutId: workout.id, success: false, error: error?.message });
        failed++;
      }
    }

    return {
      planId,
      planName: plan.name,
      total: plan.workouts.length,
      pushed,
      failed,
      results,
    };
  }

  // ──────────────────────────────────────
  // Sync Activities FROM Garmin
  // ──────────────────────────────────────

  async syncActivities(userId: string, integration: FitnessIntegration) {
    this.logger.log(`Sincronizando atividades Garmin para usuário ${userId}`);

    const accessToken = await this.ensureValidToken(integration);
    const activities = await this.fetchRecentActivities(accessToken);
    let synced = 0;

    for (const activity of activities) {
      const externalId = `garmin_${activity.activityId}`;

      const existingResult = await this.prisma.workoutResult.findFirst({
        where: { externalId },
      });
      if (existingResult) continue;

      const startTime = new Date(activity.startTimeInSeconds * 1000);

      const matchedWorkout = await this.findMatchingWorkout(
        userId,
        startTime,
        activity.distanceInMeters,
      );

      if (matchedWorkout) {
        const pace = this.calculatePace(activity.distanceInMeters, activity.durationInSeconds);

        await this.prisma.workoutResult.upsert({
          where: { workoutId: matchedWorkout.id },
          create: {
            workoutId: matchedWorkout.id,
            source: WorkoutSource.GARMIN,
            externalId,
            distanceMeters: Math.round(activity.distanceInMeters),
            durationSeconds: Math.round(activity.durationInSeconds),
            avgPace: pace,
            avgHeartRate: activity.averageHeartRateInBeatsPerMinute || null,
            maxHeartRate: activity.maxHeartRateInBeatsPerMinute || null,
            calories: activity.activeKilocalories || null,
            elevationGain: activity.elevationGainInMeters || null,
          },
          update: {
            source: WorkoutSource.GARMIN,
            externalId,
            distanceMeters: Math.round(activity.distanceInMeters),
            durationSeconds: Math.round(activity.durationInSeconds),
            avgPace: pace,
            avgHeartRate: activity.averageHeartRateInBeatsPerMinute || null,
            maxHeartRate: activity.maxHeartRateInBeatsPerMinute || null,
            calories: activity.activeKilocalories || null,
            elevationGain: activity.elevationGainInMeters || null,
          },
        });

        await this.prisma.workout.update({
          where: { id: matchedWorkout.id },
          data: {
            status: WorkoutStatus.COMPLETED,
            completedAt: startTime,
          },
        });

        synced++;
      }
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    return { provider: 'GARMIN', synced };
  }

  /**
   * Process a webhook-pushed activity from Garmin
   */
  async processWebhookActivity(userId: string, data: {
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
    const externalId = `garmin_${data.activityId}`;
    const existing = await this.prisma.workoutResult.findFirst({ where: { externalId } });
    if (existing) return;

    const startTime = new Date(data.startTime * 1000);
    const matchedWorkout = await this.findMatchingWorkout(userId, startTime, data.distance);

    if (matchedWorkout) {
      const pace = this.calculatePace(data.distance, data.duration);
      await this.prisma.workoutResult.upsert({
        where: { workoutId: matchedWorkout.id },
        create: {
          workoutId: matchedWorkout.id,
          source: WorkoutSource.GARMIN,
          externalId,
          distanceMeters: Math.round(data.distance),
          durationSeconds: Math.round(data.duration),
          avgPace: pace,
          avgHeartRate: data.averageHeartRate || null,
          maxHeartRate: data.maxHeartRate || null,
          calories: data.calories || null,
        },
        update: {
          source: WorkoutSource.GARMIN,
          externalId,
          distanceMeters: Math.round(data.distance),
          durationSeconds: Math.round(data.duration),
          avgPace: pace,
          avgHeartRate: data.averageHeartRate || null,
          maxHeartRate: data.maxHeartRate || null,
          calories: data.calories || null,
        },
      });

      await this.prisma.workout.update({
        where: { id: matchedWorkout.id },
        data: { status: WorkoutStatus.COMPLETED, completedAt: startTime },
      });

      this.logger.log(`Webhook: synced Garmin activity ${data.activityId} → workout ${matchedWorkout.id}`);
    }
  }

  // ──────────────────────────────────────
  // Private: Garmin API HTTP Calls
  // ──────────────────────────────────────

  /** Exchange OAuth code for access + refresh tokens */
  private async exchangeCodeForToken(code: string): Promise<GarminTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
    });

    const res = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`Garmin token exchange failed: ${res.status} ${errorText}`);
      throw new BadRequestException('Falha na autenticação com Garmin');
    }

    return res.json() as any;
  }

  /** Refresh an expired access token */
  private async refreshAccessToken(refreshToken: string): Promise<GarminTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new BadRequestException('Falha ao renovar token Garmin. Reconecte sua conta.');
    }

    return res.json() as any;
  }

  /** Create a workout on Garmin Connect via Training API */
  private async createGarminWorkout(
    accessToken: string,
    payload: GarminWorkoutPayload,
  ): Promise<{ workoutId: string }> {
    const res = await fetch(GARMIN_TRAINING_API, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`Garmin create workout failed: ${res.status} ${errorText}`);
      throw new BadRequestException(`Falha ao criar treino no Garmin: ${res.status}`);
    }

    return res.json() as any;
  }

  /** Schedule a workout on a specific date in Garmin Connect calendar */
  private async scheduleGarminWorkout(
    accessToken: string,
    garminWorkoutId: string,
    date: Date,
  ): Promise<{ scheduleId?: string }> {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    const res = await fetch(GARMIN_SCHEDULE_API, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workoutId: garminWorkoutId,
        date: dateStr,
      }),
    });

    if (!res.ok) {
      this.logger.warn(`Garmin schedule workout failed: ${res.status} (non-fatal)`);
      return {};
    }

    return res.json() as any;
  }

  /** Fetch recent activities from Garmin Wellness API */
  private async fetchRecentActivities(accessToken: string): Promise<GarminActivity[]> {
    // Fetch last 7 days of activities
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;

    const url = `${GARMIN_ACTIVITIES_API}?uploadStartTimeInSeconds=${sevenDaysAgo}&uploadEndTimeInSeconds=${now}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      this.logger.warn(`Garmin fetch activities failed: ${res.status}`);
      return [];
    }

    const data: GarminActivity[] = (await res.json()) as any;
    return (data || []).filter(
      (a) =>
        a.activityType === 'RUNNING' ||
        a.activityType === 'TRAIL_RUNNING' ||
        a.activityType === 'TREADMILL_RUNNING',
    );
  }

  // ──────────────────────────────────────
  // Private: Token & Integration Helpers
  // ──────────────────────────────────────

  /** Get active Garmin integration for user, throw if not connected */
  private async getActiveIntegration(userId: string): Promise<FitnessIntegration> {
    const integration = await this.prisma.fitnessIntegration.findFirst({
      where: { userId, provider: IntegrationProvider.GARMIN, isActive: true },
    });

    if (!integration) {
      throw new BadRequestException(
        'Atleta não tem Garmin Connect conectado. Peça ao atleta para conectar em Perfil > Integrações.',
      );
    }

    return integration;
  }

  /** Ensure we have a valid (non-expired) access token, refreshing if needed */
  private async ensureValidToken(integration: FitnessIntegration): Promise<string> {
    if (integration.expiresAt && integration.expiresAt > new Date()) {
      return decrypt(integration.accessToken);
    }

    if (!integration.refreshToken) {
      throw new BadRequestException('Token Garmin expirado. Reconecte sua conta.');
    }

    this.logger.log(`Renovando token Garmin para integração ${integration.id}`);
    const newTokens = await this.refreshAccessToken(decrypt(integration.refreshToken));

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken: encrypt(newTokens.access_token),
        refreshToken: encrypt(newTokens.refresh_token),
        expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
      },
    });

    return newTokens.access_token;
  }

  // ──────────────────────────────────────
  // Private: Workout Matching
  // ──────────────────────────────────────

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

  /**
   * GET /integrations/garmin/health/today/:athleteId
   * Returns today's Garmin health snapshot with semáforo calculation
   */
  async getHealthToday(coachId: string, athleteId: string) {
    // Verify the requesting coach has access to this athlete
    const athlete = await this.prisma.user.findFirst({
      where: {
        id: athleteId,
        athleteProfile: { coachId },
      },
    });
    if (!athlete) {
      throw new BadRequestException('Atleta não encontrado ou acesso negado');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await this.prisma.garminHealthSnapshot.findFirst({
      where: {
        athleteId,
        date: { gte: today },
      },
    });

    // Compute 7-day HRV average for semáforo
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSnapshots = await this.prisma.garminHealthSnapshot.findMany({
      where: { athleteId, date: { gte: sevenDaysAgo }, hrv: { not: null } },
      orderBy: { date: 'desc' },
    });

    const avgHrv = recentSnapshots.length
      ? recentSnapshots.reduce((s, r) => s + (r.hrv || 0), 0) / recentSnapshots.length
      : null;

    let semaforo: 'green' | 'yellow' | 'red' = 'green';
    let semaforo_label = 'Pronto para treinar';

    if (snapshot) {
      const badHrv = snapshot.hrv && avgHrv && snapshot.hrv < avgHrv * 0.7;
      const badSleep = snapshot.sleepHours !== null && snapshot.sleepHours !== undefined && snapshot.sleepHours < 5;
      const highStress = snapshot.stressScore !== null && snapshot.stressScore !== undefined && snapshot.stressScore > 75;

      if (badHrv || badSleep) {
        semaforo = 'red';
        semaforo_label = badSleep ? 'Sono insuficiente — descanse' : 'HRV baixo — recuperação recomendada';
      } else if (highStress || (snapshot.hrv && avgHrv && snapshot.hrv < avgHrv * 0.85)) {
        semaforo = 'yellow';
        semaforo_label = 'Estresse elevado — treino moderado';
      }
    }

    return {
      snapshot,
      avgHrv: avgHrv ? Math.round(avgHrv) : null,
      semaforo,
      semaforo_label,
      hasData: !!snapshot,
    };
  }

  /**
   * GET /integrations/garmin/health/history/:athleteId
   * Returns last 30 days of Garmin health snapshots for a coach's athlete
   */
  async getHealthHistory(coachId: string, athleteId: string, days = 30) {
    const athlete = await this.prisma.user.findFirst({
      where: { id: athleteId, athleteProfile: { coachId } },
    });
    if (!athlete) throw new BadRequestException('Atleta não encontrado ou acesso negado');

    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.garminHealthSnapshot.findMany({
      where: { athleteId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * GET /integrations/garmin/health/me
   * Returns the authenticated athlete's own health today snapshot
   */
  async getMyHealthToday(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await this.prisma.garminHealthSnapshot.findFirst({
      where: { athleteId: userId, date: { gte: today } },
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recent = await this.prisma.garminHealthSnapshot.findMany({
      where: { athleteId: userId, date: { gte: sevenDaysAgo }, hrv: { not: null } },
    });

    const avgHrv = recent.length
      ? recent.reduce((s, r) => s + (r.hrv || 0), 0) / recent.length
      : null;

    let semaforo: 'green' | 'yellow' | 'red' = 'green';
    let semaforo_label = 'Pronto para treinar';

    if (snapshot) {
      const badHrv = snapshot.hrv && avgHrv && snapshot.hrv < avgHrv * 0.7;
      const badSleep = snapshot.sleepHours !== null && snapshot.sleepHours !== undefined && snapshot.sleepHours < 5;
      const highStress = snapshot.stressScore !== null && snapshot.stressScore !== undefined && snapshot.stressScore > 75;

      if (badHrv || badSleep) {
        semaforo = 'red';
        semaforo_label = badSleep ? 'Sono insuficiente — descanse' : 'HRV baixo — recuperação recomendada';
      } else if (highStress || (snapshot.hrv && avgHrv && snapshot.hrv < avgHrv * 0.85)) {
        semaforo = 'yellow';
        semaforo_label = 'Estresse elevado — treino moderado';
      }
    }

    return { snapshot, avgHrv: avgHrv ? Math.round(avgHrv) : null, semaforo, semaforo_label, hasData: !!snapshot };
  }
}
