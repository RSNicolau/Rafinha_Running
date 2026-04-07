import {
  Controller, Post, Get, Body, Query, Headers, Req, Res, Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { IntegrationsService } from './integrations.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger('WebhooksController');

  constructor(private integrationsService: IntegrationsService) {}

  // ═══════════════════ STRAVA WEBHOOKS ═══════════════════

  @Get('strava')
  @ApiOperation({ summary: 'Strava webhook verification' })
  verifyStravaWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expectedToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
    if (!expectedToken) {
      this.logger.error('STRAVA_WEBHOOK_VERIFY_TOKEN not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    if (mode === 'subscribe' && verifyToken === expectedToken) {
      this.logger.log('Strava webhook verified');
      return res.json({ 'hub.challenge': challenge });
    }

    this.logger.warn('Strava webhook verification failed');
    return res.status(403).json({ error: 'Verification failed' });
  }

  @Post('strava')
  @ApiOperation({ summary: 'Strava webhook events' })
  async handleStravaWebhook(
    @Req() req: Request,
    @Headers('x-hub-signature') hubSignature: string,
    @Body() body: any,
  ) {
    // Validate Strava Hub Signature if client secret is configured
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;
    if (clientSecret && hubSignature) {
      const rawBody = (req as any).rawBody;
      if (rawBody) {
        const expected = 'sha1=' + crypto
          .createHmac('sha1', clientSecret)
          .update(rawBody)
          .digest('hex');
        const valid = crypto.timingSafeEqual(Buffer.from(hubSignature), Buffer.from(expected));
        if (!valid) {
          this.logger.warn('Strava webhook signature mismatch');
          throw new UnauthorizedException('Assinatura do webhook inválida');
        }
      }
    }

    this.logger.log(`Strava webhook: ${body.aspect_type} ${body.object_type} ${body.object_id}`);

    try {
      switch (body.object_type) {
        case 'activity':
          await this.integrationsService.handleStravaActivity({
            athleteId: String(body.owner_id),
            activityId: String(body.object_id),
            aspectType: body.aspect_type,
            updates: body.updates,
          });
          break;

        case 'athlete':
          if (body.aspect_type === 'update' && body.updates?.authorized === 'false') {
            await this.integrationsService.handleStravaDeauth(String(body.owner_id));
          }
          break;
      }
    } catch (err: any) {
      this.logger.error(`Strava webhook error: ${err.message}`, err.stack);
    }

    return { status: 'ok' };
  }

  // ═══════════════════ GARMIN WEBHOOKS ═══════════════════

  private validateGarminSignature(signature: string | undefined, rawBody: Buffer): boolean {
    const secret = process.env.GARMIN_WEBHOOK_SECRET;
    if (!secret) return true; // Permissivo se não configurado
    if (!signature) return false;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  @Post('garmin/activities')
  @ApiOperation({ summary: 'Garmin activity push notification' })
  async handleGarminActivity(
    @Req() req: Request,
    @Headers('x-garmin-signature') garminSignature: string,
    @Body() body: any,
  ) {
    const rawBody = (req as any).rawBody;
    if (rawBody && !this.validateGarminSignature(garminSignature, rawBody)) {
      this.logger.warn('Garmin webhook signature validation failed');
      throw new UnauthorizedException('Assinatura do webhook Garmin inválida');
    }

    this.logger.log(`Garmin activity webhook: ${JSON.stringify(body).slice(0, 200)}`);

    try {
      const activities = body.activityDetails || body.activities || [];
      for (const activity of activities) {
        await this.integrationsService.handleGarminActivity({
          userId: activity.userId || activity.userAccessToken,
          activityId: String(activity.activityId || activity.summaryId),
          activityType: activity.activityType,
          startTime: activity.startTimeInSeconds,
          duration: activity.durationInSeconds,
          distance: activity.distanceInMeters,
          averagePace: activity.averagePaceInMinutesPerKilometer,
          averageHeartRate: activity.averageHeartRateInBeatsPerMinute,
          maxHeartRate: activity.maxHeartRateInBeatsPerMinute,
          calories: activity.activeKilocalories,
        });
      }
    } catch (err: any) {
      this.logger.error(`Garmin webhook error: ${err.message}`, err.stack);
    }

    return { status: 'ok' };
  }

  @Post('garmin/health')
  @ApiOperation({ summary: 'Garmin health data push' })
  async handleGarminHealth(
    @Req() req: Request,
    @Headers('x-garmin-signature') garminSignature: string,
    @Body() body: any,
  ) {
    const rawBody = (req as any).rawBody;
    if (rawBody && !this.validateGarminSignature(garminSignature, rawBody)) {
      throw new UnauthorizedException('Assinatura do webhook Garmin inválida');
    }

    this.logger.log(`Garmin health webhook received`);

    try {
      // Garmin Health API sends dailies, sleeps, and epoch summaries
      const dailies = body.dailies || body.wellnessDetails || [];
      const sleeps = body.sleeps || [];

      // Build a map of userId → sleepData
      const sleepMap: Record<string, { sleepScore?: number; sleepHours?: number }> = {};
      for (const sleep of sleeps) {
        if (sleep.userId) {
          sleepMap[sleep.userId] = {
            sleepScore: sleep.overallSleepScore?.value ?? sleep.averageSpO2Value,
            sleepHours: sleep.durationInSeconds ? sleep.durationInSeconds / 3600 : undefined,
          };
        }
      }

      for (const summary of dailies) {
        if (!summary.userId) continue;
        const sleepData = sleepMap[summary.userId] || {};
        await this.integrationsService.handleGarminHealth({
          userId: summary.userId,
          restingHR: summary.restingHeartRateInBeatsPerMinute,
          stressLevel: summary.averageStressLevel,
          totalSteps: summary.totalSteps,
          date: summary.calendarDate,
          hrv: summary.lastNightAvg5MinHrv ?? summary.hrvStatus?.lastNight5MinHigh,
          sleepScore: sleepData.sleepScore,
          sleepHours: sleepData.sleepHours,
          spo2: summary.averageSpo2Value,
          caloriesActive: summary.activeKilocalories,
        });
      }
    } catch (err: any) {
      this.logger.error(`Garmin health webhook error: ${err.message}`);
    }

    return { status: 'ok' };
  }

  @Post('garmin/deregistration')
  @ApiOperation({ summary: 'Garmin deregistration callback' })
  async handleGarminDeregistration(
    @Req() req: Request,
    @Headers('x-garmin-signature') garminSignature: string,
    @Body() body: any,
  ) {
    const rawBody = (req as any).rawBody;
    if (rawBody && !this.validateGarminSignature(garminSignature, rawBody)) {
      throw new UnauthorizedException('Assinatura do webhook Garmin inválida');
    }

    this.logger.log(`Garmin deregistration: ${JSON.stringify(body)}`);
    try {
      if (body.userId) {
        await this.integrationsService.handleGarminDeauth(body.userId);
      }
    } catch (err: any) {
      this.logger.error(`Garmin deregistration error: ${err.message}`);
    }
    return { status: 'ok' };
  }

  // ═══════════════════ COROS WEBHOOKS ═══════════════════

  @Post('coros')
  @ApiOperation({ summary: 'COROS activity push notification' })
  async handleCorosWebhook(
    @Body() body: any,
  ) {
    this.logger.log(`COROS webhook: ${JSON.stringify(body).slice(0, 200)}`);

    try {
      const sportDataList = body.sportDataList || [];
      for (const activity of sportDataList) {
        if (activity.mode === 100) { // Running activities only
          await this.integrationsService.handleCorosActivity({
            openId: body.openId || activity.openId,
            activityId: String(activity.labelId || activity.activityId),
            mode: activity.mode,
            startTime: activity.startTime,
            endTime: activity.endTime,
            totalTime: activity.totalTime,
            distance: activity.distance,
            avgHeartRate: activity.avgHeartRate,
            maxHeartRate: activity.maxHeartRate,
            calorie: activity.calorie,
          });
        }
      }

      // Handle deauth event
      if (body.type === 'deauth' && body.openId) {
        await this.integrationsService.handleCorosDeauth(body.openId);
      }
    } catch (err: any) {
      this.logger.error(`COROS webhook error: ${err.message}`, err.stack);
    }

    return { message: 'ok' };
  }

  // ═══════════════════ POLAR WEBHOOKS ═══════════════════

  @Post('polar')
  @ApiOperation({ summary: 'Polar AccessLink exercise event webhook' })
  async handlePolarWebhook(
    @Req() req: Request,
    @Headers('polar-webhook-signature') webhookSignature: string,
    @Body() body: any,
  ) {
    // Validate signature if secret is configured
    const secret = process.env.POLAR_WEBHOOK_SECRET;
    if (secret && webhookSignature) {
      const rawBody = (req as any).rawBody;
      if (rawBody) {
        const expected = crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');
        try {
          const valid = crypto.timingSafeEqual(
            Buffer.from(webhookSignature),
            Buffer.from(expected),
          );
          if (!valid) {
            this.logger.warn('Polar webhook signature mismatch');
            throw new UnauthorizedException('Assinatura do webhook Polar inválida');
          }
        } catch {
          throw new UnauthorizedException('Assinatura do webhook Polar inválida');
        }
      }
    }

    this.logger.log(`Polar webhook: ${body.event} for user ${body.user_id}`);

    try {
      if (body.event === 'EXERCISE') {
        await this.integrationsService.handlePolarExercise({
          userId:     String(body.user_id),
          entity_id:  body.entity_id,
          event_type: body.event,
          timestamp:  body.timestamp,
        });
      }
    } catch (err: any) {
      this.logger.error(`Polar webhook error: ${err.message}`, err.stack);
    }

    return { status: 'ok' };
  }
}
