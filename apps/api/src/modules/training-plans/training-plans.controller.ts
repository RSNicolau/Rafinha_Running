import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TrainingPlansService } from './training-plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Planos de Treino')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('training-plans')
export class TrainingPlansController {
  constructor(private plansService: TrainingPlansService) {}

  @Post()
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Criar plano de treino' })
  async create(@CurrentUser('id') coachId: string, @Body() dto: CreatePlanDto) {
    return this.plansService.create(coachId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar planos de treino' })
  async findAll(@CurrentUser('id') userId: string, @CurrentUser('role') role: UserRole) {
    return this.plansService.findAll(userId, role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do plano de treino' })
  async findOne(@Param('id') id: string, @CurrentUser('id') userId: string, @CurrentUser('role') role: UserRole) {
    return this.plansService.findById(id, userId, role);
  }

  @Put(':id')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Atualizar plano de treino' })
  async update(@Param('id') id: string, @CurrentUser('id') coachId: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, coachId, dto);
  }
}
