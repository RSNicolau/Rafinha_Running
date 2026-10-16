import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { WorkoutsService } from './workouts.service';
import { TrainingLoadService } from './training-load.service';
import { CoachWorkoutsService } from './coach-workouts.service';
import { WeeklyPlanEmailService, currentOrUpcomingWeekRange } from './weekly-plan-email.service';
import { CreateWorkoutDto, SubmitResultDto, SubmitFeedbackDto, HealthWorkoutDto, ChangeWorkoutTypeDto } from './dto/workout.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCoachOwnsAthlete } from '../../common/utils/ownership';

function validateHealthWorkout(raw: unknown): HealthWorkoutDto {
  const dto = plainToInstance(HealthWorkoutDto, raw);
  const errors = validateSync(dto as object, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) throw new BadRequestException('Dados de treino do Apple Health inválidos');
  return dto;
}
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Treinos')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('workouts')
export class WorkoutsController {
  constructor(
    private workoutsService: WorkoutsService,
    private trainingLoadService: TrainingLoadService,
    private prisma: PrismaService,
    private coachWorkouts: CoachWorkoutsService,
    private weeklyPlanEmail: WeeklyPlanEmailService,
  ) {}

  @Post()
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Criar treino' })
  async create(@CurrentUser('id') coachId: string, @Body() dto: CreateWorkoutDto) {
    return this.workoutsService.create(coachId, dto);
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Treinos da semana' })
  @ApiQuery({ name: 'weekStart', example: '2026-03-02' })
  async getWeekly(@CurrentUser('id') athleteId: string, @Query('weekStart') weekStart?: string) {
    return this.workoutsService.getWeeklyWorkouts(athleteId, weekStart);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Calendário de treinos do atleta logado (padrão: mês corrente; máx. 62 dias)' })
  @ApiQuery({ name: 'from', required: false, example: '2026-10-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-10-31' })
  async getCalendar(
    @CurrentUser('id') athleteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.workoutsService.getCalendar(athleteId, from, to);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas do atleta (km total, pace médio, etc.)' })
  async getStats(@CurrentUser('id') athleteId: string) {
    return this.workoutsService.getAthleteStats(athleteId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Histórico de treinos' })
  async getHistory(@CurrentUser('id') athleteId: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.workoutsService.getHistory(athleteId, page, limit);
  }

  // ── Training Load routes must come BEFORE :id to avoid shadowing ───────────

  @Get('training-load')
  @ApiOperation({ summary: 'Carga de treino do atleta logado (ATL/CTL/TSB)' })
  @ApiQuery({ name: 'days', required: false, example: 60 })
  async getMyTrainingLoad(
    @CurrentUser('id') athleteId: string,
    @Query('days') days?: number,
  ) {
    return this.trainingLoadService.getTrainingLoad(athleteId, days ? Number(days) : 60);
  }

  @Get('training-load/:athleteId')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Carga de treino de um atleta (coach)' })
  @ApiQuery({ name: 'days', required: false, example: 60 })
  async getAthleteTrainingLoad(
    @Param('athleteId') athleteId: string,
    @CurrentUser() user: any,
    @Query('days') days?: number,
  ) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId);
    return this.trainingLoadService.getTrainingLoad(athleteId, days ? Number(days) : 60);
  }

  // ── Coach: treinos/estatísticas de um atleta (detalhe do atleta no painel) ──

  @Get('athlete/:athleteId')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Treinos de um atleta (coach). status=COMPLETED (padrão) | UPCOMING | ALL' })
  @ApiQuery({ name: 'status', required: false })
  async getAthleteWorkouts(
    @Param('athleteId') athleteId: string,
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const st = status === 'ALL' || status === 'UPCOMING' ? status : 'COMPLETED';
    return this.coachWorkouts.listForAthlete(user, athleteId, { page: Number(page) || 1, limit: Number(limit) || 20, status: st, from, to });
  }

  @Get('athlete/:athleteId/stats')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Estatísticas de um atleta (coach): total, km no mês, pace médio, sequência, km/semana' })
  async getAthleteStatsForCoach(@Param('athleteId') athleteId: string, @CurrentUser() user: any) {
    return this.coachWorkouts.statsForAthlete(user, athleteId);
  }

  @Post('athlete/:athleteId/weekly-plan-email')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Reenviar ao atleta, por e-mail, os treinos da semana (semana atual; aos domingos, a próxima)',
  })
  async resendWeeklyPlanEmail(@Param('athleteId') athleteId: string, @CurrentUser() user: any) {
    await assertCoachOwnsAthlete(this.prisma, user, athleteId, { allowSelf: false });
    const range = currentOrUpcomingWeekRange(new Date());
    const result = await this.weeklyPlanEmail.sendForAthlete(athleteId, range);
    if (result.status === 'skipped') {
      const msg: Record<string, string> = {
        'not-found': 'Atleta não encontrado',
        inactive: 'Atleta inativo',
        'no-email': 'Atleta sem e-mail cadastrado',
        'no-workouts': 'Nenhum treino programado para esta semana (planilha ativa)',
      };
      throw new BadRequestException(msg[result.reason] ?? 'Não foi possível enviar o e-mail');
    }
    return { sent: true, workouts: result.workouts, weekStart: range.start.toISOString(), weekEnd: range.end.toISOString() };
  }

  @Get('group-comparison')
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Comparacao anonima do atleta com grupo (mesmo coach)' })
  async getGroupComparison(@CurrentUser('id') athleteId: string) {
    return this.workoutsService.getGroupComparison(athleteId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do treino' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.workoutsService.findByIdForUser(id, user);
  }

  @Patch(':id/complete')
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Marcar treino como concluído' })
  async markComplete(@Param('id') id: string, @CurrentUser('id') athleteId: string) {
    return this.workoutsService.markComplete(id, athleteId);
  }

  @Post(':id/result')
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Enviar resultado do treino' })
  async submitResult(@Param('id') id: string, @CurrentUser('id') athleteId: string, @Body() dto: SubmitResultDto) {
    return this.workoutsService.submitResult(id, athleteId, dto);
  }

  @Patch(':id/feedback')
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Enviar feedback subjetivo do treino (RPE, sensação, comentário)' })
  async submitFeedback(@Param('id') id: string, @CurrentUser('id') athleteId: string, @Body() dto: SubmitFeedbackDto) {
    return this.workoutsService.submitFeedback(id, athleteId, dto);
  }

  @Post('sync/health')
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Sincronizar treino(s) do Apple Health / HealthKit. Aceita objeto único ou array.' })
  async syncFromHealth(@CurrentUser('id') athleteId: string, @Body() body: unknown) {
    // Corpo pode ser objeto ou array → validação manual com o DTO (whitelist + forbidNonWhitelisted)
    if (Array.isArray(body)) {
      if (body.length > 200) throw new BadRequestException('Máximo de 200 treinos por sincronização');
      return this.workoutsService.syncFromAppleHealthBatch(athleteId, body.map(validateHealthWorkout));
    }
    return this.workoutsService.syncFromAppleHealth(athleteId, validateHealthWorkout(body));
  }

  @Patch(':id/type')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Coach muda o tipo do treino (ex: de INTERVAL para RECOVERY após alerta de HRV)' })
  async changeType(
    @Param('id') workoutId: string,
    @CurrentUser() user: any,
    @Body() dto: ChangeWorkoutTypeDto,
  ) {
    return this.workoutsService.changeWorkoutType(workoutId, user, dto.type);
  }

}
