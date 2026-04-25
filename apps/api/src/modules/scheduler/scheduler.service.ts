import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { EmailService } from '../email/email.service';
import { RankingsService } from '../rankings/rankings.service';
import { CoachBrainService } from '../coach-brain/coach-brain.service';
import { SubscriptionStatus, WorkoutStatus, InviteStatus, NotificationType, PlanStatus } from '@prisma/client';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly email: EmailService,
    private readonly rankings: RankingsService,
    private readonly coachBrain: CoachBrainService,
  ) {}

  /** Daily 9AM — remind users whose subscription expires within 3 days */
  @Cron('0 9 * * *', { name: 'subscription-renewal-reminders' })
  async handleSubscriptionReminders() {
    this.logger.log('Running subscription renewal reminders...');
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const expiringSubscriptions = await this.prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: { lte: threeDaysFromNow, gte: new Date() },
          cancelAtPeriodEnd: false,
        },
        include: { user: { select: { email: true, name: true } } },
      });

      for (const sub of expiringSubscriptions) {
        await this.email.sendSubscriptionReminder(sub.user.email ?? '', sub.user.name, sub.currentPeriodEnd);
      }

      this.logger.log(`Sent ${expiringSubscriptions.length} subscription reminders`);
    } catch (err) {
      this.logger.error(`Subscription reminders failed: ${err}`);
    }
  }

  /** Monday 8AM — weekly digest for coaches */
  @Cron('0 8 * * 1', { name: 'weekly-coach-digest' })
  async handleWeeklyCoachDigest() {
    this.logger.log('Running weekly coach digest...');
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const coaches = await this.prisma.user.findMany({
        where: { role: 'COACH', deletedAt: null },
        select: { id: true, email: true, name: true },
      });

      for (const coach of coaches) {
        const athletes = await this.prisma.athleteProfile.findMany({
          where: { coachId: coach.id, user: { deletedAt: null } },
          select: { userId: true },
        });
        if (!athletes.length) continue;

        const athleteUserIds = athletes.map((a) => a.userId);

        const completedCount = await this.prisma.workout.count({
          where: {
            athleteId: { in: athleteUserIds },
            status: WorkoutStatus.COMPLETED,
            completedAt: { gte: oneWeekAgo },
          },
        });

        const totalCount = await this.prisma.workout.count({
          where: {
            athleteId: { in: athleteUserIds },
            scheduledDate: { gte: oneWeekAgo },
          },
        });

        await this.email.sendWeeklyDigest(
          coach.email ?? '',
          coach.name,
          athletes.length,
          completedCount,
          totalCount,
        );
      }

      this.logger.log(`Sent weekly digest to ${coaches.length} coaches`);
    } catch (err) {
      this.logger.error(`Weekly digest failed: ${err}`);
    }
  }

  /** Daily 3AM — cleanup expired tokens and sessions */
  @Cron('0 3 * * *', { name: 'cleanup-expired-tokens' })
  async handleCleanupExpiredTokens() {
    this.logger.log('Running expired token cleanup...');
    try {
      const expiredConfigs = await this.prisma.appConfig.findMany({
        where: { key: { startsWith: 'password_reset:' } },
      });

      let cleaned = 0;
      for (const config of expiredConfigs) {
        const value = config.value as any;
        if (value?.expiresAt && new Date(value.expiresAt) < new Date()) {
          await this.prisma.appConfig.delete({ where: { id: config.id } });
          cleaned++;
        }
      }

      // Clean expired invites
      const expiredInvites = await this.prisma.coachInvite.updateMany({
        where: {
          status: InviteStatus.PENDING,
          expiresAt: { lt: new Date() },
        },
        data: { status: InviteStatus.EXPIRED },
      });

      this.logger.log(`Cleaned ${cleaned} expired tokens, ${expiredInvites.count} expired invites`);
    } catch (err) {
      this.logger.error(`Token cleanup failed: ${err}`);
    }
  }

  /** Every 6 hours — pre-warm rankings cache */
  @Cron('0 */6 * * *', { name: 'rankings-cache-warmup' })
  async handleRankingsCacheWarmup() {
    this.logger.log('Warming rankings cache...');
    try {
      const periods = ['week', 'month', 'year', 'all'] as const;
      for (const period of periods) {
        await this.rankings.getTopByKm(period, 20);
        await this.rankings.getTopByWorkouts(period, 20);
      }
      await this.rankings.getTopByStreak(20);
      this.logger.log('Rankings cache warmed');
    } catch (err) {
      this.logger.error(`Rankings warmup failed: ${err}`);
    }
  }

  /** Daily 2AM — proactively refresh integration tokens expiring within 24h */
  @Cron('0 2 * * *', { name: 'refresh-integration-tokens' })
  async handleRefreshIntegrationTokens() {
    this.logger.log('Checking integration tokens for proactive refresh...');
    try {
      const oneDayFromNow = new Date();
      oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

      const expiringIntegrations = await this.prisma.fitnessIntegration.findMany({
        where: {
          isActive: true,
          refreshToken: { not: null },
          expiresAt: { lte: oneDayFromNow, gte: new Date() },
        },
      });

      this.logger.log(`Found ${expiringIntegrations.length} integrations needing token refresh`);
      // Token refresh is handled by each integration service on next sync.
      // Here we just invalidate the cache to force a fresh fetch.
      for (const integration of expiringIntegrations) {
        await this.cache.del(`integration:${integration.id}`);
      }
    } catch (err) {
      this.logger.error(`Token refresh check failed: ${err}`);
    }
  }

  /** Every 5 minutes — retry failed AI jobs */
  @Cron('*/5 * * * *', { name: 'ai-job-retry' })
  async handleAIJobRetry() {
    try {
      await this.coachBrain.processFailedJobs();
    } catch (err) {
      this.logger.error(`AI job retry failed: ${err}`);
    }
  }

  /** Sunday 18h — weekly summary email for each active athlete */
  @Cron('0 18 * * 0', { name: 'weekly-athlete-summary' })
  async sendWeeklySummary() {
    this.logger.log('Running weekly athlete summary...');
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Find athletes that have an active training plan
      const athletes = await this.prisma.user.findMany({
        where: {
          role: 'ATHLETE',
          deletedAt: null,
          athleteProfile: { coachId: { not: null } },
          athletePlans: {
            some: { status: PlanStatus.ACTIVE },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          athleteProfile: {
            select: { coachId: true },
          },
        },
      });

      for (const athlete of athletes) {
        try {
          // Workouts completed this week
          const workoutsThisWeek = await this.prisma.workout.findMany({
            where: {
              athleteId: athlete.id,
              status: WorkoutStatus.COMPLETED,
              completedAt: { gte: sevenDaysAgo },
            },
            include: { result: true },
          });

          const totalWorkouts = workoutsThisWeek.length;
          if (totalWorkouts === 0) continue;

          const totalKm = workoutsThisWeek.reduce((acc, w) => {
            return acc + (w.result ? w.result.distanceMeters / 1000 : 0);
          }, 0);

          // Find coach name
          let coachName = 'Seu Coach';
          if (athlete.athleteProfile?.coachId) {
            const coach = await this.prisma.user.findUnique({
              where: { id: athlete.athleteProfile.coachId },
              select: { name: true },
            });
            if (coach?.name) coachName = coach.name;
          }

          // Calculate streak (consecutive days with workouts)
          const workoutDates = new Set(
            workoutsThisWeek.map(w => w.completedAt?.toDateString()).filter(Boolean),
          );
          const streak = workoutDates.size;

          // Best avg pace from results
          const paces = workoutsThisWeek
            .map(w => w.result?.avgPace)
            .filter((p): p is string => !!p);
          const avgPace = paces.length > 0 ? paces[0] : undefined;

          await this.email.sendWeeklySummary(athlete.email ?? '', athlete.name, {
            totalKm: Math.round(totalKm * 10) / 10,
            totalWorkouts,
            avgPace,
            streak,
            coachName,
          });
        } catch (athleteErr) {
          this.logger.warn(`Weekly summary failed for athlete ${athlete.id}: ${athleteErr}`);
        }
      }

      this.logger.log(`Sent weekly summaries to ${athletes.length} athletes`);
    } catch (err) {
      this.logger.error(`Weekly summary cron failed: ${err}`);
    }
  }

  /** Sunday 18h BRT — athlete weekly summary email (new template with bestPace & streak) */
  @Cron('0 21 * * 0', { name: 'athlete-weekly-summary-v2' })
  async sendAthleteWeeklySummaries() {
    this.logger.log('Sending athlete weekly summary emails...');
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const athletes = await this.prisma.user.findMany({
        where: { role: 'ATHLETE', deletedAt: null },
        select: { id: true, name: true, email: true },
      });

      for (const athlete of athletes) {
        try {
          const workouts = await this.prisma.workout.findMany({
            where: {
              athleteId: athlete.id,
              status: WorkoutStatus.COMPLETED,
              completedAt: { gte: weekAgo },
            },
            include: { result: true },
          });

          if (workouts.length === 0) continue;

          const weekKm = workouts.reduce((sum, w) => sum + (w.result ? w.result.distanceMeters / 1000 : 0), 0);
          const workoutCount = workouts.length;

          // Consecutive training-day streak (up to 30 days back)
          const workoutDaySet = new Set(
            workouts
              .map(w => w.completedAt?.toISOString().slice(0, 10))
              .filter(Boolean),
          );
          let streak = 0;
          const today = new Date();
          for (let i = 0; i < 30; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            if (workoutDaySet.has(d.toISOString().slice(0, 10))) streak++;
            else if (i > 0) break;
          }

          // Best pace from results with valid distance and duration
          const paces = workouts
            .filter(w => w.result && w.result.distanceMeters > 0 && w.result.durationSeconds > 0)
            .map(w => (w.result!.durationSeconds / w.result!.distanceMeters) * 1000); // sec/km
          const bestPaceSecKm = paces.length > 0 ? Math.min(...paces) : null;
          const bestPace = bestPaceSecKm
            ? `${Math.floor(bestPaceSecKm / 60)}:${String(Math.round(bestPaceSecKm % 60)).padStart(2, '0')}`
            : undefined;

          await this.email.sendAthleteWeeklySummary(athlete.email ?? '', athlete.name, {
            weekKm: Math.round(weekKm * 10) / 10,
            workouts: workoutCount,
            bestPace,
            streak,
          });
        } catch (err) {
          this.logger.error(`Failed to send athlete weekly summary to ${athlete.email}`, err);
        }
      }

      this.logger.log(`Athlete weekly summaries dispatched to ${athletes.length} athletes`);
    } catch (err) {
      this.logger.error(`Athlete weekly summary cron failed: ${err}`);
    }
  }

  /** Sunday 18h BRT — weekly summary for each coach about their group */
  @Cron('0 21 * * 0', { name: 'coach-weekly-summary' })
  async sendCoachWeeklySummaries() {
    this.logger.log('Sending coach weekly summary emails...');
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const coaches = await this.prisma.user.findMany({
        where: { role: 'COACH', deletedAt: null },
        select: { id: true, name: true, email: true },
      });

      for (const coach of coaches) {
        try {
          // Athletes assigned to this coach
          const athleteProfiles = await this.prisma.athleteProfile.findMany({
            where: { coachId: coach.id, user: { deletedAt: null } },
            select: { userId: true, user: { select: { name: true } } },
          });

          const totalAthletes = athleteProfiles.length;
          if (totalAthletes === 0) continue;

          const allAthleteIds = athleteProfiles.map(p => p.userId);

          // Athletes who trained this week
          const activeResults = await this.prisma.workout.findMany({
            where: {
              athleteId: { in: allAthleteIds },
              status: WorkoutStatus.COMPLETED,
              completedAt: { gte: weekAgo },
            },
            select: {
              athleteId: true,
              result: { select: { distanceMeters: true } },
            },
          });

          const activeAthleteIds = new Set(activeResults.map(w => w.athleteId));
          const activeCount = activeAthleteIds.size;
          const inactiveCount = totalAthletes - activeCount;

          const totalKm = activeResults.reduce((sum, w) => sum + (w.result ? w.result.distanceMeters / 1000 : 0), 0);
          const totalWorkouts = activeResults.length;

          const inactiveAthletes = athleteProfiles
            .filter(p => !activeAthleteIds.has(p.userId))
            .slice(0, 5)
            .map(p => p.user.name);

          await this.email.sendCoachWeeklySummary(coach.email ?? '', coach.name, {
            totalAthletes,
            activeCount,
            inactiveCount,
            totalKm: Math.round(totalKm * 10) / 10,
            totalWorkouts,
            inactiveAthletes,
          });
        } catch (err) {
          this.logger.error(`Failed to send coach weekly summary to ${coach.email}`, err);
        }
      }

      this.logger.log(`Coach weekly summaries dispatched to ${coaches.length} coaches`);
    } catch (err) {
      this.logger.error(`Coach weekly summary cron failed: ${err}`);
    }
  }

  /** Daily 9h — alert coach about inactive athletes (no workout in 7+ days) */
  @Cron('0 9 * * *', { name: 'check-inactive-athletes' })
  async checkInactiveAthletes() {
    this.logger.log('Checking inactive athletes...');
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const coaches = await this.prisma.user.findMany({
        where: { role: 'COACH', deletedAt: null },
        select: { id: true, name: true },
      });

      for (const coach of coaches) {
        const athletes = await this.prisma.athleteProfile.findMany({
          where: { coachId: coach.id, user: { deletedAt: null } },
          select: { userId: true, user: { select: { name: true } } },
        });

        if (!athletes.length) continue;

        const inactiveAthletes: string[] = [];

        for (const ap of athletes) {
          const recentWorkout = await this.prisma.workoutResult.findFirst({
            where: {
              workout: { athleteId: ap.userId },
              createdAt: { gte: sevenDaysAgo },
            },
          });
          if (!recentWorkout) {
            inactiveAthletes.push(ap.user.name);
          }
        }

        if (inactiveAthletes.length === 0) continue;

        await this.prisma.notification.create({
          data: {
            userId: coach.id,
            type: NotificationType.SYSTEM,
            title: `${inactiveAthletes.length} atleta${inactiveAthletes.length > 1 ? 's' : ''} sem treino há 7+ dias`,
            body: `Atletas sem atividade: ${inactiveAthletes.join(', ')}`,
            data: { athleteNames: inactiveAthletes, count: inactiveAthletes.length },
          },
        });
      }

      this.logger.log('Inactive athlete check complete');
    } catch (err) {
      this.logger.error(`Inactive athlete check failed: ${err}`);
    }
  }

  /** Daily 7h — alert coach about athletes with low HRV (< 30) */
  @Cron('0 7 * * *', { name: 'check-low-hrv' })
  async checkLowHRV() {
    this.logger.log('Checking low HRV snapshots...');
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const lowHRVSnapshots = await this.prisma.garminHealthSnapshot.findMany({
        where: {
          date: { gte: dayStart, lt: dayEnd },
          hrv: { lt: 30, not: null },
        },
        include: {
          athlete: {
            select: {
              id: true,
              name: true,
              athleteProfile: { select: { coachId: true } },
            },
          },
        },
      });

      for (const snapshot of lowHRVSnapshots) {
        const coachId = snapshot.athlete.athleteProfile?.coachId;
        if (!coachId) continue;

        await this.prisma.notification.create({
          data: {
            userId: coachId,
            type: NotificationType.SYSTEM,
            title: 'Alerta de HRV Baixo',
            body: `${snapshot.athlete.name} tem HRV baixo (${snapshot.hrv}ms) - considere ajustar o treino`,
            data: { athleteId: snapshot.athlete.id, hrv: snapshot.hrv },
          },
        });
      }

      this.logger.log(`Sent ${lowHRVSnapshots.length} HRV alerts`);
    } catch (err) {
      this.logger.error(`Low HRV check failed: ${err}`);
    }
  }

  /** Daily 8h — notify coach about athletes whose race is in 14 days */
  @Cron('0 8 * * *', { name: 'check-upcoming-races' })
  async checkUpcomingRaces() {
    this.logger.log('Checking upcoming races...');
    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 14);
      const targetStr = targetDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

      // OnboardingProfiles with coach and answers containing a race date
      const profiles = await this.prisma.onboardingProfile.findMany({
        where: {},
        select: {
          id: true,
          coachId: true,
          answers: true,
          athlete: { select: { name: true } },
        },
      });

      for (const profile of profiles) {
        if (!profile.answers) continue;

        // answers is a Json field — try to find a date-like value matching 14 days from now
        const answersStr = JSON.stringify(profile.answers);
        if (!answersStr.includes(targetStr)) continue;

        await this.prisma.notification.create({
          data: {
            userId: profile.coachId,
            type: NotificationType.EVENT_REMINDER,
            title: 'Prova em 14 dias',
            body: `Prova de ${profile.athlete.name} em 14 dias - considere tapering`,
            data: { athleteName: profile.athlete.name, raceDate: targetStr },
          },
        });
      }

      this.logger.log('Upcoming race check complete');
    } catch (err) {
      this.logger.error(`Upcoming race check failed: ${err}`);
    }
  }
}
