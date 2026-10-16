import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlanStatus, UserRole, WorkoutStatus, WorkoutType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { endOfPeriod, localDateParts, startOfPeriod } from '../../common/utils/sp-period';
import { calendarDayInTz } from '../../common/utils/date-only';
import { signFitDownloadToken } from './fit/fit-token';
import { WORKOUT_TYPE_LABELS } from '../training-plans/training-plans.service';

export interface WeekRange {
  /** Segunda-feira 00:00 (America/Sao_Paulo), instante UTC — inclusivo. */
  start: Date;
  /** Segunda-feira seguinte 00:00 (SP) — exclusivo. */
  end: Date;
}

export type WeeklyPlanSendResult =
  | { status: 'sent'; workouts: number }
  | { status: 'skipped'; reason: 'not-found' | 'inactive' | 'no-email' | 'no-workouts'; workouts: 0 };


const HR_ZONE_LABEL_PT: Record<string, string> = {
  Z1_RECOVERY: 'Z1 (recuperação)',
  Z2_EASY: 'Z2 (leve)',
  Z3_AEROBIC: 'Z3 (aeróbico)',
  Z4_THRESHOLD: 'Z4 (limiar)',
  Z5_MAXIMUM: 'Z5 (máximo)',
};

const WEEKDAY_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const BATCH_SIZE = 50;

/** "Seg 20/10" (dia de calendário em SP). */
export function dayLabelPt(date: Date): string {
  const ymd = calendarDayInTz(date);
  const [y, m, d] = ymd.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${WEEKDAY_PT[weekday]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export function formatDistancePt(meters?: number | null): string | null {
  if (!meters || meters <= 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`;
}

export function formatDurationPt(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Semana seguinte à de `now` (segunda a domingo, SP). No domingo à noite = a semana que começa amanhã. */
export function nextWeekRange(now: Date = new Date()): WeekRange {
  const start = endOfPeriod('week', now);
  return { start, end: endOfPeriod('week', start) };
}

/** Semana corrente; aos domingos considera a próxima (o atleta já está olhando para a semana que vem). */
export function currentOrUpcomingWeekRange(now: Date = new Date()): WeekRange {
  if (localDateParts(now).weekday === 0) return nextWeekRange(now);
  const start = startOfPeriod('week', now);
  return { start, end: endOfPeriod('week', now) };
}

/**
 * E-mail "Seus treinos da semana" (transacional/serviço — não depende de marketingOptIn; não há
 * preferência de notificação por usuário no schema). Envia somente para atleta ativo, com e-mail,
 * e com treinos SCHEDULED de planilha ATIVA (não excluída) na semana.
 */
@Injectable()
export class WeeklyPlanEmailService {
  private readonly logger = new Logger(WeeklyPlanEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly jwt: JwtService,
  ) {}

  private workoutWhere(range: WeekRange) {
    return {
      scheduledDate: { gte: range.start, lt: range.end },
      status: WorkoutStatus.SCHEDULED,
      plan: { status: PlanStatus.ACTIVE, deletedAt: null },
    };
  }

  /** Envia para UM atleta. Não lança por "nada a enviar" — devolve o motivo. */
  async sendForAthlete(athleteId: string, range: WeekRange): Promise<WeeklyPlanSendResult> {
    const athlete = await this.prisma.user.findUnique({
      where: { id: athleteId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        deletedAt: true,
        athleteProfile: {
          select: {
            team: { select: { name: true, status: true } },
            coach: { select: { name: true, tenantBranding: { select: { tenantName: true, isActive: true } } } },
          },
        },
      },
    });
    if (!athlete || athlete.role !== UserRole.ATHLETE) return { status: 'skipped', reason: 'not-found', workouts: 0 };
    if (!athlete.isActive || athlete.deletedAt) return { status: 'skipped', reason: 'inactive', workouts: 0 };
    const to = athlete.email?.trim();
    if (!to) return { status: 'skipped', reason: 'no-email', workouts: 0 };

    const workouts = await this.prisma.workout.findMany({
      where: { athleteId, ...this.workoutWhere(range) },
      orderBy: { scheduledDate: 'asc' },
      select: {
        id: true,
        athleteId: true,
        scheduledDate: true,
        type: true,
        title: true,
        description: true,
        coachNotes: true,
        targetDistanceMeters: true,
        targetDurationSeconds: true,
        targetPace: true,
        heartRateZone: true,
      },
    });
    if (!workouts.length) return { status: 'skipped', reason: 'no-workouts', workouts: 0 };

    const items = [];
    for (const w of workouts) {
      const targets = [
        formatDistancePt(w.targetDistanceMeters),
        formatDurationPt(w.targetDurationSeconds),
        w.targetPace ? `pace ${w.targetPace}/km` : null,
        w.heartRateZone ? `FC ${HR_ZONE_LABEL_PT[w.heartRateZone] ?? w.heartRateZone}` : null,
      ].filter((t): t is string => !!t);
      const typeLabel = WORKOUT_TYPE_LABELS[w.type] ?? null;
      items.push({
        workoutId: w.id,
        dayLabel: dayLabelPt(w.scheduledDate),
        title: w.title,
        typeLabel: typeLabel && typeLabel !== w.title ? typeLabel : null,
        targets,
        description: w.description,
        coachNotes: w.coachNotes,
        fitToken:
          w.type === WorkoutType.REST
            ? null
            : await signFitDownloadToken(this.jwt, { workoutId: w.id, athleteId: w.athleteId }),
      });
    }

    const profile = athlete.athleteProfile;
    const branding = profile?.coach?.tenantBranding;
    const brandName =
      (profile?.team && profile.team.status === 'ACTIVE' && profile.team.name) ||
      (branding?.isActive && branding.tenantName) ||
      process.env.PLATFORM_NAME ||
      'Rafinha Running';

    const lastDay = new Date(range.end.getTime() - 12 * 3600 * 1000); // domingo (SP)
    const weekLabel = `Semana de ${dayLabelPt(range.start).slice(4)} a ${dayLabelPt(lastDay).slice(4)}`;

    await this.email.sendWeeklyPlan(to, {
      name: athlete.name,
      brandName,
      weekLabel,
      workouts: items,
    });
    return { status: 'sent', workouts: items.length };
  }

  /** Cron de domingo: todos os atletas com treinos na semana seguinte (em lotes). */
  async sendAllForUpcomingWeek(now: Date = new Date()) {
    const range = nextWeekRange(now);
    const counts = { candidates: 0, sent: 0, skipped: 0, failed: 0 };
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.user.findMany({
        where: {
          role: UserRole.ATHLETE,
          isActive: true,
          deletedAt: null,
          AND: [{ email: { not: null } }, { email: { not: '' } }],
          athleteWorkouts: { some: this.workoutWhere(range) },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (!batch.length) break;

      for (const { id } of batch) {
        counts.candidates++;
        try {
          const r = await this.sendForAthlete(id, range);
          if (r.status === 'sent') counts.sent++;
          else counts.skipped++;
        } catch (err: any) {
          counts.failed++;
          this.logger.warn(`Weekly plan e-mail failed for athlete ${id}: ${err?.message ?? err}`);
        }
      }

      if (batch.length < BATCH_SIZE) break;
      cursor = batch[batch.length - 1].id;
    }

    this.logger.log(
      `Weekly plan e-mails (${range.start.toISOString()}..${range.end.toISOString()}): ` +
        `${counts.sent} sent, ${counts.skipped} skipped, ${counts.failed} failed of ${counts.candidates} athletes`,
    );
    return { ...counts, range };
  }
}
