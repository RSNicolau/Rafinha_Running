import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Relatórios')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  /**
   * GET /reports/monthly/:athleteId?month=YYYY-MM
   * - Use "me" as athleteId to get your own report
   * - Coaches can pass any athleteId
   */
  @Get('monthly/:athleteId')
  @ApiOperation({ summary: 'Gerar relatório mensal em PDF — use "me" para o próprio atleta' })
  @ApiParam({ name: 'athleteId', description: 'ID do atleta ou "me" para o usuário logado' })
  @ApiQuery({ name: 'month', required: false, description: 'Mês no formato YYYY-MM (padrão: mês anterior)' })
  async getMonthlyReport(
    @CurrentUser('id') requesterId: string,
    @Param('athleteId') athleteIdParam: string,
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ) {
    // "me" is an alias for the authenticated user's own ID
    const athleteId = athleteIdParam === 'me' ? requesterId : athleteIdParam;

    const pdfBuffer = await this.reportsService.generateMonthlyPdf(requesterId, athleteId, month);

    const monthLabel = month ?? this.lastMonthString();
    const filename = `relatorio-${athleteId}-${monthLabel}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  private lastMonthString(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
