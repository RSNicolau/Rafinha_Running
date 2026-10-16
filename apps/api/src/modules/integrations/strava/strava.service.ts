import { Injectable, Logger, BadRequestException, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FitnessIntegration, IntegrationProvider, WorkoutSource, WorkoutStatus } from '@prisma/client';
import { encrypt, decrypt } from '../../../common/utils/encryption';
import { consumeOAuthState, createOAuthState, OAuthClient } from '../oauth-state';
import { isStravaConfigured, publicApiBaseUrl } from '../integration-env';

export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
export const STRAVA_DEAUTH_URL = 'https://www.strava.com/oauth/deauthorize';
export const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

/** Escopos mínimos: `read` (perfil) + `activity:read_all` (inclui atividades privadas / "only me"). */
export const STRAVA_SCOPES = 'read,activity:read_all';

/** Renova o token quando faltar menos que isso para expirar (tokens Strava duram 6h). */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const BACKFILL_DAYS = 14;
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const MAX_PENDING_RETRIES = 500;

export class StravaRateLimitError extends Error {
  constructor(public readonly retryAt: Date) {
    super(`Strava rate limit — tente novamente após ${retryAt.toISOString()}`);
    this.name = 'StravaRateLimitError';
  }
}

/** Erro de autorização definitivo (token revogado / app desautorizado). */
export class StravaAuthError extends Error {
  constructor(public readonly status: number) {
    super(`Strava recusou a autorização (${status})`);
    this.name = 'StravaAuthError';
  }
}

export interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  subscription_id: number;
  event_time?: number;
  updates?: Record<string, unknown>;
}

/** Valida o formato do evento de webhook. Retorna null se inválido (nunca confia no resto do conteúdo). */
export function parseStravaWebhookEvent(body: any): StravaWebhookEvent | null {
  if (!body || typeof body !== 'object') return null;
  const isId = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0)
    || (typeof v === 'string' && /^\d{1,19}$/.test(v));
  if (body.object_type !== 'activity' && body.object_type !== 'athlete') return null;
  if (!['create', 'update', 'delete'].includes(body.aspect_type)) return null;
  if (!isId(body.object_id) || !isId(body.owner_id) || !isId(body.subscription_id)) return null;
  return {
    object_type: body.object_type,
    object_id: Number(body.object_id),
    aspect_type: body.aspect_type,
    owner_id: Number(body.owner_id),
    subscription_id: Number(body.subscription_id),
    event_time: typeof body.event_time === 'number' ? body.event_time : undefined,
    updates: body.updates && typeof body.updates === 'object' ? body.updates : undefined,
  };
}

