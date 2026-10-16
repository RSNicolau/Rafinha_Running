import { Injectable } from '@nestjs/common';
import { WorkoutStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCoachOwnsAthlete, AuthUserLike } from '../../common/utils/ownership';
import { addCalendarDays, calendarDayInTz, toCalendarDate } from '../../common/utils/date-only';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Converte "m:ss" em segundos (ou null). */
export function paceToSeconds(p?: string | null): number | null {
  if (!p) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(p.trim());
  return m ? +m[1] * 60 + +m[2] : null;
}

/**
 * Endpoints do TREINADOR sobre os treinos de um atleta (detalhe do atleta no painel).
 * Acesso: vínculo ATUAL do atleta (assertCoachOwnsAthlete) — treinador atribuído ou OWNER/ADMIN/STAFF da equipe.
 */
@Injectable()
export class CoachWorkoutsService {
  constructor(private prisma: PrismaService) {}

  async listForAthlete(
    user: AuthUserLike,
    athleteId: string,
    opts: { page?: number; limit?: number; status?: 'COMPLETED' | 'ALL' | 'UPCOMING'; from?: string; to?: string } = {},
  ) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false });
    const page = Math.max(1, Math.floor(opts.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Math.floor(opts.limit ?? 20) || 20));
    const status = opts.status ?? 'COMPLETED';

    const where: Record<string, any> = { athleteId };
    let orderBy: any = [{ completedAt: { sort: 'desc', nulls: 'last' } }, { scheduledDate: 'desc' }];
    if (status === 'COMPLETED') {
      where.status = WorkoutStatus.COMPLETED;
    } else if (status === 'UPCOMING') {
      where.status = WorkoutStatus.SCHEDULED;
      where.scheduledDate = { gte: toCalendarDate(new Date()) };
      orderBy = { scheduledDate: 'asc' };
    } else {
      orderBy = { scheduledDate: 'desc' };
    }
    // Janela por dia de calendário (YYYY-MM-DD, inclusivo) sobre a data programada
    const range: Record<string, Date> = {};
    if (opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)) range.gte = new Date(`${opts.from}T00:00:00.000Z`);
    if (opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) range.lte = new Date(`${opts.to}T23:59:59.999Z`);
    if (Object.keys(range).length) where.scheduledDate = { ...(where.scheduledDate ?? {}), ...range };

    const [rows, total] = await Promise.all([
      this.prisma.workout.findMany({
        where,
        include: {
          result: {
            select: {
              source: true, distanceMeters: true, durationSeconds: true, avgPace: true, avgHeartRate: true,
              rpe: true, sensationScore: true, athleteFeedback: true,
            },
          },
          plan: { select: { id: true, name: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workout.count({ where }),
    ]);

    const data = rows.map((w: any) => {
      const dist = w.result?.distanceMeters ?? null;
      const dur = w.result?.durationSeconds ?? null;
      const pace = paceToSeconds(w.result?.avgPace) ?? (dist && dur ? Math.round(dur / (dist / 1000)) : null);
      return {
        ...w,
        date: (w.completedAt ?? w.scheduledDate)?.toISOString?.() ?? w.scheduledDate,
        distance: dist,
        duration: dur,
        pace,
        source: w.result?.source ?? null,
      };
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async statsForAthlete(user: AuthUserLike, athleteId: string) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false });

    const today = toCalendarDate(new Date());
    const eightWeeksAgo = addCalendarDays(today, -7 * 8 - today.getUTCDay());
    const [totalWorkouts, all, recent] = await Promise.all([
      this.prisma.workout.count({ where: { athleteId, status: WorkoutStatus.COMPLETED } }),
      this.prisma.workoutResult.findMany({
        where: { workout: { athleteId, status: WorkoutStatus.COMPLETED } },
        select: { distanceMeters: true, durationSeconds: true },
      }),
      this.prisma.workout.findMany({
        where: {
          athleteId,
          status: WorkoutStatus.COMPLETED,
          OR: [{ completedAt: { gte: eightWeeksAgo } }, { completedAt: null, scheduledDate: { gte: eightWeeksAgo } }],
        },
        select: { completedAt: true, scheduledDate: true, result: { select: { distanceMeters: true } } },
      }),
    ]);

    const totalMeters = all.reduce((s, r) => s + (r.distanceMeters || 0), 0);
    const totalSeconds = all.reduce((s, r) => s + (r.durationSeconds || 0), 0);
    const avgPace = totalMeters > 0 && totalSeconds > 0 ? Math.round(totalSeconds / (totalMeters / 1000)) : null;

    const monthKey = calendarDayInTz(new Date()).slice(0, 7);
    let monthlyMeters = 0;
    const days = new Set<string>();
    const weekly = new Map<string, number>();
    for (let i = 7; i >= 0; i--) {
      const ws = addCalendarDays(today, -today.getUTCDay() - 7 * i);
      weekly.set(ws.toISOString().slice(0, 10), 0);
    }
    for (const w of recent) {
      const when = w.completedAt ?? w.scheduledDate;
      const day = calendarDayInTz(when);
      days.add(day);
      const m = w.result?.distanceMeters ?? 0;
      if (day.startsWith(monthKey)) monthlyMeters += m;
      const d = toCalendarDate(day);
      const ws = addCalendarDays(d, -d.getUTCDay()).toISOString().slice(0, 10);
      if (weekly.has(ws)) weekly.set(ws, (weekly.get(ws) ?? 0) + m);
    }

    // Sequência: dias consecutivos com treino concluído, terminando hoje ou ontem
    let streak = 0;
    let cursor = today;
    if (!days.has(calendarDayInTz(cursor))) cursor = addCalendarDays(today, -1);
    while (days.has(calendarDayInTz(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }

    const weeklyKm = Array.from(weekly.entries()).map(([ws, m]) => {
      const d = new Date(`${ws}T12:00:00Z`);
      return {
        weekStart: ws,
        week: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }),
        km: Math.round(m / 100) / 10,
      };
    });

    return {
      totalWorkouts,
      totalKm: Math.round(totalMeters / 100) / 10,
      monthlyKm: Math.round(monthlyMeters / 100) / 10,
      avgPace,
      streak,
      weeklyKm,
    };
  }
}
