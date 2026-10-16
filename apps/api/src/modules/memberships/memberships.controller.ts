import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MembershipsService } from './memberships.service';
import {
  CancelMembershipDto,
  ChangePlanDto,
  ListTeamMembershipsQuery,
  MarkPaidOfflineDto,
  SubscribeMembershipDto,
  TeamScopeQuery,
} from './dto/memberships.dto';

type AuthUser = { id: string; role: string };

@ApiTags('Mensalidades')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  // ── Atleta ────────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Minha mensalidade: status, planos da minha equipe, histórico de cobranças e aviso de atraso' })
  me(@CurrentUser('id') userId: string) {
    return this.memberships.getMine(userId);
  }

  @Post('subscribe')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Assinar um plano da minha equipe (1ª cobrança hoje)',
    description: 'Retorna paymentId + accessToken para a tela /pedido/[paymentId]. CPF só vai ao gateway.',
  })
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeMembershipDto) {
    return this.memberships.subscribe(user, dto);
  }

  @Post('me/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar minha mensalidade (acesso mantido até o fim do período pago)' })
  cancelMine(@CurrentUser('id') userId: string, @Body() dto: CancelMembershipDto) {
    return this.memberships.cancelMine(userId, dto?.reason);
  }

  @Post('me/change-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trocar de plano (vale a partir do próximo ciclo)' })
  changePlan(@CurrentUser('id') userId: string, @Body() dto: ChangePlanDto) {
    return this.memberships.changePlan(userId, dto.planId);
  }

  // ── Equipe (OWNER / ADMIN / STAFF; admin da plataforma com ?teamId=) ───

  @Get('team')
  @ApiOperation({ summary: 'Mensalidades da equipe (filtros: status, plano, treinador, busca; paginado)' })
  listTeam(@CurrentUser() user: AuthUser, @Query() q: ListTeamMembershipsQuery, @Req() req: any) {
    return this.memberships.listTeam(user, q, req);
  }

  @Get('team/summary')
  @ApiOperation({ summary: 'KPIs: ativos, inadimplentes, pendentes, MRR, recebido no mês, valor em atraso, vencimentos em 7 dias' })
  summary(@CurrentUser() user: AuthUser, @Query() q: TeamScopeQuery, @Req() req: any) {
    return this.memberships.summary(user, q.teamId, req);
  }

  @Get('team/export.csv')
  @ApiOperation({ summary: 'Exportar mensalidades (CSV ; — mesmos filtros da listagem)' })
  async exportCsv(@CurrentUser() user: AuthUser, @Query() q: ListTeamMembershipsQuery, @Req() req: any, @Res() res: Response) {
    const csv = await this.memberships.exportCsv(user, q, req);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mensalidades-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Post('team/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar a mensalidade de um atleta (acesso até o fim do período pago)' })
  teamCancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelMembershipDto,
    @Query() q: TeamScopeQuery,
    @Req() req: any,
  ) {
    return this.memberships.teamCancel(user, id, dto?.reason, q.teamId, req);
  }

  @Post('team/:id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pausar (cancela a assinatura no gateway; status PAUSED)' })
  pause(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: TeamScopeQuery, @Req() req: any) {
    return this.memberships.pause(user, id, q.teamId, req);
  }

  @Post('team/:id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retomar (nova assinatura; 1ª cobrança no fim do período já pago ou hoje)' })
  resume(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: TeamScopeQuery, @Req() req: any) {
    return this.memberships.resume(user, id, q.teamId, req);
  }

  @Post('team/:id/remind')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Enviar lembrete com o link da fatura (1 por dia por mensalidade)' })
  remind(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: TeamScopeQuery, @Req() req: any) {
    return this.memberships.remind(user, id, q.teamId, req);
  }

  @Post('team/:id/mark-paid-offline')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Registrar pagamento recebido por fora (dinheiro/Pix direto) — somente dono/gestor' })
  markPaidOffline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaidOfflineDto,
    @Query() q: TeamScopeQuery,
    @Req() req: any,
  ) {
    return this.memberships.markPaidOffline(user, id, dto, q.teamId, req);
  }
}
