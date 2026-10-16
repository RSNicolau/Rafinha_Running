import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PlanStatus, UserRole } from '@prisma/client';
import { TrainingPlansService } from './training-plans.service';
import { CreatePlanDto, DuplicatePlanDto, PlanWorkoutDto, UpdatePlanDto, UpdatePlanWorkoutDto } from './dto/plan.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

const COACH_ROLES = [UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN];
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@ApiTags('Planos de Treino')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('training-plans')
export class TrainingPlansController {
  constructor(private plansService: TrainingPlansService) {}

  @Post()
  @Roles(...COACH_ROLES)
  @ApiOperation({ summary: 'Criar plano de treino' })
  async create(@CurrentUser() user: any, @Body() dto: CreatePlanDto) {
    return this.plansService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar planos de treino (coach: todos os atletas que ele acessa; atleta: os seus)' })
  @ApiQuery({ name: 'athleteId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: PlanStatus })
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('athleteId') athleteId?: string,
    @Query('status') status?: string,
  ) {
    const p = Math.max(1, Math.floor(+page) || 1);
    const l = Math.min(100, Math.max(1, Math.floor(+limit) || 20));
    const st = status && (Object.values(PlanStatus) as string[]).includes(status) ? (status as PlanStatus) : undefined;
    return this.plansService.findAll(user, p, l, { athleteId: athleteId || undefined, status: st });
  }

  @Get('athlete/:athleteId/active')
  @ApiOperation({ summary: 'Planilha ativa do atleta (null se não houver)' })
  async findActive(@Param('athleteId', uuid) athleteId: string, @CurrentUser() user: any) {
    return this.plansService.findActiveForAthlete(athleteId, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do plano de treino (com treinos)' })
  async findOne(@Param('id', uuid) id: string, @CurrentUser() user: any) {
    return this.plansService.findById(id, user);
  }

  @Put(':id')
  @Roles(...COACH_ROLES)
  @ApiOperation({ summary: 'Atualizar plano de treino (metadados e status: ativar/pausar/concluir)' })
  async update(@Param('id', uuid) id: string, @CurrentUser() user: any, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, user, dto);
  }

  @Delete(':id')
  @Roles(...COACH_ROLES)
  @ApiOperation({ summary: 'Excluir plano (exclusão lógica se já houver treinos realizados)' })
  async remove(@Param('id', uuid) id: string, @CurrentUser() user: any) {
    return this.plansService.remove(id, user);
  }

  @Post(':id/duplicate')
  @Roles(...COACH_ROLES)
  @ApiOperation({ summary: 'Duplicar plano como modelo (mesmo atleta ou outro)' })
  async duplicate(@Param('id', uuid) id: string, @CurrentUser() user: any, @Body() dto: DuplicatePlanDto) {
    return this.plansService.duplicate(id, user, dto ?? {});
  }

  @Post(':id/workouts')
  @Roles(...COACH_ROLES)
  @ApiOperation({ summary: 'Adicionar treino à planilha' })
  async addWorkout(@Param('id', uuid) id: string, @CurrentUser() user: any, @Body() dto: PlanWorkoutDto) {
    return this.plansService.addWorkout(id, user, dto);
  }

  @Patch(':id/workouts/:workoutId')
  @Roles(...COACH_ROLES)
  @ApiOperation({ summary: 'Editar treino da planilha' })
  async updateWorkout(
    @Param('id', uuid) id: string,
    @Param('workoutId', uuid) workoutId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdatePlanWorkoutDto,
  ) {
    return this.plansService.updateWorkout(id, workoutId, user, dto);
  }

  @Delete(':id/workouts/:workoutId')
  @Roles(...COACH_ROLES)
  @ApiOperation({ summary: 'Excluir treino (não realizado) da planilha' })
  async deleteWorkout(@Param('id', uuid) id: string, @Param('workoutId', uuid) workoutId: string, @CurrentUser() user: any) {
    return this.plansService.deleteWorkout(id, workoutId, user);
  }
}
