import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { WorkoutsService } from './workouts.service';
import { CreateWorkoutDto, SubmitResultDto } from './dto/workout.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Treinos')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('workouts')
export class WorkoutsController {
  constructor(private workoutsService: WorkoutsService) {}

  @Post()
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Criar treino' })
  async create(@CurrentUser('id') coachId: string, @Body() dto: CreateWorkoutDto) {
    return this.workoutsService.create(coachId, dto);
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Treinos da semana' })
  @ApiQuery({ name: 'weekStart', example: '2026-03-02' })
  async getWeekly(@CurrentUser('id') athleteId: string, @Query('weekStart') weekStart: string) {
    return this.workoutsService.getWeeklyWorkouts(athleteId, weekStart);
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

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do treino' })
  async findOne(@Param('id') id: string) {
    return this.workoutsService.findById(id);
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

  @Post('sync/health')
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Sincronizar treino do Apple Health / HealthKit' })
  async syncFromHealth(@CurrentUser('id') athleteId: string, @Body() body: any) {
    return this.workoutsService.syncFromAppleHealth(athleteId, body);
  }
}
