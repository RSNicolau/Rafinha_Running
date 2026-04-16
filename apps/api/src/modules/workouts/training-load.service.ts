import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface TrainingLoadPoint {
  date: string;      // YYYY-MM-DD
  load: number;      // km run that day
  atl: number;       // Acute Training Load (7-day EMA) — fatigue
  ctl: number;       // Chronic Training Load (42-day EMA) — fitness
  tsb: number;       // Training Stress Balance (CTL - ATL) — form
}

/**
 * Calculates ATL/CTL/TSB using exponentially weighted moving averages.
 *
 * ATL (fatigue):  EMA over 7 days  — how hard you've been training recently
 * CTL (fitness):  EMA over 42 days — long-term adaptation
 * TSB (form):     CTL - ATL         — positive = fresh, negative = fatigued
 *
 * EMA formula: ema_t = ema_{t-1} + (1 / period) * (load_t - ema_{t-1})
 */
@Injectable()
export class TrainingLoadService {
  constructor(private prisma: PrismaService) {}

  async getTrainingLoad(athleteId: string, days = 60): Promise<TrainingLoadPoint[]> {
    // Fetch enough history to warm up the 42-day EMA
    const warmupDays = 42;
    const totalDays = days + warmupDays;
    const since = new Date();
    since.setDate(since.getDate() - totalDays);
    since.setHours(0, 0, 0, 0);

    // Query all completed workout results for the athlete
    const workouts = await this.prisma.workout.findMany({
      where: {
        athleteId,
        status: 'COMPLETED',
        scheduledDate: { gte: since },
      },
      include: { result: true },
      orderBy: { scheduledDate: 'asc' },
    });

    // Group km by date
    const loadByDate = new Map<string, number>();
    for (const w of workouts) {
      const dateStr = w.scheduledDate.toISOString().slice(0, 10);
      const km = w.result?.distanceMeters ? w.result.distanceMeters / 1000 : 0;
      loadByDate.set(dateStr, (loadByDate.get(dateStr) ?? 0) + km);
    }

    // Build a continuous date range
    const allDates: string[] = [];
    for (let i = totalDays; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      allDates.push(d.toISOString().slice(0, 10));
    }

    // Calculate EMAs day by day
    let atl = 0;
    let ctl = 0;
    const atlPeriod = 7;
    const ctlPeriod = 42;

    const result: TrainingLoadPoint[] = [];

    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];
      const load = loadByDate.get(date) ?? 0;

      // EMA update: ema = ema_prev + (1/period) * (load - ema_prev)
      atl = atl + (1 / atlPeriod) * (load - atl);
      ctl = ctl + (1 / ctlPeriod) * (load - ctl);
      const tsb = ctl - atl;

      // Only return the last `days` days (skip warmup period)
      if (i >= warmupDays) {
        result.push({
          date,
          load: Math.round(load * 10) / 10,
          atl: Math.round(atl * 10) / 10,
          ctl: Math.round(ctl * 10) / 10,
          tsb: Math.round(tsb * 10) / 10,
        });
      }
    }

    return result;
  }
}
