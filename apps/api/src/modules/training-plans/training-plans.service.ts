import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertCoachOwnsAthlete,
  athleteProfileScopeWhere,
  AuthUserLike,
  isPlatformAdmin,
  TEAM_MANAGER_ROLES,
} from '../../common/utils/ownership';
import { addCalendarDays, toCalendarDate } from '../../common/utils/date-only';
import { NotificationsService } from '../notifications/notifications.service';
import { GarminAutoSyncService } from '../integrations/garmin/garmin-auto-sync.service';
import {
  CreatePlanDto,
  DuplicatePlanDto,
  PlanWorkoutDto,
  UpdatePlanDto,
  UpdatePlanWorkoutDto,
} from './dto/plan.dto';
import { UserRole, PlanStatus, NotificationType, WorkoutStatus, WorkoutType } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  EASY_RUN: 'Corrida leve',
  TEMPO: 'Tempo run',
  INTERVAL: 'Intervalado',
  LONG_RUN: 'Longão',
  RECOVERY: 'Regenerativo',
  RACE: 'Prova',
  CROSS_TRAINING: 'Treino cruzado',
  REST: 'Descanso',
};

function toUser(u: AuthUserLike | string): AuthUserLike {
  return typeof u === 'string' ? { id: u, role: 'COACH' } : u;
}

export interface PlanListFilters {
  athleteId?: string;
  status?: PlanStatus;
}

/**
 * Planilhas são da EQUIPE: quem pode acessar o atleta (treinador atribuído ou OWNER/ADMIN/STAFF da equipe dele)
 * vê as planilhas, independente de quem as criou. Alterar exige ser o treinador atribuído ou OWNER/ADMIN
 * (STAFF só leitura).
 */
