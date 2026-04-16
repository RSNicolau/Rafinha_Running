import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BadgesService } from './badges.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Badges')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('badges')
export class BadgesController {
  constructor(private badgesService: BadgesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os badges com status do atleta logado' })
  async getMyBadges(@CurrentUser('id') athleteId: string) {
    return this.badgesService.getAthleteBadges(athleteId);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Últimos badges conquistados pelo atleta logado' })
  async getRecentBadges(@CurrentUser('id') athleteId: string) {
    return this.badgesService.getRecentBadges(athleteId, 3);
  }

  @Get('athlete/:athleteId')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Badges de um atleta específico (coach)' })
  async getAthleteBadges(@Param('athleteId') athleteId: string) {
    return this.badgesService.getAthleteBadges(athleteId);
  }

  @Post('check')
  @ApiOperation({ summary: 'Verificar e conceder badges pendentes (atleta logado)' })
  async checkMyBadges(@CurrentUser('id') athleteId: string) {
    const awarded = await this.badgesService.checkAndAwardBadges(athleteId);
    return { awarded, count: awarded.length };
  }

  @Post('check/:athleteId')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Verificar e conceder badges de um atleta (coach)' })
  async checkAthleteBadges(@Param('athleteId') athleteId: string) {
    const awarded = await this.badgesService.checkAndAwardBadges(athleteId);
    return { awarded, count: awarded.length };
  }

  @Post('seed')
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Inicializar badges padrão (admin/coach)' })
  async seedBadges() {
    return this.badgesService.seedBadges();
  }
}
