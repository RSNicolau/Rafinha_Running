import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { TeamContextService } from '../teams/team-context.service';
import { AuthUserLike, isPlatformAdmin } from '../../common/utils/ownership';
import { localDateParts, startOfPeriod } from '../../common/utils/sp-period';

export type RankingPeriod = 'week' | 'month' | 'year' | 'all' | 'monthly';

export interface RankingEntry {
  position: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: number;
  unit: string;
  isMe?: boolean;
}

/**
 * Escopo do ranking (nunca global para não-admins):
 *  - all: somente ADMIN/SUPER_ADMIN da plataforma sem ?teamId;
 *  - team: atletas de uma equipe (AthleteProfile.teamId);
 *  - coach: atletas atribuídos a um treinador (sem equipe);
 *  - none: chamador sem equipe/treinador → lista vazia.
 */
export type RankingScope =
  | { kind: 'all' }
  | { kind: 'team'; teamId: string }
  | { kind: 'coach'; coachId: string }
  | { kind: 'none' };

export interface RankingViewer {
  id: string;
  /** true → nomes reduzidos a "Primeiro nome + inicial" (visão de atleta). */
  maskNames: boolean;
}

const RANKINGS_TTL = 5 * 60; // 5 minutos

/** Início do período no fuso de São Paulo (semana começa na segunda) ou null para "all". */
export function periodStart(period: RankingPeriod | string | undefined, now = new Date()): Date | null {
  switch (period) {
    case 'week':
      return startOfPeriod('week', now);
    case 'month':
    case 'monthly':
      return startOfPeriod('month', now);
    case 'year':
      return startOfPeriod('year', now);
    default:
      return null;
  }
}

export function normalizePeriod(period?: string): RankingPeriod {
  if (period === 'monthly') return 'month';
  return (['week', 'month', 'year', 'all'] as const).includes(period as any) ? (period as RankingPeriod) : 'all';
}

/** "Beatriz Silva Souza" → "Beatriz S." */
export function maskName(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Atleta';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function scopeKey(scope: RankingScope): string {
  switch (scope.kind) {
    case 'team':
      return `team:${scope.teamId}`;
    case 'coach':
      return `coach:${scope.coachId}`;
    default:
      return scope.kind;
  }
}

/** Monta o filtro SQL do escopo usando parâmetros posicionais a partir de `startIndex`. */
function scopeSql(scope: RankingScope, params: unknown[]): string {
  if (scope.kind === 'team') {
    params.push(scope.teamId);
    return `AND ap.team_id = $${params.length}`;
  }
  if (scope.kind === 'coach') {
    params.push(scope.coachId);
    return `AND ap.coach_id = $${params.length}`;
  }
  return '';
}

/** Data do treino para fins de período: conclusão; senão a data agendada. */
const WORKOUT_DATE = 'COALESCE(w.completed_at, w.scheduled_date)';

