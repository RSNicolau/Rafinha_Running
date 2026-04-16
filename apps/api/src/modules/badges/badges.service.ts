import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_BADGES = [
  { key: 'first_run',         name: 'Primeira Corrida',     description: 'Completou seu primeiro treino',             icon: '🏃', category: 'milestone' },
  { key: 'streak_7',          name: 'Uma Semana Seguida',   description: '7 treinos em 7 dias consecutivos',          icon: '🔥', category: 'consistency' },
  { key: 'streak_30',         name: 'Mês Dedicado',         description: '30 treinos no mesmo mês',                   icon: '💪', category: 'consistency' },
  { key: '50km_month',        name: '50km no Mês',          description: 'Correu 50km em um único mês',               icon: '⚡', category: 'performance' },
  { key: '100km_month',       name: '100km no Mês',         description: 'Correu 100km em um único mês',              icon: '🌟', category: 'performance' },
  { key: '500km_total',       name: '500km Total',          description: 'Acumulou 500km totais',                     icon: '🏅', category: 'milestone' },
  { key: '1000km_total',      name: '1000km Total',         description: 'Acumulou 1000km totais',                    icon: '🎖️', category: 'milestone' },
  { key: 'sub30_5k',          name: 'Sub-30 nos 5K',        description: 'Completou 5K em menos de 30 minutos',       icon: '⏱️', category: 'performance' },
  { key: 'first_10k',         name: 'Primeiro 10K',         description: 'Completou uma corrida de 10km ou mais',     icon: '🎯', category: 'milestone' },
  { key: 'sub60_10k',         name: 'Sub-60 nos 10K',       description: 'Completou 10K em menos de 60 minutos',      icon: '🚀', category: 'performance' },
  { key: 'first_21k',         name: 'Primeira Meia',        description: 'Completou 21km ou mais',                    icon: '🏆', category: 'milestone' },
  { key: 'consistent_4weeks', name: '4 Semanas Consistente', description: 'Treinou 3x/semana por 4 semanas seguidas', icon: '📅', category: 'consistency' },
];

