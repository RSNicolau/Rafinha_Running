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
import { CreateAssessmentDto, UpdateAssessmentDto } from './dto/assessment.dto';
import { toCalendarDate } from '../../common/utils/date-only';

/** Monta o objeto de dados a partir de campos explícitos (nunca espalha o corpo da requisição). */
function pickAssessmentFields(b: UpdateAssessmentDto) {
  const out: Record<string, any> = {};
  if (b.assessedAt !== undefined) out.assessedAt = toCalendarDate(b.assessedAt);
  for (const k of [
    'weightKg', 'heightCm', 'bodyFatPct', 'muscleMassPct', 'restingHR', 'maxHR', 'vo2max',
    'best5kTime', 'best10kTime', 'flexScore', 'strengthScore', 'coachNotes',
  ] as const) {
    if (b[k] !== undefined) out[k] = b[k];
  }
  return out;
}

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
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() body: CreateAssessmentDto,
  ) {
    return this.service.create(user, {
      athleteId: body.athleteId,
      ...pickAssessmentFields(body),
    });
  }

  @Get('athlete/:athleteId')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Histórico de avaliações de um atleta (coach)' })
  async getHistory(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('athleteId') athleteId: string,
  ) {
    return this.service.getHistory(user, athleteId, true);
  }

  @Get('athlete/:athleteId/compare')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Comparação IA entre as 2 últimas avaliações' })
  async compareWithAI(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('athleteId') athleteId: string,
  ) {
    return this.service.compareWithAI(user, athleteId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Minhas avaliações físicas (atleta)' })
  async getMyAssessments(@CurrentUser('id') athleteId: string) {
    return this.service.getHistory(athleteId, athleteId, false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma avaliação' })
  async getById(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id') assessmentId: string,
  ) {
    const role = user.role;
    const isCoach = role === UserRole.COACH || role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
    return this.service.getById(user, assessmentId, isCoach);
  }

  @Put(':id')
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar avaliação física' })
  async update(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id') assessmentId: string,
    @Body() body: UpdateAssessmentDto,
  ) {
    return this.service.update(user, assessmentId, pickAssessmentFields(body));
  }
}