@Injectable()
export class RankingsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    @Optional() private teamContext?: TeamContextService,
  ) {}

  /** Resolve o escopo do ranking a partir do chamador (JWT) e do contexto de equipe. */
  async resolveScope(user: AuthUserLike, req?: any, requestedTeamId?: string): Promise<RankingScope> {
    if (!user?.id) return { kind: 'none' };

    if (isPlatformAdmin(user)) {
      if (requestedTeamId) {
        const team = await this.prisma.team.findUnique({ where: { id: requestedTeamId }, select: { id: true } });
        if (!team) throw new NotFoundException('Equipe não encontrada');
        return { kind: 'team', teamId: team.id };
      }
      return { kind: 'all' };
    }

    if (user.role === 'ATHLETE') {
      const profile = await this.prisma.athleteProfile.findUnique({
        where: { userId: user.id },
        select: { teamId: true, coachId: true },
      });
      if (profile?.teamId) return { kind: 'team', teamId: profile.teamId };
      if (profile?.coachId) return { kind: 'coach', coachId: profile.coachId };
      return { kind: 'none' };
    }

    // Treinador / dono / gestor: equipe ativa (header x-team-id ou padrão); sem equipe → seus atletas.
    const effectiveReq = requestedTeamId ? { headers: { 'x-team-id': requestedTeamId } } : req;
    const ctx = this.teamContext ? await this.teamContext.resolve(user, effectiveReq) : null;
    if (ctx) return { kind: 'team', teamId: ctx.teamId };
    return { kind: 'coach', coachId: user.id };
  }

  viewerFor(user: AuthUserLike): RankingViewer {
    return { id: user.id, maskNames: user.role === 'ATHLETE' };
  }

  private present(rows: Omit<RankingEntry, 'isMe'>[], viewer?: RankingViewer): RankingEntry[] {
    if (!viewer) return rows;
    return rows.map((r) => ({
      ...r,
      name: viewer.maskNames && r.userId !== viewer.id ? maskName(r.name) : r.name,
      isMe: r.userId === viewer.id,
    }));
  }

  async getTopByKm(
    period: RankingPeriod = 'all',
    limit = 20,
    scope: RankingScope = { kind: 'all' },
    viewer?: RankingViewer,
  ): Promise<RankingEntry[]> {
    if (scope.kind === 'none') return [];
    period = normalizePeriod(period);
    limit = Math.min(Math.max(1, Number(limit) || 20), 100);

    const cacheKey = `rankings:km:${scopeKey(scope)}:${period}:${limit}`;
    let ranking = await this.cache.get<RankingEntry[]>(cacheKey);
    if (!ranking) {
      const params: unknown[] = [];
      const start = periodStart(period);
      let dateClause = '';
      if (start) {
        params.push(start);
        dateClause = `AND ${WORKOUT_DATE} >= $${params.length}`;
      }
      const scopeClause = scopeSql(scope, params);

      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ user_id: string; name: string; avatar_url: string | null; total_meters: bigint }>
      >(
        `SELECT w.athlete_id as user_id, u.name, u.avatar_url,
                SUM(wr.distance_meters) as total_meters
         FROM workout_results wr
         INNER JOIN workouts w ON w.id = wr.workout_id
         INNER JOIN users u ON u.id = w.athlete_id
         LEFT JOIN athlete_profiles ap ON ap.user_id = w.athlete_id
         WHERE w.status = 'COMPLETED'
           AND u.deleted_at IS NULL
           ${dateClause}
           ${scopeClause}
         GROUP BY w.athlete_id, u.name, u.avatar_url
         ORDER BY total_meters DESC
         LIMIT ${limit}`,
        ...params,
      );

      // Valor em km (1 casa de precisão extra); a UI NÃO deve dividir de novo.
      ranking = rows.map((row, index) => ({
        position: index + 1,
        userId: row.user_id,
        name: row.name,
        avatarUrl: row.avatar_url,
        value: Math.round(Number(row.total_meters) / 10) / 100,
        unit: 'km',
      }));
      await this.cache.set(cacheKey, ranking, RANKINGS_TTL);
    }
    return this.present(ranking, viewer);
  }

  async getTopByWorkouts(
    period: RankingPeriod = 'all',
    limit = 20,
    scope: RankingScope = { kind: 'all' },
    viewer?: RankingViewer,
  ): Promise<RankingEntry[]> {
    if (scope.kind === 'none') return [];
    period = normalizePeriod(period);
    limit = Math.min(Math.max(1, Number(limit) || 20), 100);

    const cacheKey = `rankings:workouts:${scopeKey(scope)}:${period}:${limit}`;
    let ranking = await this.cache.get<RankingEntry[]>(cacheKey);
    if (!ranking) {
      const params: unknown[] = [];
      const start = periodStart(period);
      let dateClause = '';
      if (start) {
        params.push(start);
        dateClause = `AND ${WORKOUT_DATE} >= $${params.length}`;
      }
      const scopeClause = scopeSql(scope, params);

      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ user_id: string; name: string; avatar_url: string | null; total_workouts: bigint }>
      >(
        `SELECT w.athlete_id as user_id, u.name, u.avatar_url,
                COUNT(*) as total_workouts
         FROM workouts w
         INNER JOIN users u ON u.id = w.athlete_id
         LEFT JOIN athlete_profiles ap ON ap.user_id = w.athlete_id
         WHERE w.status = 'COMPLETED'
           AND u.deleted_at IS NULL
           ${dateClause}
           ${scopeClause}
         GROUP BY w.athlete_id, u.name, u.avatar_url
         ORDER BY total_workouts DESC
         LIMIT ${limit}`,
        ...params,
      );

      ranking = rows.map((row, index) => ({
        position: index + 1,
        userId: row.user_id,
        name: row.name,
        avatarUrl: row.avatar_url,
        value: Number(row.total_workouts),
        unit: 'treinos',
      }));
      await this.cache.set(cacheKey, ranking, RANKINGS_TTL);
    }
    return this.present(ranking, viewer);
  }

  /** Sequência atual de dias consecutivos com treino concluído (dias no fuso de SP). */
  async getTopByStreak(
    limit = 20,
    scope: RankingScope = { kind: 'all' },
    viewer?: RankingViewer,
    now = new Date(),
  ): Promise<RankingEntry[]> {
    if (scope.kind === 'none') return [];
    limit = Math.min(Math.max(1, Number(limit) || 20), 100);

    const cacheKey = `rankings:streak:${scopeKey(scope)}:${limit}`;
    let ranking = await this.cache.get<RankingEntry[]>(cacheKey);
    if (!ranking) {
      const params: unknown[] = [];
      const scopeClause = scopeSql(scope, params);
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ user_id: string; name: string; avatar_url: string | null; workout_day: string }>
      >(
        `SELECT DISTINCT w.athlete_id as user_id, u.name, u.avatar_url,
                to_char((w.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') as workout_day
         FROM workouts w
         INNER JOIN users u ON u.id = w.athlete_id
         LEFT JOIN athlete_profiles ap ON ap.user_id = w.athlete_id
         WHERE w.status = 'COMPLETED'
           AND w.completed_at IS NOT NULL
           AND u.deleted_at IS NULL
           ${scopeClause}
         ORDER BY user_id, workout_day DESC`,
        ...params,
      );
      ranking = computeStreaks(rows, now).slice(0, limit);
      await this.cache.set(cacheKey, ranking, RANKINGS_TTL);
    }
    return this.present(ranking, viewer);
  }
}

