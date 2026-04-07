import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { EmailService } from '../email/email.service';
import { RankingsService } from '../rankings/rankings.service';
import { CoachBrainService } from '../coach-brain/coach-brain.service';
import { SubscriptionStatus } from '@prisma/client';

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
        await this.email.sendSubscriptionReminder(sub.user.email, sub.user.name, sub.currentPeriodEnd);
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
            status: 'COMPLETED',
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
          coach.email,
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
          status: 'PENDING',
          expiresAt: { lt: new Date() },
        },
        data: { status: 'EXPIRED' },
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
}