@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(private prisma: PrismaService) {}

  /** Upsert all default badges (idempotent) */
  async seedBadges() {
    for (const badge of DEFAULT_BADGES) {
      await this.prisma.badge.upsert({
        where: { key: badge.key },
        create: badge,
        update: { name: badge.name, description: badge.description, icon: badge.icon },
      });
    }
    return { seeded: DEFAULT_BADGES.length };
  }

  /** All badges with earned status for an athlete */
  async getAthleteBadges(athleteId: string) {
    const [allBadges, earnedBadges] = await Promise.all([
      this.prisma.badge.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      this.prisma.athleteBadge.findMany({
        where: { athleteId },
        include: { badge: true },
        orderBy: { earnedAt: 'desc' },
      }),
    ]);

    const earnedMap = new Map(earnedBadges.map((ab) => [ab.badgeId, ab]));

    return allBadges.map((badge) => {
      const earned = earnedMap.get(badge.id);
      return {
        ...badge,
        earned: !!earned,
        earnedAt: earned?.earnedAt ?? null,
        metadata: earned?.metadata ?? null,
      };
    });
  }

  /** Recently earned badges for an athlete (last N) */
  async getRecentBadges(athleteId: string, limit = 3) {
    return this.prisma.athleteBadge.findMany({
      where: { athleteId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
      take: limit,
    });
  }

  /** Check and award all eligible badges for an athlete */
  async checkAndAwardBadges(athleteId: string): Promise<string[]> {
    const awarded: string[] = [];

    try {
      // Ensure badges exist
      await this.ensureBadgesExist();

      const badges = await this.prisma.badge.findMany();
      const badgeMap = new Map(badges.map((b) => [b.key, b]));

      // Fetch data needed for checks
      const [completedWorkouts, allResults] = await Promise.all([
        this.prisma.workout.findMany({
          where: { athleteId, status: 'COMPLETED' },
          include: { result: true },
          orderBy: { completedAt: 'asc' },
        }),
        this.prisma.workoutResult.findMany({
          where: { workout: { athleteId } },
          select: { distanceMeters: true, durationSeconds: true, workout: { select: { completedAt: true, scheduledDate: true } } },
        }),
      ]);

      const totalKm = allResults.reduce((s, r) => s + (r.distanceMeters / 1000), 0);

      const checks: Array<{ key: string; condition: boolean; metadata?: Record<string, unknown> }> = [
        // Milestone: first run
        { key: 'first_run', condition: completedWorkouts.length >= 1 },

        // Total km milestones
        { key: '500km_total',  condition: totalKm >= 500,  metadata: { km: Math.round(totalKm) } },
        { key: '1000km_total', condition: totalKm >= 1000, metadata: { km: Math.round(totalKm) } },

        // 10K distance milestone
        {
          key: 'first_10k',
          condition: allResults.some((r) => r.distanceMeters >= 10000),
        },

        // 21K distance milestone
        {
          key: 'first_21k',
          condition: allResults.some((r) => r.distanceMeters >= 21000),
        },

        // Performance: sub-30 5K (30min = 1800s, with at least 4.5km)
        {
          key: 'sub30_5k',
          condition: allResults.some(
            (r) => r.distanceMeters >= 4500 && r.distanceMeters <= 6000 && r.durationSeconds <= 1800,
          ),
        },

        // Performance: sub-60 10K
        {
          key: 'sub60_10k',
          condition: allResults.some(
            (r) => r.distanceMeters >= 9500 && r.distanceMeters <= 12000 && r.durationSeconds <= 3600,
          ),
        },

        // Monthly km checks (check current and previous month)
        ...this.checkMonthlyKm(allResults),

        // Streak checks
        ...this.checkStreaks(completedWorkouts),
      ];

      for (const check of checks) {
        if (!check.condition) continue;
        const badge = badgeMap.get(check.key);
        if (!badge) continue;

        const alreadyEarned = await this.prisma.athleteBadge.findUnique({
          where: { athleteId_badgeId: { athleteId, badgeId: badge.id } },
        });
        if (alreadyEarned) continue;

        await this.prisma.athleteBadge.create({
          data: {
            athleteId,
            badgeId: badge.id,
            metadata: check.metadata ? (check.metadata as any) : undefined,
          },
        });

        awarded.push(check.key);
        this.logger.log(`Badge awarded: ${check.key} → athlete ${athleteId}`);
      }
    } catch (err: any) {
      this.logger.error(`checkAndAwardBadges error: ${err.message}`);
    }

    return awarded;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private checkMonthlyKm(results: Array<{ distanceMeters: number; workout: { completedAt: Date | null; scheduledDate: Date } }>) {
    const kmByMonth = new Map<string, number>();
    for (const r of results) {
      const date = r.workout.completedAt ?? r.workout.scheduledDate;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      kmByMonth.set(key, (kmByMonth.get(key) ?? 0) + r.distanceMeters / 1000);
    }

    const maxKm = Math.max(0, ...kmByMonth.values());
    return [
      { key: '50km_month',  condition: maxKm >= 50,  metadata: { km: Math.round(maxKm) } },
      { key: '100km_month', condition: maxKm >= 100, metadata: { km: Math.round(maxKm) } },
    ];
  }

  private checkStreaks(workouts: Array<{ completedAt: Date | null; scheduledDate: Date }>) {
    if (workouts.length === 0) return [
      { key: 'streak_7', condition: false },
      { key: 'streak_30', condition: false },
      { key: 'consistent_4weeks', condition: false },
    ];

    // Get unique dates sorted
    const dates = [...new Set(
      workouts.map((w) => (w.completedAt ?? w.scheduledDate).toISOString().slice(0, 10)),
    )].sort();

    // Max consecutive day streak
    let maxStreak = 1;
    let cur = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        cur++;
        maxStreak = Math.max(maxStreak, cur);
      } else {
        cur = 1;
      }
    }

    // Monthly count streak (3+ sessions per week for 4 weeks)
    const weeklyMap = new Map<string, number>();
    for (const d of dates) {
      const date = new Date(d);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);
      weeklyMap.set(weekKey, (weeklyMap.get(weekKey) ?? 0) + 1);
    }
    const weekKeys = [...weeklyMap.keys()].sort();
    let consistentWeeks = 0;
    let maxConsistentWeeks = 0;
    for (const wk of weekKeys) {
      if ((weeklyMap.get(wk) ?? 0) >= 3) {
        consistentWeeks++;
        maxConsistentWeeks = Math.max(maxConsistentWeeks, consistentWeeks);
      } else {
        consistentWeeks = 0;
      }
    }

    return [
      { key: 'streak_7',          condition: maxStreak >= 7 },
      { key: 'streak_30',         condition: dates.length >= 30 },
      { key: 'consistent_4weeks', condition: maxConsistentWeeks >= 4 },
    ];
  }

  private async ensureBadgesExist() {
    const count = await this.prisma.badge.count();
    if (count === 0) await this.seedBadges();
  }
}