interface CandidateWorkout {
  id: string;
  scheduledDate: Date;
  targetDistanceMeters: number | null;
  targetDurationSeconds: number | null;
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Escolhe o treino planejado correspondente a uma atividade:
 *  - mesmo dia no calendário LOCAL do atleta (start_date_local da Strava), tolerando treinos gravados em
 *    UTC-meia-noite ou com horário;
 *  - distância dentro de ±10% do alvo (ou duração ±10% quando o treino só tem alvo de tempo);
 *  - treino sem alvo algum aceita qualquer corrida do dia;
 *  - entre vários, o de menor desvio relativo.
 */
export function pickMatchingWorkout(
  candidates: CandidateWorkout[],
  activity: { localDate: string; utcOffsetSeconds: number; distanceMeters: number; movingTimeSeconds: number },
  tolerance = 0.1,
): CandidateWorkout | null {
  let best: { w: CandidateWorkout; score: number } | null = null;
  for (const w of candidates) {
    const sched = new Date(w.scheduledDate);
    const utcKey = dateKey(sched);
    const localKey = dateKey(new Date(sched.getTime() + activity.utcOffsetSeconds * 1000));
    if (utcKey !== activity.localDate && localKey !== activity.localDate) continue;

    let score: number;
    if (w.targetDistanceMeters && w.targetDistanceMeters > 0) {
      if (activity.distanceMeters <= 0) continue;
      score = Math.abs(activity.distanceMeters - w.targetDistanceMeters) / w.targetDistanceMeters;
    } else if (w.targetDurationSeconds && w.targetDurationSeconds > 0) {
      score = Math.abs(activity.movingTimeSeconds - w.targetDurationSeconds) / w.targetDurationSeconds;
    } else {
      score = 0.5; // sem alvo: aceita, mas perde para um treino com alvo compatível
      if (!best || score < best.score) best = { w, score };
      continue;
    }
    if (score > tolerance) continue;
    if (!best || score < best.score) best = { w, score };
  }
  return best?.w ?? null;
}

export function calculatePace(distanceMeters: number, durationSeconds: number): string {
  if (!distanceMeters || distanceMeters <= 0 || !durationSeconds) return '0:00';
  const paceSeconds = Math.round((durationSeconds / distanceMeters) * 1000);
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = paceSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const roundOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

/** Mapeia uma atividade Strava (summary ou detailed) para os campos de WorkoutResult. */
export function mapStravaActivityToResult(a: any) {
  const distance = Number(a.distance) || 0;
  const moving = Math.round(Number(a.moving_time) || Number(a.elapsed_time) || 0);
  const polyline: string | undefined = a.map?.polyline || a.map?.summary_polyline || undefined;
  const splits = Array.isArray(a.splits_metric)
    ? a.splits_metric.map((s: any) => ({
        split: s.split,
        distanceMeters: Math.round(Number(s.distance) || 0),
        movingTimeSeconds: Math.round(Number(s.moving_time) || 0),
        elevationDifference: typeof s.elevation_difference === 'number' ? s.elevation_difference : null,
        avgHeartRate: roundOrNull(s.average_heartrate),
        pace: calculatePace(Number(s.distance) || 0, Number(s.moving_time) || 0),
      }))
    : undefined;

  return {
    source: WorkoutSource.STRAVA,
    externalId: `strava_${a.id}`,
    distanceMeters: Math.round(distance),
    durationSeconds: moving,
    avgPace: calculatePace(distance, moving),
    avgHeartRate: roundOrNull(a.average_heartrate),
    maxHeartRate: roundOrNull(a.max_heartrate),
    calories: roundOrNull(a.calories),
    elevationGain: typeof a.total_elevation_gain === 'number' ? a.total_elevation_gain : null,
    ...(polyline ? { gpsRoute: { format: 'google-encoded-polyline', polyline } } : {}),
    ...(splits ? { splits } : {}),
  };
}

export function isRunActivity(a: any): boolean {
  return RUN_TYPES.has(a?.sport_type) || RUN_TYPES.has(a?.type);
}

@Injectable()
export class StravaService implements OnModuleDestroy {
  private readonly logger = new Logger(StravaService.name);

  /** Rate limit global do app na Strava (15 min / diário). Enquanto ativo, nenhuma chamada sai. */
  private rateLimitedUntil = 0;
  /** Atividades em processamento neste processo — evita corrida entre eventos duplicados simultâneos. */
  private readonly inFlight = new Set<string>();
  /** Eventos adiados por rate limit (memória; a próxima sync manual/backfill cobre perdas em restart). */
  private readonly pending = new Map<string, StravaWebhookEvent>();
  private pendingTimer: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleDestroy() {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
  }

  private get clientId() { return process.env.STRAVA_CLIENT_ID || ''; }
  private get clientSecret() { return process.env.STRAVA_CLIENT_SECRET || ''; }
  get redirectUri() {
    return process.env.STRAVA_REDIRECT_URI || `${publicApiBaseUrl()}/webhooks/oauth/STRAVA/callback`;
  }

  // ══════════════════════════ OAuth ══════════════════════════

  async getAuthUrl(userId: string, client: OAuthClient = 'web') {
    if (!isStravaConfigured()) {
      throw new BadRequestException(
        'Integração com Strava ainda não configurada. O administrador precisa configurar STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET.',
      );
    }

    const state = await createOAuthState(this.prisma, IntegrationProvider.STRAVA, userId, client);
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: STRAVA_SCOPES,
      state,
      approval_prompt: 'auto',
    });

    return {
      url: `https://www.strava.com/oauth/authorize?${params.toString()}`,
      provider: IntegrationProvider.STRAVA,
      state,
    };
  }

