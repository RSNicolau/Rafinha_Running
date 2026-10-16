import {
  Controller, Post, Get, Body, Query, Headers, Param, Req, Res, Logger, HttpCode, HttpStatus,
  UnauthorizedException, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IntegrationProvider } from '@prisma/client';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { IntegrationsService } from './integrations.service';
import { parseStravaWebhookEvent } from './strava/strava.service';
import {
  cookieMatchesState, isWellFormedState, OAUTH_NONCE_COOKIE, readCookie,
} from './oauth-state';
import {
  integrationsPageUrl, isCorosConfigured, isGarminConfigured, isProviderConnectable, isStravaConfigured, mobileScheme,
} from './integration-env';

function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Número finito dentro de [min, max] ou undefined (nunca grava lixo vindo de webhook). */
function num(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function str(v: unknown, max = 128): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined;
}

const OAUTH_PROVIDERS = new Set<string>([
  IntegrationProvider.STRAVA, IntegrationProvider.GARMIN, IntegrationProvider.COROS, IntegrationProvider.GOOGLE_FIT,
]);

/** Códigos de erro estáveis para o front traduzir — nunca refletimos mensagens arbitrárias na URL. */
type OAuthErrorCode =
  | 'access_denied' | 'invalid_request' | 'session_mismatch' | 'expired_state' | 'provider_unavailable'
  | 'missing_scope' | 'exchange_failed';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger('WebhooksController');
  private warnedNoSubscriptionId = false;

  constructor(private integrationsService: IntegrationsService) {}

  // ═══════════════════ OAUTH CALLBACK (público) ═══════════════════

  /**
   * Redirect do provedor após o consentimento. Regras:
   *  - web: exige cookie `rr_oauth_nonce` == sha256(state) (definido no POST autenticado de /connect);
   *  - mobile: sem cookie; devolve code+state ao app por deep link, e o app conclui autenticado em
   *    POST /integrations/:provider/complete (state.userId precisa ser o usuário do JWT);
   *  - redireciona sempre para APP_URL (sem open redirect).
   */
  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'OAuth callback redirect (público)' })
  async oauthCallback(
    @Param('provider') providerParam: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('scope') scope: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const page = integrationsPageUrl();
    const provider = String(providerParam || '').toUpperCase();
    const fail = (reason: OAuthErrorCode) => {
      const p = OAUTH_PROVIDERS.has(provider) ? `&provider=${provider}` : '';
      return res.redirect(302, `${page}?oauth=error&error=${reason}${p}`);
    };

    if (!OAUTH_PROVIDERS.has(provider) || !isProviderConnectable(provider as IntegrationProvider)) {
      return fail('provider_unavailable');
    }
    if (error) {
      this.logger.warn(`OAuth ${provider}: provedor retornou erro "${String(error).slice(0, 60)}"`);
      if (isWellFormedState(state)) {
        const rec = await this.integrationsService.peekOAuthState(provider as IntegrationProvider, state).catch(() => null);
        if (rec?.client === 'mobile') {
          return res.redirect(302, `${mobileScheme()}://integrations/complete?provider=${provider}&error=access_denied`);
        }
      }
      return fail('access_denied');
    }
    if (typeof code !== 'string' || !code || code.length > 512 || !isWellFormedState(state)) {
      return fail('invalid_request');
    }

    const cookieHeader = req.headers?.cookie;
    const nonce = readCookie(typeof cookieHeader === 'string' ? cookieHeader : undefined, OAUTH_NONCE_COOKIE);
    res.clearCookie(OAUTH_NONCE_COOKIE, { path: '/api' });

    if (!cookieMatchesState(nonce, state)) {
      // Sem vínculo com o navegador. Fluxo mobile? Devolve ao app (que conclui autenticado).
      const rec = await this.integrationsService.peekOAuthState(provider as IntegrationProvider, state).catch(() => null);
      if (rec?.client === 'mobile') {
        const qs = new URLSearchParams({ provider, code, state, ...(typeof scope === 'string' ? { scope } : {}) });
        return res.redirect(302, `${mobileScheme()}://integrations/complete?${qs.toString()}`);
      }
      this.logger.warn(`OAuth ${provider}: cookie de vínculo ausente/divergente — rejeitado`);
      return fail(rec ? 'session_mismatch' : 'expired_state');
    }

    try {
      await this.integrationsService.handleCallback(provider as IntegrationProvider, code, state, {
        grantedScope: typeof scope === 'string' ? scope : undefined,
      });
      return res.redirect(302, `${page}?oauth=success&provider=${provider}`);
    } catch (err: any) {
      this.logger.error(`OAuth callback error for ${provider}: ${err?.message}`);
      const msg = String(err?.message || '');
      if (/Permiss/.test(msg)) return fail('missing_scope');
      if (/Estado OAuth/.test(msg)) return fail('expired_state');
      return fail('exchange_failed');
    }
  }

  // ═══════════════════ STRAVA WEBHOOKS ═══════════════════

  @Get('strava')
  @ApiOperation({ summary: 'Strava webhook verification (hub.challenge)' })
  verifyStravaWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expectedToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
    if (!expectedToken) {
      this.logger.error('STRAVA_WEBHOOK_VERIFY_TOKEN not configured');
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    if (mode === 'subscribe' && safeEqual(verifyToken, expectedToken) && typeof challenge === 'string' && challenge.length <= 256) {
      this.logger.log('Strava webhook verified');
      return res.status(200).json({ 'hub.challenge': challenge });
    }

    this.logger.warn('Strava webhook verification failed');
    return res.status(403).json({ error: 'Verification failed' });
  }

  /**
   * Eventos da Strava. A Strava NÃO assina os eventos — por isso:
   *  1. formato estrito + subscription_id == STRAVA_WEBHOOK_SUBSCRIPTION_ID (quando definido);
   *  2. o conteúdo nunca é confiado: a atividade é buscada na API com o token do atleta, e a desautorização
   *     só vale se a Strava recusar as credenciais.
   * Responde 200 imediatamente (a Strava exige < 2 s) e processa em background.
   */
  @Post('strava')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Strava webhook events' })
  handleStravaWebhook(@Body() body: any) {
    if (!isStravaConfigured()) throw new NotFoundException();

    const event = parseStravaWebhookEvent(body);
    if (!event) throw new BadRequestException('Evento inválido');

    const expectedSub = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
    if (expectedSub) {
      if (!safeEqual(String(event.subscription_id), expectedSub.trim())) {
        this.logger.warn(`Strava webhook com subscription_id inesperado (${event.subscription_id}) — rejeitado`);
        throw new ForbiddenException('Subscription inválida');
      }
    } else if (!this.warnedNoSubscriptionId) {
      this.warnedNoSubscriptionId = true;
      this.logger.warn('STRAVA_WEBHOOK_SUBSCRIPTION_ID não definido — defina-o para rejeitar eventos de outras assinaturas');
    }

    setImmediate(() => {
      this.integrationsService
        .handleStravaWebhook(event)
        .then((outcome) => this.logger.log(`Strava ${event.object_type}/${event.aspect_type} ${event.object_id}: ${outcome}`))
        .catch((err: any) => this.logger.error(`Strava webhook error: ${err?.message}`, err?.stack));
    });

    return { status: 'ok' };
  }

  // ═══════════════════ GARMIN WEBHOOKS (fail-closed) ═══════════════════

  /** Garmin só aceita push quando a integração E o segredo de webhook estão configurados e a assinatura confere. */
  private assertGarminWebhook(req: Request, signature: string | undefined) {
    const secret = process.env.GARMIN_WEBHOOK_SECRET;
    if (!isGarminConfigured() || !secret) {
      throw new NotFoundException();
    }
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody || !signature) {
      throw new UnauthorizedException('Assinatura do webhook Garmin ausente');
    }
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    if (!safeEqual(signature, expected)) {
      this.logger.warn('Garmin webhook signature validation failed');
      throw new UnauthorizedException('Assinatura do webhook Garmin inválida');
    }
  }

  @Post('garmin/activities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Garmin activity push notification' })
  async handleGarminActivity(
    @Req() req: Request,
    @Headers('x-garmin-signature') garminSignature: string,
    @Body() body: any,
  ) {
    this.assertGarminWebhook(req, garminSignature);

    const list = Array.isArray(body?.activityDetails) ? body.activityDetails
      : Array.isArray(body?.activities) ? body.activities : null;
    if (!list || list.length > 500) throw new BadRequestException('Payload inválido');

    for (const activity of list) {
      const userId = str(activity?.userId);
      const activityId = str(activity?.activityId ?? activity?.summaryId);
      const startTime = num(activity?.startTimeInSeconds, 946684800, 4102444800);
      const duration = num(activity?.durationInSeconds, 1, 7 * 24 * 3600);
      const distance = num(activity?.distanceInMeters, 0, 1_000_000);
      if (!userId || !activityId || startTime === undefined || duration === undefined || distance === undefined) continue;
      try {
        await this.integrationsService.handleGarminActivity({
          userId,
          activityId,
          activityType: str(activity.activityType, 64) || 'UNKNOWN',
          startTime,
          duration,
          distance,
          averagePace: num(activity.averagePaceInMinutesPerKilometer, 0, 60),
          averageHeartRate: num(activity.averageHeartRateInBeatsPerMinute, 20, 250),
          maxHeartRate: num(activity.maxHeartRateInBeatsPerMinute, 20, 250),
          calories: num(activity.activeKilocalories, 0, 20000),
        });
      } catch (err: any) {
        this.logger.error(`Garmin webhook error: ${err?.message}`);
      }
    }

    return { status: 'ok' };
  }

  @Post('garmin/health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Garmin health data push' })
  async handleGarminHealth(
    @Req() req: Request,
    @Headers('x-garmin-signature') garminSignature: string,
    @Body() body: any,
  ) {
    this.assertGarminWebhook(req, garminSignature);

    const dailies = Array.isArray(body?.dailies) ? body.dailies
      : Array.isArray(body?.wellnessDetails) ? body.wellnessDetails : [];
    const sleeps = Array.isArray(body?.sleeps) ? body.sleeps : [];
    if (dailies.length > 500 || sleeps.length > 500) throw new BadRequestException('Payload inválido');

    const sleepMap: Record<string, { sleepScore?: number; sleepHours?: number }> = {};
    for (const sleep of sleeps) {
      const uid = str(sleep?.userId);
      if (!uid) continue;
      const secs = num(sleep.durationInSeconds, 0, 24 * 3600);
      sleepMap[uid] = {
        sleepScore: num(sleep.overallSleepScore?.value, 0, 100),
        sleepHours: secs !== undefined ? secs / 3600 : undefined,
      };
    }

    for (const summary of dailies) {
      const uid = str(summary?.userId);
      const date = typeof summary?.calendarDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(summary.calendarDate)
        ? summary.calendarDate : undefined;
      if (!uid || !date) continue;
      const sleepData = sleepMap[uid] || {};
      try {
        await this.integrationsService.handleGarminHealth({
          userId: uid,
          date,
          restingHR: num(summary.restingHeartRateInBeatsPerMinute, 20, 150),
          stressLevel: num(summary.averageStressLevel, 0, 100),
          totalSteps: num(summary.totalSteps, 0, 200_000),
          hrv: num(summary.lastNightAvg5MinHrv ?? summary.hrvStatus?.lastNight5MinHigh, 1, 300),
          sleepScore: sleepData.sleepScore,
          sleepHours: sleepData.sleepHours,
          spo2: num(summary.averageSpo2Value, 50, 100),
          caloriesActive: num(summary.activeKilocalories, 0, 20000),
        });
      } catch (err: any) {
        this.logger.error(`Garmin health webhook error: ${err?.message}`);
      }
    }

    return { status: 'ok' };
  }

  @Post('garmin/deregistration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Garmin deregistration callback' })
  async handleGarminDeregistration(
    @Req() req: Request,
    @Headers('x-garmin-signature') garminSignature: string,
    @Body() body: any,
  ) {
    this.assertGarminWebhook(req, garminSignature);
    const uid = str(body?.userId);
    if (!uid) throw new BadRequestException('Payload inválido');
    try {
      await this.integrationsService.handleGarminDeauth(uid);
    } catch (err: any) {
      this.logger.error(`Garmin deregistration error: ${err?.message}`);
    }
    return { status: 'ok' };
  }

  // ═══════════════════ COROS WEBHOOKS (fail-closed) ═══════════════════

  /**
   * COROS só é aceito com integração configurada + COROS_WEBHOOK_SECRET, enviado como header
   * `x-rr-webhook-secret` ou `?secret=` na URL cadastrada no portal COROS. O conteúdo do evento não é
   * gravado: só dispara uma sync puxada da API COROS com o token do atleta.
   */
  @Post('coros')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'COROS activity push notification' })
  async handleCorosWebhook(
    @Headers('x-rr-webhook-secret') headerSecret: string,
    @Query('secret') querySecret: string,
    @Body() body: any,
  ) {
    const secret = process.env.COROS_WEBHOOK_SECRET;
    if (!isCorosConfigured() || !secret) throw new NotFoundException();
    if (!safeEqual(headerSecret, secret) && !safeEqual(querySecret, secret)) {
      throw new UnauthorizedException('Webhook COROS não autorizado');
    }

    const openId = str(body?.openId);
    const list = Array.isArray(body?.sportDataList) ? body.sportDataList : [];
    if (list.length > 500) throw new BadRequestException('Payload inválido');

    try {
      const runIds = new Set<string>();
      for (const activity of list) {
        const id = openId || str(activity?.openId);
        if (id && Number(activity?.mode) === 100) runIds.add(id);
      }
      for (const id of runIds) {
        // dispara sync puxada (a API COROS é a fonte da verdade, não o corpo do webhook)
        await this.integrationsService.handleCorosActivity({
          openId: id, activityId: '', mode: 100, startTime: 0, endTime: 0, totalTime: 0, distance: 0,
        });
      }
      if (body?.type === 'deauth' && openId) {
        await this.integrationsService.handleCorosDeauth(openId);
      }
    } catch (err: any) {
      this.logger.error(`COROS webhook error: ${err?.message}`);
    }

    return { message: 'ok' };
  }
}