/** Calcula as sequências atuais (último dia = hoje ou ontem, em SP). Exportado para testes. */
export function computeStreaks(
  rows: Array<{ user_id: string; name: string; avatar_url: string | null; workout_day: string }>,
  now = new Date(),
): RankingEntry[] {
  const toDayNumber = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  };
  const t = localDateParts(now);
  const today = Math.round(Date.UTC(t.year, t.month - 1, t.day) / 86400000);

  const byUser = new Map<string, { name: string; avatarUrl: string | null; days: number[] }>();
  for (const r of rows) {
    if (!r.workout_day) continue;
    const entry = byUser.get(r.user_id) ?? { name: r.name, avatarUrl: r.avatar_url, days: [] };
    entry.days.push(toDayNumber(String(r.workout_day)));
    byUser.set(r.user_id, entry);
  }

  const streaks: Array<{ userId: string; name: string; avatarUrl: string | null; streak: number }> = [];
  for (const [userId, data] of byUser) {
    const days = Array.from(new Set(data.days)).sort((a, b) => b - a);
    if (!days.length || today - days[0] > 1) continue;
    let streak = 1;
    for (let i = 1; i < days.length; i++) {
      if (days[i - 1] - days[i] === 1) streak++;
      else break;
    }
    streaks.push({ userId, name: data.name, avatarUrl: data.avatarUrl, streak });
  }

  return streaks
    .sort((a, b) => b.streak - a.streak)
    .map((s, index) => ({
      position: index + 1,
      userId: s.userId,
      name: s.name,
      avatarUrl: s.avatarUrl,
      value: s.streak,
      unit: 'dias',
    }));
}
