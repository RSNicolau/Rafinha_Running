import {
  Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Req, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IntegrationProvider, UserRole } from '@prisma/client';
import { Request } from 'express';
import { IntegrationsService } from './integrations.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

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

  @Post(':provider/connect')
  @ApiOperation({ summary: 'Iniciar conexão com plataforma' })
  async connect(
    @CurrentUser('id') userId: string,
    @Param('provider') provider: IntegrationProvider,
  ) {
    return this.integrationsService.getConnectUrl(userId, provider);
  }

  @Get(':provider/callback')
  @ApiOperation({ summary: 'Callback OAuth' })
  async callback(
    @Param('provider') provider: IntegrationProvider,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.integrationsService.handleCallback(provider, code, state);
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
  @ApiOperation({ summary: 'Sincronizar atividades manualmente' })
  async sync(@CurrentUser('id') userId: string) {
    return this.integrationsService.syncActivities(userId);
  }

  // ── Strava Webhook Setup (ADMIN only) ──

  @Post('strava/setup-webhook')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Registrar webhook do Strava automaticamente',
    description: 'Chama a API do Strava para registrar a URL de webhook. Execute uma vez após o deploy. ' +
      'Requer: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_WEBHOOK_VERIFY_TOKEN e API_BASE_URL.',
  })
  async setupStravaWebhook(@Req() req: Request, @Body('apiBaseUrl') apiBaseUrl?: string) {
    const baseUrl = apiBaseUrl
      || process.env.API_BASE_URL
      || `${req.protocol}://${req.get('host')}/api`;
    return this.integrationsService.setupStravaWebhook(baseUrl);
  }

  // ── Polar Webhook Setup (ADMIN only) ──

  @Post('polar/setup-webhook')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Registrar webhook do Polar AccessLink automaticamente',
    description: 'Registra a URL de webhook no Polar AccessLink para receber exercícios em tempo real. ' +
      'Execute uma vez após o deploy. Requer: POLAR_CLIENT_ID, POLAR_CLIENT_SECRET.',
  })
  async setupPolarWebhook(@Req() req: Request, @Body('apiBaseUrl') apiBaseUrl?: string) {
    const baseUrl = apiBaseUrl
      || process.env.API_BASE_URL
      || `${req.protocol}://${req.get('host')}/api`;
    return this.integrationsService.setupPolarWebhook(baseUrl);
  }

  // ── Garmin Training API: Push workouts TO Garmin watch ──

  @Post('garmin/push-workout/:workoutId')
  @ApiOperation({
    summary: 'Enviar treino para Garmin Connect do atleta',
    description: 'Converte o treino para formato Garmin e envia para a conta Garmin Connect do atleta. O treino aparecerá no relógio Garmin na próxima sincronização.',
  })
  async pushWorkoutToGarmin(@Param('workoutId') workoutId: string) {
    return this.integrationsService.pushWorkoutToGarmin(workoutId);
  }

  @Post('garmin/push-plan/:planId')
  @ApiOperation({
    summary: 'Enviar plano de treino completo para Garmin Connect',
    description: 'Envia todos os treinos agendados do plano para a conta Garmin Connect do atleta.',
  })
  async pushPlanToGarmin(@Param('planId') planId: string) {
    return this.integrationsService.pushPlanToGarmin(planId);
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
