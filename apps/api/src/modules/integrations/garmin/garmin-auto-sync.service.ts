import { Injectable, Logger } from '@nestjs/common';
import { IntegrationProvider, PlanStatus, WorkoutStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { calendarDayInTz } from '../../../common/utils/date-only';
import { isGarminConfigured } from '../integration-env';
import { GarminService } from './garmin.service';

export type GarminSyncOutcome = 'pushed' | 'replaced' | 'skipped' | 'failed';

export interface GarminDeletedWorkoutRef {
  id: string;
  athleteId: string;
  garminWorkoutId: string | null;
  garminScheduleId?: string | null;
}

/**
 * Envio AUTOMÁTICO dos treinos ao Garmin Connect do atleta quando o treinador cria/edita/reagenda.
 *
 * Regras (todas silenciosas — nunca falham a requisição do treinador):
 *  - só quando o ambiente tem GARMIN_CLIENT_ID/SECRET e o atleta tem integração GARMIN ativa;
 *  - só treinos SCHEDULED, de hoje em diante (dia de calendário em SP), de planilha ATIVA e não excluída;
 *  - se o treino já estava no Garmin (garminWorkoutId), remove o antigo e cria de novo (sobrescreve os ids);
 *  - operações do mesmo treino são serializadas (evita duplicar no Garmin com edições em sequência).
 *
 * Os métodos `on*` são fire-and-forget: retornam imediatamente e só registram avisos no log.
 */
@Injectable()
export class GarminAutoSyncService {
  private readonly logger = new Logger(GarminAutoSyncService.name);
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly garmin: GarminService,
  ) {}

  /** Ambiente com credenciais Garmin (GARMIN_CLIENT_ID/SECRET). */
  get enabled(): boolean {
    return isGarminConfigured();
  }

  // ── API fire-and-forget (usada pelos serviços de treino/planilha) ─────────

  /** Treino criado/alterado/reagendado. */
  onWorkoutSaved(workoutId: string | null | undefined): void {
    if (!workoutId || !isGarminConfigured()) return;
    void this.enqueue(workoutId, () => this.syncWorkout(workoutId));
  }

  /** Planilha passou a ATIVA: envia os treinos futuros ainda não enviados. */
  onPlanActivated(planId: string | null | undefined): void {
    if (!planId || !isGarminConfigured()) return;
    void this.pushPendingForPlan(planId).catch((err) =>
      this.logger.warn(`Garmin auto-sync (plan ${planId}) failed: ${err?.message ?? err}`),
    );
  }

  /** Treino(s) excluído(s) no RR: remove do Garmin (best-effort). */
  onWorkoutsDeleted(refs: GarminDeletedWorkoutRef[] | null | undefined): void {
    if (!refs?.length || !isGarminConfigured()) return;
    for (const ref of refs) {
      if (!ref?.garminWorkoutId) continue;
      void this.enqueue(ref.id, () =>
        this.garmin.deleteWorkoutFromGarmin(ref.athleteId, ref.garminWorkoutId!, ref.garminScheduleId ?? null),
      );
    }
  }

  // ── Núcleo (await-able; usado nos testes) ────────────────────────────────

  async syncWorkout(workoutId: string): Promise<GarminSyncOutcome> {
    try {
      if (!isGarminConfigured()) return 'skipped';

      const workout = await this.prisma.workout.findUnique({
        where: { id: workoutId },
        select: {
          id: true,
          athleteId: true,
          status: true,
          scheduledDate: true,
          garminWorkoutId: true,
          garminScheduleId: true,
          plan: { select: { status: true, deletedAt: true } },
        },
      });
      if (!workout) return 'skipped';
      if (workout.status !== WorkoutStatus.SCHEDULED) return 'skipped';
      if (!workout.plan || workout.plan.deletedAt || workout.plan.status !== PlanStatus.ACTIVE) return 'skipped';
      if (calendarDayInTz(workout.scheduledDate) < calendarDayInTz(new Date())) return 'skipped';

      const integration = await this.prisma.fitnessIntegration.findFirst({
        where: { userId: workout.athleteId, provider: IntegrationProvider.GARMIN, isActive: true },
        select: { id: true },
      });
      if (!integration) return 'skipped';

      const replacing = !!workout.garminWorkoutId;
      if (replacing) {
        await this.garmin.deleteWorkoutFromGarmin(
          workout.athleteId,
          workout.garminWorkoutId!,
          workout.garminScheduleId,
        );
      }

      await this.garmin.pushWorkoutToGarmin(workout.id);
      return replacing ? 'replaced' : 'pushed';
    } catch (err: any) {
      this.logger.warn(`Garmin auto-sync failed for workout ${workoutId}: ${err?.message ?? err}`);
      return 'failed';
    }
  }

  async pushPendingForPlan(planId: string): Promise<{ total: number; pushed: number }> {
    const today = new Date(`${calendarDayInTz(new Date())}T00:00:00.000Z`);
    const workouts = await this.prisma.workout.findMany({
      where: {
        planId,
        status: WorkoutStatus.SCHEDULED,
        garminWorkoutId: null,
        scheduledDate: { gte: today },
      },
      select: { id: true },
      orderBy: { scheduledDate: 'asc' },
      take: 200,
    });
    let pushed = 0;
    for (const w of workouts) {
      const outcome = await this.enqueue(w.id, () => this.syncWorkout(w.id));
      if (outcome === 'pushed' || outcome === 'replaced') pushed++;
    }
    return { total: workouts.length, pushed };
  }

  /** Serializa operações por treino; nunca rejeita. */
  private enqueue<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(fn)
      .catch((err) => {
        this.logger.warn(`Garmin auto-sync task failed (${key}): ${err?.message ?? err}`);
        return undefined;
      });
    this.chains.set(key, next);
    void next.finally(() => {
      if (this.chains.get(key) === next) this.chains.delete(key);
    });
    return next;
  }
}
