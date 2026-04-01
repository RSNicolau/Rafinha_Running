import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RankingsService, RankingEntry } from './rankings.service';

@ApiTags('Rankings')
@Controller('rankings')
export class RankingsController {
  constructor(private rankingsService: RankingsService) {}

  @Get('km')
  @ApiOperation({ summary: 'Top atletas por total de km (geral ou mensal)' })
  @ApiQuery({ name: 'period', required: false, enum: ['all', 'monthly'], description: 'Periodo do ranking (geral ou mensal)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Quantidade de resultados', example: 20 })
  async getTopByKm(
    @Query('period') period: 'all' | 'monthly' = 'all',
    @Query('limit') limit?: number,
  ): Promise<RankingEntry[]> {
    return this.rankingsService.getTopByKm(period, limit || 20);
  }

  @Get('workouts')
  @ApiOperation({ summary: 'Top atletas por total de treinos concluidos' })
  @ApiQuery({ name: 'limit', required: false, description: 'Quantidade de resultados', example: 20 })
  async getTopByWorkouts(@Query('limit') limit?: number): Promise<RankingEntry[]> {
    return this.rankingsService.getTopByWorkouts(limit || 20);
  }

  @Get('streak')
  @ApiOperation({ summary: 'Top atletas por sequencia de treinos (dias consecutivos)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Quantidade de resultados', example: 20 })
  async getTopByStreak(@Query('limit') limit?: number): Promise<RankingEntry[]> {
    return this.rankingsService.getTopByStreak(limit || 20);
  }
}
