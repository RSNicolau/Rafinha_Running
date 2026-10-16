import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RankingEntry, RankingPeriod, RankingsService } from './rankings.service';

/**
 * Rankings exigem login e são sempre escopados à equipe do chamador:
 *  - atleta → a equipe dele (nomes dos colegas como "Nome I.");
 *  - treinador/dono → a equipe ativa (header x-team-id ou padrão);
 *  - ADMIN/SUPER_ADMIN → toda a plataforma ou ?teamId=.
 */
@ApiTags('Rankings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('rankings')
export class RankingsController {
  constructor(private rankingsService: RankingsService) {}

  @Get('km')
  @ApiOperation({ summary: 'Top atletas da equipe por km' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year', 'all'] })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'teamId', required: false, description: 'Somente ADMIN/SUPER_ADMIN ou membros da equipe' })
  async getTopByKm(
    @CurrentUser() user: any,
    @Req() req: any,
    @Query('period') period?: RankingPeriod,
    @Query('limit') limit?: number,
    @Query('teamId') teamId?: string,
  ): Promise<RankingEntry[]> {
    const scope = await this.rankingsService.resolveScope(user, req, teamId);
    return this.rankingsService.getTopByKm(period || 'all', limit || 20, scope, this.rankingsService.viewerFor(user));
  }

  @Get('workouts')
  @ApiOperation({ summary: 'Top atletas da equipe por treinos concluídos' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year', 'all'] })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'teamId', required: false })
  async getTopByWorkouts(
    @CurrentUser() user: any,
    @Req() req: any,
    @Query('period') period?: RankingPeriod,
    @Query('limit') limit?: number,
    @Query('teamId') teamId?: string,
  ): Promise<RankingEntry[]> {
    const scope = await this.rankingsService.resolveScope(user, req, teamId);
    return this.rankingsService.getTopByWorkouts(period || 'all', limit || 20, scope, this.rankingsService.viewerFor(user));
  }

  @Get('streak')
  @ApiOperation({ summary: 'Top atletas da equipe por sequência de dias com treino' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'teamId', required: false })
  async getTopByStreak(
    @CurrentUser() user: any,
    @Req() req: any,
    @Query('limit') limit?: number,
    @Query('teamId') teamId?: string,
  ): Promise<RankingEntry[]> {
    const scope = await this.rankingsService.resolveScope(user, req, teamId);
    return this.rankingsService.getTopByStreak(limit || 20, scope, this.rankingsService.viewerFor(user));
  }
}
