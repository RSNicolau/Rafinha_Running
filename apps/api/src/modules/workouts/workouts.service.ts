import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateWorkoutDto, SubmitResultDto, SubmitFeedbackDto } from './dto/workout.dto';
import { WorkoutStatus, NotificationType } from '@prisma/client';

@Injectable()
export class WorkoutsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(coachId: string, dto: CreateWorkoutDto) {
    const plan = await this.prisma.trainingPlan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Plano de treino não encontrado');
    if (plan.coachId !== coachId) throw new ForbiddenException('Acesso negado');

    const workout = await this.prisma.workout.create({
      data: {
        planId: dto.planId,
        athleteId: plan.athleteId,
        scheduledDate: new Date(dto.scheduledDate),
        type: dto.type,
        title: dto.title,
        description: dto.description,
        targetDistanceMeters: dto.targetDistanceMeters,
        targetDurationSeconds: dto.targetDurationSeconds,
        targetPace: dto.targetPace,
        heartRateZone: dto.heartRateZone,
      },
    });

    // Notify athlete about new workout
    this.notifications.createNotification(
      plan.athleteId,
      NotificationType.WORKOUT_REMINDER,
      'Novo treino agendado',
      `${dto.title} — ${new Date(dto.scheduledDate).toLocaleDateString('pt-BR')}`,
      { workoutId: workout.id, type: dto.type },
    ).catch(() => {}); // Fire-and-forget