  /**
   * Conclui o OAuth: consome o state (uso único), troca o code, grava tokens CRIPTOGRAFADOS e dispara o
   * backfill das atividades recentes.
   * @param expectedUserId quando informado (fluxo mobile autenticado), o state precisa pertencer a esse usuário.
   * @param grantedScope parâmetro `scope` devolvido pela Strava no redirect (escopos aceitos pelo atleta).
   */
  async handleCallback(code: string, state: string, opts: { expectedUserId?: string; grantedScope?: string } = {}) {
    const { userId } = await consumeOAuthState(this.prisma, IntegrationProvider.STRAVA, state, opts.expectedUserId);

    if (opts.grantedScope !== undefined && !/(^|,)activity:read(_all)?(,|$)/.test(opts.grantedScope)) {
      throw new BadRequestException(
        'Permissão de leitura de atividades não concedida. Conecte novamente e mantenha "Ver dados das suas atividades" marcado.',
      );
    }
    if (!code || typeof code !== 'string' || code.length > 512) {
      throw new BadRequestException('Código de autorização inválido');
    }

    const tokenData = await this.exchangeCodeForToken(code);
    const athleteId = tokenData?.athlete?.id ? String(tokenData.athlete.id) : '';
    if (!tokenData?.access_token || !tokenData?.refresh_token || !athleteId) {
      throw new BadRequestException('Resposta inválida da Strava');
    }
    if (typeof tokenData.scope === 'string' && !/activity:read/.test(tokenData.scope)) {
      throw new BadRequestException('Permissão de leitura de atividades não concedida.');
    }

    // Uma conta Strava só alimenta UM usuário (webhooks chegam por owner_id).
    await this.prisma.fitnessIntegration.updateMany({
      where: { provider: IntegrationProvider.STRAVA, externalUserId: athleteId, NOT: { userId } },
      data: { isActive: false },
    });

    const tokenFields = {
      accessToken: encrypt(tokenData.access_token),
      refreshToken: encrypt(tokenData.refresh_token),
      expiresAt: new Date(Number(tokenData.expires_at) * 1000),
      externalUserId: athleteId,
      isActive: true,
    };
    const integration = await this.prisma.fitnessIntegration.upsert({
      where: { userId_provider: { userId, provider: IntegrationProvider.STRAVA } },
      create: { userId, provider: IntegrationProvider.STRAVA, ...tokenFields },
      update: tokenFields,
    });

    // Backfill assíncrono — não atrasa o redirect do usuário.
    if (integration?.id) {
      void this.syncActivities(userId, integration as FitnessIntegration).catch((err) =>
        this.logger.warn(`Backfill Strava falhou para ${userId}: ${err?.message}`),
      );
    }

    return { success: true, provider: IntegrationProvider.STRAVA, userId };
  }

