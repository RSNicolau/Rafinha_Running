import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt.guard';
import { WorkoutFitService } from './fit/workout-fit.service';
import { FIT_CONTENT_TYPE } from './fit/workout-fit';

/**
 * Controller separado do WorkoutsController porque a rota aceita acesso sem login (token `?t=` do e-mail);
 * o WorkoutsController exige JWT em todas as rotas.
 */
@ApiTags('Treinos')
@Controller('workouts')
export class WorkoutFitController {
  constructor(private readonly fit: WorkoutFitService) {}

  @Get(':id/fit')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ medium: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Baixar treino em arquivo .FIT (Garmin/Coros/Suunto/Wahoo)',
    description: 'Bearer do atleta dono / treinador com acesso ao atleta, ou link assinado do e-mail (?t=, 14 dias).',
  })
  @ApiQuery({ name: 't', required: false, description: 'Token assinado do link do e-mail' })
  @ApiProduces(FIT_CONTENT_TYPE)
  async download(
    @Param('id') id: string,
    @Query('t') token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.fit.buildFile(id, (req as any).user ?? null, token);
    res.setHeader('Content-Type', FIT_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(buffer);
  }
}
