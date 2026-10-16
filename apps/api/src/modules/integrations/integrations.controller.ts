import {
  Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Res, ParseIntPipe, DefaultValuePipe,
  ParseEnumPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IntegrationProvider, UserRole } from '@prisma/client';
import { Response } from 'express';
import { AuthUser, IntegrationsService } from './integrations.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CompleteOAuthDto } from './dto/complete-oauth.dto';
import { hashOAuthState, OAUTH_NONCE_COOKIE, OAUTH_STATE_TTL_MS } from './oauth-state';
import { appUrl } from './integration-env';

const providerPipe = new ParseEnumPipe(IntegrationProvider);

@ApiTags('Integrações')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar integrações conectadas' })
  async list(@CurrentUser('id') userId: string) {
    return this.integrationsService.getUserIntegrations(userId);
  }

  @Get('providers')
  @ApiOperation({ summary: 'Provedores disponíveis neste ambiente (dirige a UI de conexão)' })
  providers() {
    return this.integrationsService.getProviders();
  }

  /**
   * Inicia o OAuth. Para o navegador (client=web) define o cookie HttpOnly `rr_oauth_nonce` = sha256(state),
   * que o callback exige — vincula a autorização ao navegador do usuário autenticado (anti login-CSRF).
   * O app mobile usa client=mobile e conclui por POST /integrations/:provider/complete.
   */
  @Post(':provider/connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar conexão com plataforma' })
  async connect(
    @CurrentUser('id') userId: string,
    @Param('provider', providerPipe) provider: IntegrationProvider,
    @Query('client') client: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const mode = client === 'mobile' ? 'mobile' : 'web';
    const { url, state } = await this.integrationsService.getConnectUrl(userId, provider, mode);
    if (mode === 'web') {
      res.cookie(OAUTH_NONCE_COOKIE, hashOAuthState(state), {
        httpOnly: true,
        sameSite: 'lax',
        secure: appUrl().startsWith('https://') || process.env.NODE_ENV === 'production',
        path: '/api',
        maxAge: OAUTH_STATE_TTL_MS,
      });
    }
    return { url, provider };
  }

  @Post(':provider/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Concluir OAuth pelo app (state vinculado ao usuário autenticado)' })
  async complete(
    @CurrentUser('id') userId: string,
    @Param('provider', providerPipe) provider: IntegrationProvider,
    @Body() dto: CompleteOAuthDto,
  ) {
    const result: any = await this.integrationsService.handleCallback(provider, dto.code, dto.state, {
      expectedUserId: userId,
      grantedScope: dto.scope,
    });
    return { success: true, provider: result?.provider ?? provider };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desconectar integração' })
  async disconnect(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.integrationsService.disconnect(userId, id);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar atividades manualmente' })
  async sync(@CurrentUser('id') userId: string) {
    return this.integrationsService.syncActivities(userId);
  }

  // ── Strava Webhook Setup (ADMIN only) ──

  @Post('strava/setup-webhook')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Registrar webhook do Strava automaticamente',
    description: 'Chama a API do Strava para registrar a URL de webhook (derivada de STRAVA_WEBHOOK_CALLBACK_URL, ' +
      'API_PUBLIC_URL ou APP_URL + /api/v1/webhooks/strava). Execute uma vez após o deploy e grave o id retornado ' +
      'em STRAVA_WEBHOOK_SUBSCRIPTION_ID.',
  })
  async setupStravaWebhook() {
    return this.integrationsService.setupStravaWebhook();
  }

  // ── Garmin Training API: Push workouts TO Garmin watch ──

  @Post('garmin/push-workout/:workoutId')
  @ApiOperation({
    summary: 'Enviar treino para Garmin Connect do atleta',
    description: 'Somente o próprio atleta, o coach dele ou ADMIN. Requer integração Garmin habilitada no ambiente.',
  })
  async pushWorkoutToGarmin(@CurrentUser() user: AuthUser, @Param('workoutId') workoutId: string) {
    return this.integrationsService.pushWorkoutToGarmin(user, workoutId);
  }

  @Post('garmin/push-plan/:planId')
  @ApiOperation({
    summary: 'Enviar plano de treino completo para Garmin Connect',
    description: 'Somente o próprio atleta, o coach dele ou ADMIN. Requer integração Garmin habilitada no ambiente.',
  })
  async pushPlanToGarmin(@CurrentUser() user: AuthUser, @Param('planId') planId: string) {
    return this.integrationsService.pushPlanToGarmin(user, planId);
  }

  // ── Garmin Health API ──

  @Get('garmin/health/me')
  @ApiOperation({ summary: 'Meus dados de saúde Garmin hoje (atleta)' })
  async getMyGarminHealthToday(@CurrentUser('id') userId: string) {
    return this.integrationsService.getMyGarminHealthToday(userId);
  }

  @Get('garmin/health/today/:athleteId')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Dados de saúde Garmin hoje de um atleta (coach)' })
  async getAthleteGarminHealthToday(
    @CurrentUser('id') coachId: string,
    @Param('athleteId') athleteId: string,
  ) {
    return this.integrationsService.getAthleteGarminHealthToday(coachId, athleteId);
  }

  @Get('garmin/health/history/:athleteId')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Histórico de saúde Garmin de um atleta (coach)' })
  async getAthleteGarminHealthHistory(
    @CurrentUser('id') coachId: string,
    @Param('athleteId') athleteId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.integrationsService.getAthleteGarminHealthHistory(coachId, athleteId, days);
  }
}