    return workout;
  }

  async getWeeklyWorkouts(athleteId: string, weekStart?: string) {
    const start = weekStart ? new Date(weekStart) : (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; })();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const workouts = await this.prisma.workout.findMany({
      where: { athleteId, scheduledDate: { gte: start, lt: end } },
      include: { result: true },
      orderBy: { scheduledDate: 'asc' },
    });

    return {
      week: weekStart,
      workouts,
      totalDistanceMeters: workouts.reduce((sum, w) => sum + (w.result?.distanceMeters || 0), 0),
      completedCount: workouts.filter(w => w.status === 'COMPLETED').length,
      totalCount: workouts.length,
    };
  }

  async findById(id: string) {
    const workout = await this.prisma.workout.findUnique({
      where: { id },
      include: { result: true, plan: { select: { id: true, name: true, coachId: true } } },
    });
    if (!workout) throw new NotFoundException('Treino não encontrado');
    return workout;
  }

  async markComplete(workoutId: string, athleteId: string) {
    const workout = await this.prisma.workout.findUnique({ where: { id: workoutId } });
    if (!workout) throw new NotFoundException('Treino não encontrado');
    if (workout.athleteId !== athleteId) throw new ForbiddenException('Acesso negado');

    return this.prisma.workout.update({
      where: { id: workoutId },
      data: { status: WorkoutStatus.COMPLETED, completedAt: new Date() },
    });
  }

  async submitResult(workoutId: string, athleteId: string, dto: SubmitResultDto) {
    const workout = await this.prisma.workout.findUnique({
      where: { id: workoutId },
      include: { plan: { select: { coachId: true } } },
    });
    if (!workout) throw new NotFoundException('Treino não encontrado');
    if (workout.athleteId !== athleteId) throw new ForbiddenException('Acesso negado');

    const result = await this.prisma.workoutResult.create({
      data: {
        workoutId,
        source: dto.source || 'MANUAL',
        distanceMeters: dto.distanceMeters,
        durationSeconds: dto.durationSeconds,
        avgPace: dto.avgPace,
        avgHeartRate: dto.avgHeartRate,
        maxHeartRate: dto.maxHeartRate,
        calories: dto.calories,
        elevationGain: dto.elevationGain,
        splits: dto.splits as any,
      },
    });

    await this.prisma.workout.update({
      where: { id: workoutId },
      data: { status: WorkoutStatus.COMPLETED, completedAt: new Date() },
    });

    // Notify coach about completed workout
    if (workout.plan?.coachId) {
      const athlete = await this.prisma.user.findUnique({
        where: { id: athleteId },
        select: { name: true },
      });
      this.notifications.createNotification(
        workout.plan.coachId,
        NotificationType.WORKOUT_COMPLETED,
        'Treino concluído',
        `${athlete?.name || 'Atleta'} concluiu "${workout.title}"`,
        { workoutId, athleteId, resultId: result.id },
      ).catch(() => {});
    }

    return result;
  }

  async getHistory(athleteId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [workouts, total] = await Promise.all([
      this.prisma.workout.findMany({
        where: { athleteId, status: WorkoutStatus.COMPLETED },
        include: { result: true },
        orderBy: { completedAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.workout.count({ where: { athleteId, status: WorkoutStatus.COMPLETED } }),
    ]);

    return { data: workouts, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getAthleteStats(athleteId: string) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const [allResults, weeklyResults, totalWorkouts] = await Promise.all([
      this.prisma.workoutResult.findMany({
        where: { workout: { athleteId, status: WorkoutStatus.COMPLETED } },
        select: { distanceMeters: true, durationSeconds: true },
      }),
      this.prisma.workoutResult.findMany({
        where: {
          workout: { athleteId, status: WorkoutStatus.COMPLETED },
          createdAt: { gte: weekStart },
        },
        select: { distanceMeters: true },
      }),
      this.prisma.workout.count({ where: { athleteId, status: WorkoutStatus.COMPLETED } }),
    ]);

    const totalMeters = allResults.reduce((s, r) => s + r.distanceMeters, 0);
    const totalSeconds = allResults.reduce((s, r) => s + r.durationSeconds, 0);
    const weeklyMeters = weeklyResults.reduce((s, r) => s + r.distanceMeters, 0);

    // Average pace in min/km
    let avgPace = '--';
    if (totalMeters > 0 && totalSeconds > 0) {
      const paceSecPerKm = (totalSeconds / (totalMeters / 1000));
      const mins = Math.floor(paceSecPerKm / 60);
      const secs = Math.round(paceSecPerKm % 60).toString().padStart(2, '0');
      avgPace = `${mins}:${secs}`;
    }

    return {
      totalKm: Math.round(totalMeters / 10) / 100,
      weeklyKm: Math.round(weeklyMeters / 10) / 100,
      totalWorkouts,
      avgPace,
    };
  }

  async syncFromAppleHealth(athleteId: string, data: {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    durationMinutes: number;
    distanceKm: number;
    calories: number;
    averageHeartRate?: number;
    maxHeartRate?: number;
    averagePaceMinPerKm?: number;
    elevationGain?: number;
    splits?: Array<{ km: number; paceMinPerKm: number }>;
    source: 'APPLE_HEALTH';
  }) {
    const externalId = `apple_health_${data.id}`;

    // Idempotency: skip if already synced
    const existingResult = await this.prisma.workoutResult.findFirst({ where: { externalId } });
    if (existingResult) return { status: 'already_synced', workoutId: existingResult.workoutId };

    const distanceMeters = Math.round(data.distanceKm * 1000);
    const durationSeconds = Math.round(data.durationMinutes * 60);

    // Calculate pace (mm:ss / km)
    let avgPace: string | null = null;
    if (data.averagePaceMinPerKm) {
      const mins = Math.floor(data.averagePaceMinPerKm);
      const secs = Math.round((data.averagePaceMinPerKm - mins) * 60);
      avgPace = `${mins}:${secs.toString().padStart(2, '0')}`;
    } else if (distanceMeters > 0 && durationSeconds > 0) {
      const paceSecPerKm = (durationSeconds / distanceMeters) * 1000;
      const mins = Math.floor(paceSecPerKm / 60);
      const secs = Math.round(paceSecPerKm % 60);
      avgPace = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Try to match an existing scheduled workout for this day and distance (±15%)
    const startDate = new Date(data.startDate);
    const startOfDay = new Date(startDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startDate);
    endOfDay.setHours(23, 59, 59, 999);

    const matchedWorkout = await this.prisma.workout.findFirst({
      where: {
        athleteId,
        scheduledDate: { gte: startOfDay, lte: endOfDay },
        status: 'SCHEDULED',
        ...(distanceMeters > 0 && {
          targetDistanceMeters: {
            gte: Math.round(distanceMeters * 0.85),
            lte: Math.round(distanceMeters * 1.15),
          },
        }),
      },
    });

    if (matchedWorkout) {
      // Link the Apple Health result to the scheduled workout
      await this.prisma.workoutResult.upsert({
        where: { workoutId: matchedWorkout.id },
        create: {
          workoutId: matchedWorkout.id,
          source: 'APPLE_HEALTH',
          externalId,
          distanceMeters,
          durationSeconds,
          avgPace,
          avgHeartRate: data.averageHeartRate ?? null,
          maxHeartRate: data.maxHeartRate ?? null,
          calories: data.calories ?? null,
          elevationGain: data.elevationGain ?? null,
        },
        update: {
          source: 'APPLE_HEALTH',
          externalId,
          distanceMeters,
          durationSeconds,
          avgPace,
          avgHeartRate: data.averageHeartRate ?? null,
          maxHeartRate: data.maxHeartRate ?? null,
          calories: data.calories ?? null,
          elevationGain: data.elevationGain ?? null,
        },
      });
      await this.prisma.workout.update({
        where: { id: matchedWorkout.id },
        data: { status: 'COMPLETED', completedAt: startDate },
      });
      return { status: 'synced', workoutId: matchedWorkout.id, matched: true };
    }

    // No scheduled workout found — create a standalone entry under the most recent plan
    const plan = await this.prisma.trainingPlan.findFirst({
      where: { athleteId },
      orderBy: { createdAt: 'desc' },
    });
    if (!plan) return { status: 'skipped', reason: 'no_active_plan' };

    const workout = await this.prisma.workout.create({
      data: {
        athleteId,
        planId: plan.id,
        type: 'EASY_RUN',
        title: `Corrida — Apple Health`,
        description: `Sincronizado via Apple Health (${data.type})`,
        scheduledDate: startDate,
        completedAt: new Date(data.endDate),
        status: 'COMPLETED',
        result: {
          create: {
            source: 'APPLE_HEALTH',
            externalId,
            distanceMeters,
            durationSeconds,
            avgPace,
            avgHeartRate: data.averageHeartRate ?? null,
            maxHeartRate: data.maxHeartRate ?? null,
            calories: data.calories ?? null,
            elevationGain: data.elevationGain ?? null,
          },
        },
      },
    });

    return { status: 'synced', workoutId: workout.id, matched: false };
  }

  async syncFromAppleHealthBatch(athleteId: string, workouts: Array<{
    id: string; type: string; startDate: string; endDate: string;
    durationMinutes: number; distanceKm: number; calories: number;
    averageHeartRate?: number; maxHeartRate?: number; averagePaceMinPerKm?: number;
    elevationGain?: number; splits?: Array<{ km: number; paceMinPerKm: number }>;
    source: 'APPLE_HEALTH';
  }>) {
    let synced = 0;
    let skipped = 0;
    for (const w of workouts) {
      const result = await this.syncFromAppleHealth(athleteId, w);
      if (result.status === 'synced') synced++;
      else skipped++;
    }
    return { synced, skipped };
  }

  async submitFeedback(workoutId: string, athleteId: string, dto: SubmitFeedbackDto) {
    const workout = await this.prisma.workout.findUnique({ where: { id: workoutId } });
    if (!workout) throw new NotFoundException('Treino não encontrado');
    if (workout.athleteId !== athleteId) throw new ForbiddenException('Acesso negado');

    return this.prisma.workoutResult.upsert({
      where: { workoutId },
      create: {
        workoutId,
        distanceMeters: 0,
        durationSeconds: 0,
        rpe: dto.rpe,
        sensationScore: dto.sensationScore,
        athleteFeedback: dto.athleteFeedback,
      },
      update: {
        ...(dto.rpe !== undefined && { rpe: dto.rpe }),
        ...(dto.sensationScore !== undefined && { sensationScore: dto.sensationScore }),
        ...(dto.athleteFeedback !== undefined && { athleteFeedback: dto.athleteFeedback }),
      },
    });
  }

  async getGroupComparison(athleteId: string) {
    // Find the athlete's coach
    const athleteProfile = await this.prisma.athleteProfile.findUnique({
      where: { userId: athleteId },
      select: { coachId: true },
    });

    if (!athleteProfile?.coachId) {
      return { data: [], myRank: null, groupAvgKm: 0 };
    }

    const coachId = athleteProfile.coachId;

    // Get all athletes under the same coach
    const coachAthletes = await this.prisma.athleteProfile.findMany({
      where: { coachId },
      select: { userId: true },
    });

    const athleteIds = coachAthletes.map((a) => a.userId);

    // Current week boundaries
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    // For each athlete: total weekly km, workout count, best pace
    const athleteStats = await Promise.all(
      athleteIds.map(async (uid) => {
        const [weeklyResults, weeklyWorkoutCount, bestPaceResult] = await Promise.all([
          this.prisma.workoutResult.findMany({
            where: {
              workout: { athleteId: uid, status: WorkoutStatus.COMPLETED, scheduledDate: { gte: weekStart, lt: weekEnd } },
            },
            select: { distanceMeters: true, durationSeconds: true, avgPace: true },
          }),
          this.prisma.workout.count({
            where: { athleteId: uid, status: WorkoutStatus.COMPLETED, scheduledDate: { gte: weekStart, lt: weekEnd } },
          }),
          this.prisma.workoutResult.findFirst({
            where: {
              workout: { athleteId: uid },
              distanceMeters: { gte: 4500, lte: 5500 }, // ~5K
            },
            orderBy: { durationSeconds: 'asc' },
            select: { durationSeconds: true, distanceMeters: true },
          }),
        ]);

        const weeklyMeters = weeklyResults.reduce((s, r) => s + r.distanceMeters, 0);
        const weeklyKm = Math.round(weeklyMeters / 10) / 100;

        // Best 5K pace string
        let best5kPace: string | null = null;
        if (bestPaceResult && bestPaceResult.distanceMeters > 0) {
          const paceSecPerKm = (bestPaceResult.durationSeconds / bestPaceResult.distanceMeters) * 1000;
          const mins = Math.floor(paceSecPerKm / 60);
          const secs = Math.round(paceSecPerKm % 60).toString().padStart(2, '0');
          best5kPace = `${mins}:${secs}`;
        }

        return {
          userId: uid,
          weeklyKm,
          workouts: weeklyWorkoutCount,
          best5kPace,
        };
      }),
    );

    // Sort by weekly km desc
    athleteStats.sort((a, b) => b.weeklyKm - a.weeklyKm);

    const groupAvgKm =
      athleteStats.length > 0
        ? Math.round((athleteStats.reduce((s, a) => s + a.weeklyKm, 0) / athleteStats.length) * 100) / 100
        : 0;

    // Build anonymous ranking — only caller sees themselves as "Você"
    const ranked = athleteStats.map((a, idx) => ({
      rank: idx + 1,
      isMe: a.userId === athleteId,
      label: a.userId === athleteId ? 'Você' : `Atleta #${idx + 1}`,
      weeklyKm: a.weeklyKm,
      workouts: a.workouts,
      best5kPace: a.best5kPace,
    }));

    const myEntry = ranked.find((r) => r.isMe);

    return {
      data: ranked,
      myRank: myEntry?.rank ?? null,
      total: ranked.length,
      groupAvgKm,
    };
  }
}