@Injectable()
export class TrainingPlansService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Optional() private garminSync?: GarminAutoSyncService,
  ) {}

  // ── Acesso ──────────────────────────────────────────────────────────────

  /** Pode ALTERAR planilhas do atleta: treinador atribuído, OWNER/ADMIN da equipe do atleta, ADMIN da plataforma. */
  async assertCanManageAthlete(user: AuthUserLike, athleteId: string): Promise<void> {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false });
    if (isPlatformAdmin(user)) return;
    const profile = await this.prisma.athleteProfile.findUnique({
      where: { userId: athleteId },
      select: { coachId: true, teamId: true },
    });
    if (profile?.coachId === user.id) return;
    if (profile?.teamId && (this.prisma as any).teamMember?.findFirst) {
      const m = await (this.prisma as any).teamMember.findFirst({
        where: {
          teamId: profile.teamId,
          userId: user.id,
          isActive: true,
          role: { in: [...TEAM_MANAGER_ROLES] },
        },
        select: { role: true },
      });
      if (m) return;
    }
    throw new ForbiddenException('Somente o treinador do atleta ou a gestão da equipe pode alterar planilhas');
  }

  private async canManage(user: AuthUserLike, athleteId: string): Promise<boolean> {
    try {
      await this.assertCanManageAthlete(user, athleteId);
      return true;
    } catch {
      return false;
    }
  }

  /** Carrega a planilha (não excluída) e valida leitura. */
  private async loadPlanForRead(id: string, user: AuthUserLike) {
    const plan = await this.prisma.trainingPlan.findUnique({ where: { id } });
    if (!plan || plan.deletedAt) throw new NotFoundException('Plano de treino não encontrado');
    if (user.role === UserRole.ATHLETE) {
      if (plan.athleteId !== user.id) throw new NotFoundException('Plano de treino não encontrado');
      return plan;
    }
    try {
      await assertCoachOwnsAthlete(this.prisma, user, plan.athleteId, { allowSelf: false });
    } catch (e) {
      if (e instanceof ForbiddenException && user.role !== UserRole.COACH) throw e;
      throw new NotFoundException('Plano de treino não encontrado');
    }
    return plan;
  }

  /** Carrega a planilha (não excluída) e valida permissão de alteração. */
  private async loadPlanForWrite(id: string, user: AuthUserLike) {
    const plan = await this.loadPlanForRead(id, user);
    if (user.role === UserRole.ATHLETE) throw new ForbiddenException('Apenas o treinador pode alterar a planilha');
    await this.assertCanManageAthlete(user, plan.athleteId);
    return plan;
  }

  // ── Planilhas ───────────────────────────────────────────────────────────

  /** `coach` pode ser o usuário autenticado ({id, role}). */
  async create(coach: AuthUserLike | string, dto: CreatePlanDto) {
    const user = toUser(coach);
    await this.assertCanManageAthlete(user, dto.athleteId);
    const startDate = toCalendarDate(dto.startDate);
    const endDate = toCalendarDate(dto.endDate);
    if (endDate < startDate) throw new BadRequestException('A data de fim deve ser igual ou posterior à data de início');

    const plan = await this.prisma.trainingPlan.create({
      data: {
        coachId: user.id,
        athleteId: dto.athleteId,
        name: dto.name.trim(),
        description: dto.description,
        startDate,
        endDate,
        weeklyFrequency: dto.weeklyFrequency,
        status: PlanStatus.DRAFT,
      },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
        coach: { select: { name: true } },
      },
    });

    this.notifications.createNotification(
      dto.athleteId,
      NotificationType.PLAN_ASSIGNED,
      'Nova planilha de treino',
      `${plan.coach?.name || 'Seu treinador'} criou a planilha "${plan.name}" para você.`,
      { planId: plan.id },
    ).catch(() => {});

    return plan;
  }

  async findAll(userArg: AuthUserLike | string, page = 1, limit = 20, filters: PlanListFilters = {}) {
    const user = toUser(userArg);
    let where: Record<string, any>;
    if (user.role === UserRole.ATHLETE) {
      where = { athleteId: user.id };
    } else if (isPlatformAdmin(user)) {
      where = {};
    } else {
      const scope = await athleteProfileScopeWhere(this.prisma, user);
      where = { athlete: { athleteProfile: scope } };
    }
    where.deletedAt = null;
    if (filters.athleteId) where.athleteId = filters.athleteId;
    if (filters.status) where.status = filters.status;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.trainingPlan.findMany({
        where,
        include: {
          athlete: { select: { id: true, name: true, avatarUrl: true } },
          coach: { select: { id: true, name: true } },
          _count: { select: { workouts: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.trainingPlan.count({ where }),
    ]);

    // Contagem de concluídos por planilha (progresso na lista)
    const ids = rows.map((r: any) => r.id);
    const completedByPlan = new Map<string, number>();
    if (ids.length && (this.prisma.workout as any).groupBy) {
      const grouped: any[] = await (this.prisma.workout as any)
        .groupBy({ by: ['planId'], where: { planId: { in: ids }, status: WorkoutStatus.COMPLETED }, _count: { _all: true } })
        .catch(() => []);
      for (const g of grouped ?? []) completedByPlan.set(g.planId, g._count?._all ?? 0);
    }
    const data = rows.map((r: any) => ({ ...r, completedWorkouts: completedByPlan.get(r.id) ?? 0 }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, userArg: AuthUserLike | string) {
    const user = toUser(userArg);
    await this.loadPlanForRead(id, user);
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true, email: true } },
        coach: { select: { id: true, name: true } },
        workouts: { orderBy: { scheduledDate: 'asc' }, include: { result: true } },
      },
    });
    if (!plan) throw new NotFoundException('Plano de treino não encontrado');

    const completed = plan.workouts.filter((w) => w.status === 'COMPLETED').length;
    return {
      ...plan,
      completedWorkouts: completed,
      totalWorkouts: plan.workouts.length,
      completionPercentage: plan.workouts.length > 0 ? Math.round((completed / plan.workouts.length) * 100) : 0,
      canManage: user.role === UserRole.ATHLETE ? false : await this.canManage(user, plan.athleteId),
    };
  }

  /** Planilha ATIVA mais recente do atleta (ou null). */
  async findActiveForAthlete(athleteId: string, user: AuthUserLike) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: true });
    const plan = await this.prisma.trainingPlan.findFirst({
      where: { athleteId, status: PlanStatus.ACTIVE, deletedAt: null },
      orderBy: { startDate: 'desc' },
      include: { coach: { select: { id: true, name: true } }, _count: { select: { workouts: true } } },
    });
    if (!plan) return null;
    const completed = await this.prisma.workout.count({ where: { planId: plan.id, status: WorkoutStatus.COMPLETED } });
    const total = (plan as any)._count?.workouts ?? 0;
    return {
      ...plan,
      totalWorkouts: total,
      completedWorkouts: completed,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  async update(id: string, userArg: AuthUserLike | string, dto: UpdatePlanDto) {
    const user = toUser(userArg);
    const plan = await this.loadPlanForWrite(id, user);

    const startDate = dto.startDate ? toCalendarDate(dto.startDate) : plan.startDate;
    const endDate = dto.endDate ? toCalendarDate(dto.endDate) : plan.endDate;
    if (endDate < startDate) throw new BadRequestException('A data de fim deve ser igual ou posterior à data de início');

    if (dto.status === PlanStatus.ACTIVE && plan.status !== PlanStatus.ACTIVE) {
      const count = await this.prisma.workout.count({ where: { planId: id } });
      if (count === 0) throw new BadRequestException('Adicione ao menos um treino antes de ativar a planilha');
    }

    const updated = await this.prisma.trainingPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.weeklyFrequency !== undefined && { weeklyFrequency: dto.weeklyFrequency }),
        ...(dto.startDate && { startDate }),
        ...(dto.endDate && { endDate }),
      },
    });

    // Só uma planilha ativa por atleta: ao ativar, as demais ativas do atleta são pausadas
    if (dto.status === PlanStatus.ACTIVE && plan.status !== PlanStatus.ACTIVE) {
      await this.prisma.trainingPlan.updateMany({
        where: { athleteId: plan.athleteId, status: PlanStatus.ACTIVE, id: { not: id }, deletedAt: null },
        data: { status: PlanStatus.PAUSED },
      });
      this.notifications.createNotification(
        plan.athleteId,
        NotificationType.PLAN_ASSIGNED,
        'Planilha ativada',
        `Sua planilha "${updated.name}" está ativa. Bons treinos!`,
        { planId: id },
      ).catch(() => {});
      // Planilha publicada: envia ao Garmin os treinos futuros ainda não enviados (fire-and-forget)
      this.garminSync?.onPlanActivated(id);
    }
    return updated;
  }

  /**
   * Exclui a planilha. Se já houver treino realizado (com resultado), faz exclusão lógica (deletedAt) e
   * remove apenas os treinos futuros não realizados — o histórico do atleta é preservado.
   */
  async remove(id: string, userArg: AuthUserLike | string) {
    const user = toUser(userArg);
    await this.loadPlanForWrite(id, user);
    // Treinos que já estão no Garmin e serão removidos (não realizados) → remover lá também (best-effort)
    const onGarmin = this.garminSync?.enabled
      ? await this.prisma.workout
          .findMany({
            where: { planId: id, garminWorkoutId: { not: null }, status: { not: WorkoutStatus.COMPLETED }, result: { is: null } },
            select: { id: true, athleteId: true, garminWorkoutId: true, garminScheduleId: true },
          })
          .catch(() => [])
      : [];
    const withHistory = await this.prisma.workout.count({
      where: { planId: id, OR: [{ status: WorkoutStatus.COMPLETED }, { result: { isNot: null } }] },
    });
    if (withHistory > 0) {
      await this.prisma.workout.deleteMany({
        where: { planId: id, status: { not: WorkoutStatus.COMPLETED }, result: { is: null } },
      });
      await this.prisma.trainingPlan.update({
        where: { id },
        data: { deletedAt: new Date(), status: PlanStatus.COMPLETED },
      });
      this.garminSync?.onWorkoutsDeleted(onGarmin);
      return { deleted: true, soft: true, preservedWorkouts: withHistory };
    }
    await this.prisma.trainingPlan.delete({ where: { id } }); // treinos em cascata
    this.garminSync?.onWorkoutsDeleted(onGarmin);
    return { deleted: true, soft: false };
  }

  /** Duplica a planilha (modelo) — para o mesmo atleta ou outro, opcionalmente com nova data de início. */
  async duplicate(id: string, userArg: AuthUserLike | string, dto: DuplicatePlanDto = {}) {
    const user = toUser(userArg);
    const source = await this.loadPlanForRead(id, user);
    const targetAthleteId = dto.athleteId ?? source.athleteId;
    await this.assertCanManageAthlete(user, targetAthleteId);

    const newStart = dto.startDate ? toCalendarDate(dto.startDate) : toCalendarDate(source.startDate);
    const shiftDays = Math.round((newStart.getTime() - toCalendarDate(source.startDate).getTime()) / DAY_MS);
    const durationDays = Math.max(0, Math.round((toCalendarDate(source.endDate).getTime() - toCalendarDate(source.startDate).getTime()) / DAY_MS));

    const workouts = await this.prisma.workout.findMany({ where: { planId: id }, orderBy: { scheduledDate: 'asc' } });

    const copy = await this.prisma.trainingPlan.create({
      data: {
        coachId: user.id,
        athleteId: targetAthleteId,
        name: (dto.name ?? `${source.name} (cópia)`).trim().slice(0, 150),
        description: source.description,
        startDate: newStart,
        endDate: addCalendarDays(newStart, durationDays),
        weeklyFrequency: source.weeklyFrequency,
        status: PlanStatus.DRAFT,
      },
    });

    if (workouts.length) {
      await this.prisma.workout.createMany({
        data: workouts.map((w) => ({
          planId: copy.id,
          athleteId: targetAthleteId,
          scheduledDate: addCalendarDays(toCalendarDate(w.scheduledDate), shiftDays),
          type: w.type,
          title: w.title,
          description: w.description,
          targetDistanceMeters: w.targetDistanceMeters,
          targetDurationSeconds: w.targetDurationSeconds,
          targetPace: w.targetPace,
          heartRateZone: w.heartRateZone,
          coachNotes: w.coachNotes,
          status: WorkoutStatus.SCHEDULED,
        })),
      });
    }
    return { ...copy, workoutsCopied: workouts.length };
  }

  // ── Treinos da planilha ─────────────────────────────────────────────────

  async addWorkout(planId: string, userArg: AuthUserLike | string, dto: PlanWorkoutDto) {
    const user = toUser(userArg);
    const plan = await this.loadPlanForWrite(planId, user);
    const scheduledDate = toCalendarDate(dto.scheduledDate);
    const workout = await this.prisma.workout.create({
      data: {
        planId,
        athleteId: plan.athleteId,
        scheduledDate,
        type: dto.type,
        title: (dto.title?.trim() || WORKOUT_TYPE_LABELS[dto.type]).slice(0, 150),
        description: dto.description,
        targetDistanceMeters: dto.targetDistanceMeters,
        targetDurationSeconds: dto.targetDurationSeconds,
        targetPace: dto.targetPace?.replace(/\s*\/\s*km$/, ''),
        heartRateZone: dto.heartRateZone,
        coachNotes: dto.coachNotes,
      },
    });

    if (plan.status === PlanStatus.ACTIVE) {
      this.notifications.createNotification(
        plan.athleteId,
        NotificationType.WORKOUT_REMINDER,
        'Novo treino agendado',
        `${workout.title} — ${scheduledDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        { workoutId: workout.id, type: dto.type },
      ).catch(() => {});
    }
    // Envio automático ao Garmin (só se a planilha estiver ativa e o atleta tiver Garmin conectado)
    this.garminSync?.onWorkoutSaved(workout.id);
    return workout;
  }

  private async loadWorkout(planId: string, workoutId: string) {
    const workout = await this.prisma.workout.findUnique({ where: { id: workoutId }, include: { result: true } });
    if (!workout || workout.planId !== planId) throw new NotFoundException('Treino não encontrado');
    return workout;
  }

  async updateWorkout(planId: string, workoutId: string, userArg: AuthUserLike | string, dto: UpdatePlanWorkoutDto) {
    const user = toUser(userArg);
    await this.loadPlanForWrite(planId, user);
    await this.loadWorkout(planId, workoutId);
    const data: Record<string, any> = {};
    if (dto.scheduledDate !== undefined) data.scheduledDate = toCalendarDate(dto.scheduledDate);
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.title !== undefined) data.title = dto.title.trim().slice(0, 150);
    for (const k of ['description', 'targetDistanceMeters', 'targetDurationSeconds', 'heartRateZone', 'coachNotes'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.targetPace !== undefined) data.targetPace = dto.targetPace ? dto.targetPace.replace(/\s*\/\s*km$/, '') : null;
    const updated = await this.prisma.workout.update({ where: { id: workoutId }, data });
    // Edição/reagendamento: substitui o treino no Garmin (fire-and-forget)
    this.garminSync?.onWorkoutSaved(workoutId);
    return updated;
  }

  async deleteWorkout(planId: string, workoutId: string, userArg: AuthUserLike | string) {
    const user = toUser(userArg);
    await this.loadPlanForWrite(planId, user);
    const workout = await this.loadWorkout(planId, workoutId);
    if (workout.result || workout.status === WorkoutStatus.COMPLETED) {
      throw new BadRequestException('Treino já realizado não pode ser excluído (faz parte do histórico do atleta)');
    }
    await this.prisma.workout.delete({ where: { id: workoutId } });
    if (workout.garminWorkoutId) {
      this.garminSync?.onWorkoutsDeleted([
        { id: workout.id, athleteId: workout.athleteId, garminWorkoutId: workout.garminWorkoutId, garminScheduleId: workout.garminScheduleId },
      ]);
    }
    return { deleted: true };
  }
}
