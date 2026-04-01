import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkoutStatus } from '@prisma/client';

export interface RankingEntry {
  position: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: number;
  unit: string;
}

@Injectable()
export class RankingsService {
  constructor(private prisma: PrismaService) {}

  async getTopByKm(period: 'all' | 'monthly' = 'all', limit = 20): Promise<RankingEntry[]> {
    limit = Math.min(Math.max(1, Number(limit) || 20), 100);
    let dateFilter = {};

    if (period === 'monthly') {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { createdAt: { gte: firstDayOfMonth } };
    }

    const results = await this.prisma.workoutResult.groupBy({
      by: ['workoutId'],
      _sum: { distanceMeters: true },
      where: {
        ...dateFilter,
        workout: { status: WorkoutStatus.COMPLETED },
      },
    });

    // Precisamos agregar por athleteId via workout
    // Usar raw query para performance em larga escala
    const periodLabel = period === 'monthly' ? 'mes' : 'geral';

    const rawQuery = period === 'monthly'
      ? await this.prisma.$queryRaw<Array<{ user_id: string; name: string; avatar_url: string | null; total_meters: bigint }>>`
          SELECT w.athlete_id as user_id, u.name, u.avatar_url,
                 SUM(wr.distance_meters) as total_meters
          FROM workout_results wr
          INNER JOIN workouts w ON w.id = wr.workout_id
          INNER JOIN users u ON u.id = w.athlete_id
          WHERE w.status = 'COMPLETED'
            AND wr.created_at >= date_trunc('month', CURRENT_DATE)
          GROUP BY w.athlete_id, u.name, u.avatar_url
          ORDER BY total_meters DESC
          LIMIT ${limit}
        `
      : await this.prisma.$queryRaw<Array<{ user_id: string; name: string; avatar_url: string | null; total_meters: bigint }>>`
          SELECT w.athlete_id as user_id, u.name, u.avatar_url,
                 SUM(wr.distance_meters) as total_meters
          FROM workout_results wr
          INNER JOIN workouts w ON w.id = wr.workout_id
          INNER JOIN users u ON u.id = w.athlete_id
          WHERE w.status = 'COMPLETED'
          GROUP BY w.athlete_id, u.name, u.avatar_url
          ORDER BY total_meters DESC
          LIMIT ${limit}
        `;

    return rawQuery.map((row, index) => ({
      position: index + 1,
      userId: row.user_id,
      name: row.name,
      avatarUrl: row.avatar_url,
      value: Math.round(Number(row.total_meters) / 10) / 100, // metros -> km com 2 casas
      unit: 'km',
    }));
  }

  async getTopByWorkouts(limit = 20): Promise<RankingEntry[]> {
    limit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const rawQuery = await this.prisma.$queryRaw<
      Array<{ user_id: string; name: string; avatar_url: string | null; total_workouts: bigint }>
    >`
      SELECT w.athlete_id as user_id, u.name, u.avatar_url,
             COUNT(*) as total_workouts
      FROM workouts w
      INNER JOIN users u ON u.id = w.athlete_id
      WHERE w.status = 'COMPLETED'
      GROUP BY w.athlete_id, u.name, u.avatar_url
      ORDER BY total_workouts DESC
      LIMIT ${limit}
    `;

    return rawQuery.map((row, index) => ({
      position: index + 1,
      userId: row.user_id,
      name: row.name,
      avatarUrl: row.avatar_url,
      value: Number(row.total_workouts),
      unit: 'treinos',
    }));
  }

  async getTopByStreak(limit = 20): Promise<RankingEntry[]> {
    // Calcular streak: dias consecutivos com treinos concluidos
    // Buscar todos os atletas com treinos completos, agrupados por dia
    const athleteDays = await this.prisma.$queryRaw<
      Array<{ user_id: string; name: string; avatar_url: string | null; workout_date: Date }>
    >`
      SELECT DISTINCT w.athlete_id as user_id, u.name, u.avatar_url,
             DATE(w.completed_at) as workout_date
      FROM workouts w
      INNER JOIN users u ON u.id = w.athlete_id
      WHERE w.status = 'COMPLETED'
        AND w.completed_at IS NOT NULL
      ORDER BY w.athlete_id, workout_date DESC
    `;

    // Agrupar por usuario e calcular streak atual
    const streakMap = new Map<string, { name: string; avatarUrl: string | null; streak: number }>();

    let currentUserId: string | null = null;
    let currentStreak = 0;
    let lastDate: Date | null = null;

    for (const row of athleteDays) {
      if (row.user_id !== currentUserId) {
        // Salvar streak anterior
        if (currentUserId && currentStreak > 0) {
          const existing = streakMap.get(currentUserId);
          if (!existing || currentStreak > existing.streak) {
            streakMap.set(currentUserId, {
              name: athleteDays.find(r => r.user_id === currentUserId)!.name,
              avatarUrl: athleteDays.find(r => r.user_id === currentUserId)!.avatar_url,
              streak: currentStreak,
            });
          }
        }
        currentUserId = row.user_id;
        currentStreak = 1;
        lastDate = new Date(row.workout_date);
        continue;
      }

      const currentDate = new Date(row.workout_date);
      if (lastDate) {
        const diffDays = Math.round((lastDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          currentStreak++;
        } else if (diffDays > 1) {
          // Streak quebrou, verificar se o atual e valido (conectado a hoje)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const firstStreakDate = new Date(lastDate);
          // Apenas considerar streak se o primeiro dia (mais recente) for hoje ou ontem
          const daysSinceLastWorkout = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysSinceLastWorkout <= 1) {
            streakMap.set(currentUserId, {
              name: row.name,
              avatarUrl: row.avatar_url,
              streak: currentStreak,
            });
          }

          // Reiniciar streak a partir deste ponto
          currentStreak = 1;
        }
      }
      lastDate = currentDate;
    }

    // Salvar ultimo usuario
    if (currentUserId && currentStreak > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (lastDate) {
        // Para o streak ser "atual", o dia mais recente precisa ser hoje ou ontem
        const firstRow = athleteDays.find(r => r.user_id === currentUserId);
        if (firstRow) {
          const mostRecentDate = new Date(firstRow.workout_date);
          const daysSince = Math.round((today.getTime() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince <= 1) {
            const existing = streakMap.get(currentUserId);
            if (!existing || currentStreak > existing.streak) {
              streakMap.set(currentUserId, {
                name: firstRow.name,
                avatarUrl: firstRow.avatar_url,
                streak: currentStreak,
              });
            }
          }
        }
      }
    }

    // Ordenar por streak desc e limitar
    const sorted = Array.from(streakMap.entries())
      .sort((a, b) => b[1].streak - a[1].streak)
      .slice(0, limit);

    return sorted.map(([userId, data], index) => ({
      position: index + 1,
      userId,
      name: data.name,
      avatarUrl: data.avatarUrl,
      value: data.streak,
      unit: 'dias',
    }));
  }
}
