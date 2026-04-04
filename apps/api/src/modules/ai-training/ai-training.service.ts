import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkoutType, HeartRateZone, AthleteLevel, WorkoutStatus } from '@prisma/client';
import { GeneratePlanDto, TrainingGoal } from './dto/generate-plan.dto';

interface WorkoutTemplate {
  type: WorkoutType;
  title: string;
  description: string;
  targetDistanceMeters: number;
  targetDurationSeconds: number;
  targetPace: string;
  heartRateZone: HeartRateZone;
  coachNotes?: string;
}

@Injectable()
export class AiTrainingService {
  private readonly logger = new Logger(AiTrainingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Analyze athlete data and generate a training plan.
   * Rule-based engine using periodization principles.
   */
  async generatePlan(coachId: string, dto: GeneratePlanDto) {
    const athlete = await this.prisma.user.findUnique({
      where: { id: dto.athleteId },
      include: { athleteProfile: true },
    });

    if (!athlete) throw new NotFoundException('Atleta não encontrado');

    const profile = athlete.athleteProfile;
    const level = profile?.level || AthleteLevel.BEGINNER;
    const maxHR = profile?.maxHR || this.estimateMaxHR(athlete.dateOfBirth ?? null);
    const weeklyGoalKm = profile?.weeklyGoalKm || this.getDefaultWeeklyKm(level);
    const vo2max = profile?.vo2max;

    // Analyze recent workout history (last 4 weeks)
    const recentWorkouts = await this.prisma.workoutResult.findMany({
      where: {
        workout: {
          athleteId: dto.athleteId,
          scheduledDate: { gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000) },
          status: WorkoutStatus.COMPLETED,
        },
      },
      include: { workout: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const avgPaceSeconds = this.calculateAvgPace(recentWorkouts);
    const weeklyKmActual = this.calculateWeeklyKm(recentWorkouts);
    const athleteDateOfBirth = athlete.dateOfBirth;

    // Analyze subjective feedback from recent workouts
    const feedbackData = recentWorkouts.filter(w => w.rpe != null || w.sensationScore != null);
    const avgRpe = feedbackData.length > 0
      ? feedbackData.reduce((sum, w) => sum + (w.rpe ?? 5), 0) / feedbackData.length
      : 5;
    const avgSensation = feedbackData.length > 0
      ? feedbackData.reduce((sum, w) => sum + (w.sensationScore ?? 3), 0) / feedbackData.length
      : 3;

    // Adjust volume based on feedback signals
    let volumeMultiplier = 1.0;
    if (avgRpe >= 9.5) volumeMultiplier = 0.70;
    else if (avgRpe >= 8.5) volumeMultiplier = 0.85;
    else if (avgRpe >= 8.0) volumeMultiplier = 0.92;
    if (avgSensation <= 2.0) volumeMultiplier *= 0.90;

    const feedbackNote = feedbackData.length > 0
      ? `RPE médio recente: ${avgRpe.toFixed(1)}/10, sensação: ${avgSensation.toFixed(1)}/5.${volumeMultiplier < 1 ? ` Volume ajustado −${Math.round((1 - volumeMultiplier) * 100)}% com base no feedback.` : ''}`
      : '';

    // Determine training zones
    const zones = this.calculateHRZones(maxHR);

    // Generate week structure based on goal and level
    const weeklyStructure = this.getWeeklyStructure(dto.goal, level, dto.weeks);

    // Generate workout templates for each week
    const planWorkouts: Array<WorkoutTemplate & { weekDay: number; weekNumber: number }> = [];

    const baseKm = Math.max(weeklyKmActual * 0.8, this.getMinStartKm(level)) * volumeMultiplier;

    for (let week = 1; week <= dto.weeks; week++) {
      const phase = this.getPhase(week, dto.weeks);
      const weeklyVolume = this.calculateWeeklyVolume(baseKm, week, dto.weeks, phase);
      const weekWorkouts = this.generateWeekWorkouts(
        weeklyStructure,
        weeklyVolume,
        avgPaceSeconds,
        zones,
        level,
        phase,
        dto.goal,
        week,
      );

      planWorkouts.push(...weekWorkouts);
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : this.nextMonday();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + dto.weeks * 7);

    // If planId provided, add workouts to existing plan
    if (dto.planId) {
      const plan = await this.prisma.trainingPlan.findFirst({
        where: { id: dto.planId, coachId },
      });
      if (!plan) throw new NotFoundException('Plano não encontrado');

      await this.createWorkoutsForPlan(plan.id, dto.athleteId, startDate, planWorkouts);

      return {
        planId: plan.id,
        generatedWorkouts: planWorkouts.length,
        weeks: dto.weeks,
        goal: dto.goal,
        level,
        analysis: { ...this.buildAnalysisReport(profile, athlete.dateOfBirth, recentWorkouts, avgPaceSeconds, weeklyKmActual), feedbackNote, volumeMultiplier },
      };
    }

    // Otherwise create a new plan
    const planName = this.getPlanName(dto.goal, dto.weeks);
    const plan = await this.prisma.trainingPlan.create({
      data: {
        coachId,
        athleteId: dto.athleteId,
        name: planName,
        description: this.getPlanDescription(dto.goal, level, dto.weeks),
        startDate,
        endDate,
        weeklyFrequency: weeklyStructure.frequency,
        status: 'DRAFT',
      },
    });

    await this.createWorkoutsForPlan(plan.id, dto.athleteId, startDate, planWorkouts);

    this.logger.log(`Generated plan ${plan.id} with ${planWorkouts.length} workouts for athlete ${dto.athleteId}`);

    return {
      planId: plan.id,
      planName,
      generatedWorkouts: planWorkouts.length,
      weeks: dto.weeks,
      goal: dto.goal,
      level,
      analysis: { ...this.buildAnalysisReport(profile, athlete.dateOfBirth, recentWorkouts, avgPaceSeconds, weeklyKmActual), feedbackNote, volumeMultiplier },
      preview: planWorkouts.slice(0, 7).map((w) => ({
        week: w.weekNumber,
        day: w.weekDay,
        type: w.type,
        title: w.title,
        distance: `${(w.targetDistanceMeters / 1000).toFixed(1)}km`,
        pace: w.targetPace,
      })),
    };
  }

  // ── Private: Analysis Helpers ──

  private estimateMaxHR(dateOfBirth?: Date | null): number {
    if (!dateOfBirth) return 180;
    const age = Math.floor((Date.now() - dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return 220 - age;
  }

  private getDefaultWeeklyKm(level: AthleteLevel): number {
    const map: Record<AthleteLevel, number> = {
      BEGINNER: 20,
      INTERMEDIATE: 35,
      ADVANCED: 55,
      ELITE: 80,
    };
    return map[level];
  }

  private getMinStartKm(level: AthleteLevel): number {
    const map: Record<AthleteLevel, number> = {
      BEGINNER: 15,
      INTERMEDIATE: 25,
      ADVANCED: 40,
      ELITE: 60,
    };
    return map[level];
  }

  private calculateAvgPace(workouts: any[]): number {
    if (!workouts.length) return 360; // 6:00 /km default
    const paces = workouts
      .filter((w) => w.distanceMeters > 0)
      .map((w) => (w.durationSeconds / w.distanceMeters) * 1000);
    return paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : 360;
  }

  private calculateWeeklyKm(workouts: any[]): number {
    if (!workouts.length) return 0;
    const totalMeters = workouts.reduce((sum, w) => sum + (w.distanceMeters || 0), 0);
    return (totalMeters / 1000) / 4; // 4 weeks
  }

  private calculateHRZones(maxHR: number) {
    return {
      z1: { min: Math.round(maxHR * 0.50), max: Math.round(maxHR * 0.60) },
      z2: { min: Math.round(maxHR * 0.60), max: Math.round(maxHR * 0.70) },
      z3: { min: Math.round(maxHR * 0.70), max: Math.round(maxHR * 0.80) },
      z4: { min: Math.round(maxHR * 0.80), max: Math.round(maxHR * 0.90) },
      z5: { min: Math.round(maxHR * 0.90), max: maxHR },
    };
  }

  private getWeeklyStructure(goal: TrainingGoal, level: AthleteLevel, weeks: number) {
    const frequency = level === AthleteLevel.BEGINNER ? 3
      : level === AthleteLevel.INTERMEDIATE ? 4
      : level === AthleteLevel.ADVANCED ? 5 : 6;

    // Workout days in a week (0=Mon, 6=Sun)
    const dayPatterns: Record<number, number[]> = {
      3: [1, 3, 6],       // Tue, Thu, Sun
      4: [1, 3, 5, 6],    // Tue, Thu, Sat, Sun
      5: [1, 2, 4, 5, 6], // Tue, Wed, Fri, Sat, Sun
      6: [0, 1, 3, 4, 5, 6], // Mon through Sat
    };

    return { frequency, days: dayPatterns[frequency] };
  }

  private getPhase(week: number, totalWeeks: number): 'base' | 'build' | 'peak' | 'taper' {
    const pct = week / totalWeeks;
    if (pct <= 0.35) return 'base';
    if (pct <= 0.70) return 'build';
    if (pct <= 0.90) return 'peak';
    return 'taper';
  }

  private calculateWeeklyVolume(baseKm: number, week: number, totalWeeks: number, phase: string): number {
    // 10% rule: increase by ~10% per week, with a recovery week every 4th week
    const isRecoveryWeek = week % 4 === 0;

    let volume = baseKm;
    const progressWeeks = Math.min(week, totalWeeks);

    if (phase === 'base') volume = baseKm * (1 + (progressWeeks - 1) * 0.08);
    else if (phase === 'build') volume = baseKm * 1.3 * (1 + (progressWeeks - totalWeeks * 0.35) * 0.07);
    else if (phase === 'peak') volume = baseKm * 1.7;
    else volume = baseKm * 1.2; // taper

    if (isRecoveryWeek) volume *= 0.7;

    return Math.round(volume * 10) / 10;
  }

  private generateWeekWorkouts(
    structure: ReturnType<typeof this.getWeeklyStructure>,
    weeklyKm: number,
    avgPaceSeconds: number,
    zones: ReturnType<typeof this.calculateHRZones>,
    level: AthleteLevel,
    phase: string,
    goal: TrainingGoal,
    weekNumber: number,
  ): Array<WorkoutTemplate & { weekDay: number; weekNumber: number }> {
    const workouts: Array<WorkoutTemplate & { weekDay: number; weekNumber: number }> = [];
    const days = structure.days;

    // Distribute volume: long run = 30-35%, intervals = 20%, easy = rest
    const longRunKm = Math.round(weeklyKm * 0.32 * 10) / 10;
    const intervalKm = Math.round(weeklyKm * 0.18 * 10) / 10;
    const easyKm = Math.round((weeklyKm - longRunKm - intervalKm) / Math.max(1, days.length - 2) * 10) / 10;

    const hasTempo = phase === 'build' || phase === 'peak';
    const hasIntervals = goal !== TrainingGoal.BASE_BUILDING && goal !== TrainingGoal.RECOVERY && phase !== 'base';

    days.forEach((dayIndex, i) => {
      let workout: WorkoutTemplate;

      if (i === days.length - 1) {
        // Last day = long run
        workout = this.buildLongRun(longRunKm, avgPaceSeconds, zones, level, phase);
      } else if (hasIntervals && i === 1) {
        // Second day = interval or tempo
        workout = hasTempo
          ? this.buildTempo(intervalKm, avgPaceSeconds, zones, goal)
          : this.buildInterval(intervalKm, avgPaceSeconds, zones, goal, level);
      } else if (hasIntervals && i === Math.floor(days.length / 2)) {
        workout = this.buildInterval(intervalKm * 0.8, avgPaceSeconds, zones, goal, level);
      } else {
        workout = this.buildEasyRun(easyKm, avgPaceSeconds, zones, phase);
      }

      workouts.push({ ...workout, weekDay: dayIndex, weekNumber });
    });

    return workouts;
  }

  private buildEasyRun(km: number, paceSeconds: number, zones: any, phase: string): WorkoutTemplate {
    const easyPace = paceSeconds * 1.15; // 15% slower than avg
    return {
      type: WorkoutType.EASY_RUN,
      title: `Corrida Fácil ${km}km`,
      description: `Corrida leve em zona aeróbica. Mantenha conversação confortável durante todo o treino.`,
      targetDistanceMeters: Math.round(km * 1000),
      targetDurationSeconds: Math.round(km * easyPace),
      targetPace: this.secondsToPace(easyPace),
      heartRateZone: HeartRateZone.Z2_EASY,
      coachNotes: `Foco: ${phase === 'taper' ? 'recuperação e manutenção' : 'construção aeróbica'}. FC: ${zones.z2.min}-${zones.z2.max} bpm.`,
    };
  }

  private buildLongRun(km: number, paceSeconds: number, zones: any, level: AthleteLevel, phase: string): WorkoutTemplate {
    const longPace = paceSeconds * 1.1;
    return {
      type: WorkoutType.LONG_RUN,
      title: `Corrida Longa ${km}km`,
      description: `Treino longo fundamental. Pace confortável e consistente para desenvolvimento aeróbico e resistência.`,
      targetDistanceMeters: Math.round(km * 1000),
      targetDurationSeconds: Math.round(km * longPace),
      targetPace: this.secondsToPace(longPace),
      heartRateZone: HeartRateZone.Z2_EASY,
      coachNotes: `Foco: resistência e eficiência. FC: ${zones.z2.min}-${zones.z3.min} bpm. ${phase === 'peak' ? 'Simule condições de prova.' : ''}`,
    };
  }

  private buildTempo(km: number, paceSeconds: number, zones: any, goal: TrainingGoal): WorkoutTemplate {
    const tempoPace = paceSeconds * 0.95; // slightly faster than avg
    return {
      type: WorkoutType.TEMPO,
      title: `Tempo Run ${km}km`,
      description: `Aquecimento 10min → ${(km * 0.7).toFixed(1)}km em ritmo de limiar → Desaquecimento 10min`,
      targetDistanceMeters: Math.round(km * 1000),
      targetDurationSeconds: Math.round(km * tempoPace + 1200),
      targetPace: this.secondsToPace(tempoPace),
      heartRateZone: HeartRateZone.Z4_THRESHOLD,
      coachNotes: `Ritmo sustentável por ~1h. FC: ${zones.z4.min}-${zones.z4.max} bpm. "Comfortably hard".`,
    };
  }

  private buildInterval(km: number, paceSeconds: number, zones: any, goal: TrainingGoal, level: AthleteLevel): WorkoutTemplate {
    const intervalPace = paceSeconds * 0.88; // ~5K pace
    const repsMap: Record<string, string> = {
      RACE_PREP_5K: '6x800m c/ 2min descanso',
      RACE_PREP_10K: '5x1000m c/ 90s descanso',
      RACE_PREP_HALF: '4x1600m c/ 2min descanso',
      RACE_PREP_MARATHON: '3x3000m c/ 2min descanso',
    };
    const reps = repsMap[goal] || '6x400m c/ 1min descanso';

    return {
      type: WorkoutType.INTERVAL,
      title: `Tiro ${reps.split(' ')[0]}`,
      description: `Aquecimento 10min → ${reps} → Desaquecimento 10min`,
      targetDistanceMeters: Math.round(km * 1000),
      targetDurationSeconds: Math.round(km * intervalPace + 1200),
      targetPace: this.secondsToPace(intervalPace),
      heartRateZone: HeartRateZone.Z5_MAXIMUM,
      coachNotes: `Tiros em esforço máximo sustentado. FC: ${zones.z5.min}+ bpm. Recuperação completa entre tiros.`,
    };
  }

  private secondsToPace(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  private nextMonday(): Date {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private async createWorkoutsForPlan(
    planId: string,
    athleteId: string,
    startDate: Date,
    workouts: Array<WorkoutTemplate & { weekDay: number; weekNumber: number }>,
  ) {
    for (const w of workouts) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + (w.weekNumber - 1) * 7 + w.weekDay);

      await this.prisma.workout.create({
        data: {
          planId,
          athleteId,
          scheduledDate,
          type: w.type,
          title: w.title,
          description: w.description,
          targetDistanceMeters: w.targetDistanceMeters,
          targetDurationSeconds: w.targetDurationSeconds,
          targetPace: w.targetPace,
          heartRateZone: w.heartRateZone,
          coachNotes: w.coachNotes,
          status: WorkoutStatus.SCHEDULED,
        },
      });
    }
  }

  private getPlanName(goal: TrainingGoal, weeks: number): string {
    const names: Record<TrainingGoal, string> = {
      BASE_BUILDING: `Construção de Base ${weeks} Semanas`,
      RACE_PREP_5K: `Preparação 5K ${weeks} Semanas`,
      RACE_PREP_10K: `Preparação 10K ${weeks} Semanas`,
      RACE_PREP_HALF: `Preparação Meia Maratona ${weeks} Semanas`,
      RACE_PREP_MARATHON: `Preparação Maratona ${weeks} Semanas`,
      WEIGHT_LOSS: `Emagrecimento e Condicionamento ${weeks} Semanas`,
      IMPROVE_PACE: `Melhoria de Pace ${weeks} Semanas`,
      RECOVERY: `Recuperação e Manutenção ${weeks} Semanas`,
    };
    return names[goal];
  }

  private getPlanDescription(goal: TrainingGoal, level: AthleteLevel, weeks: number): string {
    const levelStr = { BEGINNER: 'iniciante', INTERMEDIATE: 'intermediário', ADVANCED: 'avançado', ELITE: 'elite' }[level];
    return `Plano gerado por IA para atleta ${levelStr}. Objetivo: ${this.getPlanName(goal, weeks)}. Inclui periodização com fases de base, construção e pico.`;
  }

  private buildAnalysisReport(profile: any, dateOfBirth: Date | null | undefined, recentWorkouts: any[], avgPace: number, weeklyKm: number) {
    return {
      athleteLevel: profile?.level || 'BEGINNER',
      recentWeeklyKm: Math.round(weeklyKm * 10) / 10,
      avgPace: this.secondsToPace(avgPace),
      workoutsAnalyzed: recentWorkouts.length,
      estimatedMaxHR: this.estimateMaxHR(dateOfBirth ?? null),
      vo2max: profile?.vo2max,
      recommendation: weeklyKm < 20
        ? 'Foco em construção gradual de volume'
        : weeklyKm < 50
        ? 'Boa base — prontos para treinos de qualidade'
        : 'Volume alto — incluir mais trabalho de velocidade',
    };
  }
}
