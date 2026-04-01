import {
  Controller, Get, Post, Delete, Param, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IntegrationProvider } from '@prisma/client';
import { IntegrationsService } from './integrations.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Integrações')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
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
}
