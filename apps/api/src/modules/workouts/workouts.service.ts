import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkoutDto, SubmitResultDto } from './dto/workout.dto';
import { WorkoutStatus } from '@prisma/client';

@Injectable()
export class WorkoutsService {
  constructor(private prisma: PrismaService) {}

  async create(coachId: string, dto: CreateWorkoutDto) {
    const plan = await this.prisma.trainingPlan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Plano de treino não encontrado');
    if (plan.coachId !== coachId) throw new ForbiddenException('Acesso negado');

    return this.prisma.workout.create({
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
  }

  async getWeeklyWorkouts(athleteId: string, weekStart: string) {
    const start = new Date(weekStart);
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
    const workout = await this.prisma.workout.findUnique({ where: { id: workoutId } });
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
}