  /** Revoga o acesso na Strava (best-effort) — chamado ao desconectar. */
  async deauthorize(integration: FitnessIntegration): Promise<void> {
    try {
      const token = await this.ensureValidToken(integration);
      await fetch(STRAVA_DEAUTH_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err: any) {
      this.logger.warn(`Deauthorize Strava falhou (ignorado): ${err?.message}`);
    }
  }

  // ══════════════════════════ Sync ══════════════════════════

  /** Puxa as corridas recentes (backfill na conexão e sync manual). Idempotente. */
  async syncActivities(userId: string, integration: FitnessIntegration) {
    this.logger.log(`Sincronizando atividades Strava para usuário ${userId}`);

    const after = Math.floor((Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000) / 1000);
    let res: Response;
    try {
      const accessToken = await this.ensureValidToken(integration);
      res = await this.stravaFetch(`${STRAVA_API_BASE}/athlete/activities?after=${after}&per_page=50`, accessToken);
    } catch (err) {
      if (err instanceof StravaRateLimitError) {
        return { provider: 'STRAVA', synced: 0, duplicates: 0, unmatched: 0, error: 'rate_limited', retryAt: err.retryAt };
      }
      if (err instanceof StravaAuthError) {
        await this.markInactive(integration.id, `refresh recusado (${err.status})`);
        throw new BadRequestException('Acesso à Strava revogado. Reconecte sua conta.');
      }
      throw err;
    }
    if (res.status === 401) {
      await this.markInactive(integration.id, 'token recusado na listagem');
      throw new BadRequestException('Acesso à Strava revogado. Reconecte sua conta.');
    }
    if (!res.ok) {
      this.logger.warn(`Strava list activities falhou: ${res.status}`);
      return { provider: 'STRAVA', synced: 0, duplicates: 0, unmatched: 0, error: `strava_${res.status}` };
    }
    const activities = ((await res.json()) as any[]) || [];

    let synced = 0;
    let duplicates = 0;
    let unmatched = 0;
    for (const activity of Array.isArray(activities) ? activities : []) {
      if (!isRunActivity(activity)) continue;
      const outcome = await this.upsertActivity(userId, activity, 'create');
      if (outcome === 'created') synced++;
      else if (outcome === 'duplicate' || outcome === 'updated') duplicates++;
      else if (outcome === 'unmatched') unmatched++;
    }

    await this.prisma.fitnessIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    return { provider: 'STRAVA', synced, duplicates, unmatched };
  }

  // ══════════════════════════ Webhook ══════════════════════════

  /**
   * Processa um evento de webhook JÁ validado quanto ao formato/subscription.
   * Nunca confia no conteúdo: a atividade é sempre buscada na API com o token do atleta,
   * e a desautorização só é aplicada se a Strava de fato recusar o token.
   */
  async handleWebhookEvent(event: StravaWebhookEvent): Promise<string> {
    const integration = await this.prisma.fitnessIntegration.findFirst({
      where: { provider: IntegrationProvider.STRAVA, externalUserId: String(event.owner_id), isActive: true },
    });
    if (!integration) return 'no_integration';

    try {
      if (event.object_type === 'athlete') {
        if (event.aspect_type === 'update' && String(event.updates?.authorized) === 'false') {
          return await this.verifyDeauthorization(integration);
        }
        return 'ignored';
      }

      const token = await this.ensureValidToken(integration);
      const res = await this.stravaFetch(`${STRAVA_API_BASE}/activities/${event.object_id}`, token);

      if (event.aspect_type === 'delete') {
        if (res.status === 404) {
          // Confirmado pela própria Strava: atividade não existe mais → desvincula o resultado.
          await this.prisma.workoutResult.updateMany({
            where: { externalId: `strava_${event.object_id}`, source: WorkoutSource.STRAVA },
            data: { externalId: null },
          });
          return 'deleted';
        }
        return 'ignored';
      }

      if (res.status === 401) {
        await this.markInactive(integration.id, 'token recusado ao buscar atividade');
        return 'deauthorized';
      }
      if (res.status === 404) return 'not_found';
      if (!res.ok) {
        this.logger.warn(`Strava GET activity ${event.object_id} falhou: ${res.status}`);
        return 'fetch_failed';
      }

      const activity = (await res.json()) as any;
      if (String(activity?.athlete?.id) !== String(event.owner_id)) {
        this.logger.warn(`Atividade ${event.object_id} não pertence ao owner ${event.owner_id} — ignorada`);
        return 'owner_mismatch';
      }
      if (!isRunActivity(activity)) return 'not_run';

      const outcome = await this.upsertActivity(integration.userId, activity, event.aspect_type);
      await this.prisma.fitnessIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      });
      return outcome;
    } catch (err) {
      if (err instanceof StravaRateLimitError) {
        this.deferEvent(event, err.retryAt);
        return 'deferred';
      }
      if (err instanceof StravaAuthError) {
        await this.markInactive(integration.id, `refresh recusado (${err.status})`);
        return 'deauthorized';
      }
      throw err;
    }
  }

  /** Só desativa se a Strava realmente recusar as credenciais do atleta. */
  private async verifyDeauthorization(integration: FitnessIntegration): Promise<string> {
    try {
      const token = await this.ensureValidToken(integration);
      const res = await this.stravaFetch(`${STRAVA_API_BASE}/athlete`, token);
      if (res.status === 401 || res.status === 403) {
        await this.markInactive(integration.id, 'deauthorization confirmada');
        return 'deauthorized';
      }
      return res.ok ? 'deauth_rejected' : 'deauth_unverified';
    } catch (err) {
      if (err instanceof StravaAuthError) {
        await this.markInactive(integration.id, 'deauthorization confirmada (refresh recusado)');
        return 'deauthorized';
      }
      if (err instanceof StravaRateLimitError) return 'deauth_unverified';
      throw err;
    }
  }

  private async markInactive(integrationId: string, why: string) {
    this.logger.log(`Integração Strava ${integrationId} desativada: ${why}`);
    await this.prisma.fitnessIntegration.update({
      where: { id: integrationId },
      data: { isActive: false },
    });
  }

  private deferEvent(event: StravaWebhookEvent, retryAt: Date) {
    const key = `${event.object_type}:${event.object_id}:${event.aspect_type}`;
    if (this.pending.size >= MAX_PENDING_RETRIES && !this.pending.has(key)) {
      this.logger.warn(`Fila de retry Strava cheia — evento ${key} descartado (sync manual recupera)`);
      return;
    }
    this.pending.set(key, event);
    if (this.pendingTimer) return;
    const delay = Math.max(1000, retryAt.getTime() - Date.now() + 1000);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      const batch = [...this.pending.values()];
      this.pending.clear();
      void (async () => {
        for (const ev of batch) {
          try {
            await this.handleWebhookEvent(ev);
          } catch (e: any) {
            this.logger.warn(`Retry Strava falhou: ${e?.message}`);
          }
        }
      })();
    }, delay);
    this.pendingTimer.unref?.();
  }

  // ══════════════════════════ Persistência idempotente ══════════════════════════

  /**
   * Grava a atividade como resultado de um treino planejado.
   * Idempotência: externalId `strava_<id>` + trava em memória + "claim" atômico do treino
   * (updateMany status SCHEDULED→COMPLETED só vence uma vez).
   */
  async upsertActivity(
    userId: string,
    activity: any,
    aspect: 'create' | 'update' | 'delete',
  ): Promise<'created' | 'updated' | 'duplicate' | 'unmatched' | 'busy'> {
    const data = mapStravaActivityToResult(activity);
    const lockKey = data.externalId;
    if (this.inFlight.has(lockKey)) return 'busy';
    this.inFlight.add(lockKey);
    try {
      const existing = await this.prisma.workoutResult.findFirst({
        where: { externalId: data.externalId },
        select: { id: true, workoutId: true },
      });
      if (existing) {
        if (aspect !== 'update') return 'duplicate';
        const { externalId: _e, source: _s, ...metrics } = data;
        await this.prisma.workoutResult.update({ where: { id: existing.id }, data: metrics });
        return 'updated';
      }

      const startLocal: string = activity.start_date_local || activity.start_date;
      const start = new Date(activity.start_date);
      if (!startLocal || Number.isNaN(start.getTime())) return 'unmatched';
      const localDate = String(startLocal).slice(0, 10);
      const utcOffsetSeconds = typeof activity.utc_offset === 'number'
        ? activity.utc_offset
        : Math.round((new Date(startLocal).getTime() - start.getTime()) / 1000);

      const dayUtc = Date.parse(`${localDate}T00:00:00Z`);
      const candidates = await this.prisma.workout.findMany({
        where: {
          athleteId: userId,
          status: WorkoutStatus.SCHEDULED,
          scheduledDate: { gte: new Date(dayUtc - 14 * 3600_000), lt: new Date(dayUtc + 38 * 3600_000) },
        },
        select: { id: true, scheduledDate: true, targetDistanceMeters: true, targetDurationSeconds: true },
      });

      const match = pickMatchingWorkout(candidates || [], {
        localDate,
        utcOffsetSeconds,
        distanceMeters: data.distanceMeters,
        movingTimeSeconds: data.durationSeconds,
      });
      if (!match) return 'unmatched';

      const claim = await this.prisma.workout.updateMany({
        where: { id: match.id, status: WorkoutStatus.SCHEDULED },
        data: { status: WorkoutStatus.COMPLETED, completedAt: start },
      });
      if (claim.count !== 1) return 'duplicate';

      await this.prisma.workoutResult.upsert({
        where: { workoutId: match.id },
        create: { workoutId: match.id, ...data },
        update: data,
      });

      this.logger.log(`Strava ${data.externalId} → treino ${match.id}`);
      return 'created';
    } finally {
      this.inFlight.delete(lockKey);
    }
  }

  // ══════════════════════════ Webhook subscription (admin) ══════════════════════════

  /**
   * Registra a assinatura de webhook na Strava. Seguro chamar mais de uma vez.
   * O `subscriptionId` retornado deve ir para STRAVA_WEBHOOK_SUBSCRIPTION_ID.
   */
  async registerWebhook(callbackUrl: string): Promise<{ status: string; subscriptionId?: number; message?: string }> {
    const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
    if (!isStravaConfigured()) {
      return { status: 'error', message: 'STRAVA_CLIENT_ID ou STRAVA_CLIENT_SECRET não configurados' };
    }
    if (!verifyToken) {
      return { status: 'error', message: 'STRAVA_WEBHOOK_VERIFY_TOKEN não configurado' };
    }

    const res = await fetch(`${STRAVA_API_BASE}/push_subscriptions`, {
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
    const data = (await res.json().catch(() => ({}))) as any;

    if (res.status === 201 || (res.ok && data?.id)) {
      this.logger.log(`Strava webhook registrado: subscriptionId=${data.id}`);
      return {
        status: 'registered',
        subscriptionId: data.id,
        message: `Defina STRAVA_WEBHOOK_SUBSCRIPTION_ID=${data.id} no ambiente da API.`,
      };
    }
    const alreadyExists =
      res.status === 422 ||
      (res.status === 400 && Array.isArray(data?.errors) && data.errors.some((e: any) => e?.code === 'already exists'));
    if (alreadyExists) {
      try {
        const qs = new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret });
        const listRes = await fetch(`${STRAVA_API_BASE}/push_subscriptions?${qs.toString()}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (listRes.ok) {
          const subs = (await listRes.json()) as any[];
          const existing = Array.isArray(subs) ? subs[0] : undefined;
          return {
            status: 'already_registered',
            subscriptionId: existing?.id,
            message: `Webhook já registrado (callback: ${existing?.callback_url ?? '?'}).`,
          };
        }
      } catch {
        /* ignore */
      }
      return { status: 'already_registered', message: 'Webhook já está registrado na Strava' };
    }
    this.logger.error(`Strava webhook registration failed: ${res.status} ${JSON.stringify(data)}`);
    return { status: 'error', message: `Strava retornou ${res.status}` };
  }

  // ══════════════════════════ HTTP / tokens ══════════════════════════

  /** GET autenticado na API da Strava com tratamento de rate limit (429) e um retry em 5xx. */
  private async stravaFetch(url: string, accessToken: string): Promise<Response> {
    if (Date.now() < this.rateLimitedUntil) throw new StravaRateLimitError(new Date(this.rateLimitedUntil));

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 429) {
        this.rateLimitedUntil = this.computeRateLimitReset(res).getTime();
        this.logger.warn(`Strava 429 — pausando chamadas até ${new Date(this.rateLimitedUntil).toISOString()}`);
        throw new StravaRateLimitError(new Date(this.rateLimitedUntil));
      }
      if (res.status >= 500 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      return res;
    }
    // inalcançável
    throw new Error('stravaFetch: loop inesperado');
  }

  /** Próxima janela: fim do quarto de hora (limite 15 min) ou meia-noite UTC (limite diário estourado). */
  private computeRateLimitReset(res: Response): Date {
    const now = new Date();
    const usage = (res.headers?.get?.('x-ratelimit-usage') || res.headers?.get?.('x-readratelimit-usage') || '').split(',');
    const limit = (res.headers?.get?.('x-ratelimit-limit') || res.headers?.get?.('x-readratelimit-limit') || '').split(',');
    const dailyUsed = Number(usage[1]);
    const dailyLimit = Number(limit[1]);
    if (Number.isFinite(dailyUsed) && Number.isFinite(dailyLimit) && dailyLimit > 0 && dailyUsed >= dailyLimit) {
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    }
    const next = new Date(now);
    next.setUTCSeconds(0, 0);
    next.setUTCMinutes(Math.floor(now.getUTCMinutes() / 15) * 15 + 15);
    return next;
  }

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
      const errorText = await res.text().catch(() => '');
      this.logger.error(`Strava token exchange failed: ${res.status} ${errorText.slice(0, 300)}`);
      throw new BadRequestException('Falha na autenticação com Strava');
    }
    return (await res.json()) as any;
  }

  private async refreshAccessToken(refreshToken: string) {
    if (Date.now() < this.rateLimitedUntil) throw new StravaRateLimitError(new Date(this.rateLimitedUntil));
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

    if (res.status === 429) {
      this.rateLimitedUntil = this.computeRateLimitReset(res).getTime();
      throw new StravaRateLimitError(new Date(this.rateLimitedUntil));
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new StravaAuthError(res.status);
    }
    if (!res.ok) {
      throw new BadRequestException('Falha ao renovar token Strava. Tente novamente mais tarde.');
    }
    return (await res.json()) as any;
  }

  /**
   * Devolve um access token válido, renovando antes de expirar. Lida com linhas legadas em texto puro
   * (decrypt devolve o próprio valor) e as regrava criptografadas.
   */
  async ensureValidToken(integration: FitnessIntegration): Promise<string> {
    const expiresAt = integration.expiresAt ? new Date(integration.expiresAt).getTime() : 0;
    if (expiresAt - REFRESH_MARGIN_MS > Date.now() && integration.accessToken) {
      const token = decrypt(integration.accessToken);
      this.reencryptLegacy(integration);
      return token;
    }

    if (!integration.refreshToken) {
      throw new StravaAuthError(401);
    }

    this.logger.log(`Renovando token Strava para integração ${integration.id}`);
    const newTokens = await this.refreshAccessToken(decrypt(integration.refreshToken));
    if (!newTokens?.access_token) throw new BadRequestException('Resposta inválida da Strava ao renovar token');

    const updated = {
      accessToken: encrypt(newTokens.access_token),
      refreshToken: encrypt(newTokens.refresh_token || decrypt(integration.refreshToken)),
      expiresAt: new Date(Number(newTokens.expires_at) * 1000),
    };
    await this.prisma.fitnessIntegration.update({ where: { id: integration.id }, data: updated });
    // mantém o objeto em memória coerente para chamadas subsequentes no mesmo fluxo
    Object.assign(integration, updated);

    return newTokens.access_token;
  }

  /** Regrava tokens legados (texto puro) criptografados — best-effort, sem bloquear. */
  private reencryptLegacy(integration: FitnessIntegration) {
    try {
      const at = integration.accessToken;
      const rt = integration.refreshToken;
      const atPlain = decrypt(at) === at;
      const rtPlain = !!rt && decrypt(rt) === rt;
      if (!atPlain && !rtPlain) return;
      const encAt = atPlain ? encrypt(at) : at;
      const encRt = rt && rtPlain ? encrypt(rt) : rt;
      if (encAt === at && encRt === rt) return; // sem ENCRYPTION_KEY (dev) — nada a fazer
      void Promise.resolve(
        this.prisma.fitnessIntegration.update({
          where: { id: integration.id },
          data: { accessToken: encAt, refreshToken: encRt },
        }),
      ).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }
}
