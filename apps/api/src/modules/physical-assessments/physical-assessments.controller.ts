import {
  Controller, Get, Post, Put, Param, Body, UseGuards, Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PhysicalAssessmentsService } from './physical-assessments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Avaliações Físicas')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('physical-assessments')
export class PhysicalAssessmentsController {
  constructor(private service: PhysicalAssessmentsService) {}

  @Post()
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Criar avaliação física' })
  async create(
    @CurrentUser('id') coachId: string,
    @Body() body: {
      athleteId: string;
      assessedAt?: string;
      weightKg?: number;
      heightCm?: number;
      bodyFatPct?: number;
      muscleMassPct?: number;
      restingHR?: number;
      maxHR?: number;
      vo2max?: number;
      best5kTime?: number;
      best10kTime?: number;
      flexScore?: number;
      strengthScore?: number;
      coachNotes?: string;
    },
  ) {
    return this.service.create(coachId, {
      ...body,
      assessedAt: body.assessedAt ? new Date(body.assessedAt) : undefined,
    });
  }

  @Get('athlete/:athleteId')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Histórico de avaliações de um atleta (coach)' })
  async getHistory(
    @CurrentUser('id') coachId: string,
    @Param('athleteId') athleteId: string,
  ) {
    return this.service.getHistory(coachId, athleteId, true);
  }

  @Get('athlete/:athleteId/compare')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Comparação IA entre as 2 últimas avaliações' })
  async compareWithAI(
    @CurrentUser('id') coachId: string,
    @Param('athleteId') athleteId: string,
  ) {
    return this.service.compareWithAI(coachId, athleteId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Minhas avaliações físicas (atleta)' })
  async getMyAssessments(@CurrentUser('id') athleteId: string) {
    return this.service.getHistory(athleteId, athleteId, false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma avaliação' })
  async getById(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('id') assessmentId: string,
  ) {
    const isCoach = role === UserRole.COACH || role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
    return this.service.getById(userId, assessmentId, isCoach);
  }

  @Put(':id')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar avaliação física' })
  async update(
    @CurrentUser('id') coachId: string,
    @Param('id') assessmentId: string,
    @Body() body: any,
  ) {
    return this.service.update(coachId, assessmentId, {
      ...body,
      assessedAt: body.assessedAt ? new Date(body.assessedAt) : undefined,
    });
  }
}
