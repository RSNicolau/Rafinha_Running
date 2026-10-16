import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadsService } from '../uploads/uploads.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TeamsService } from './teams.service';
import { TeamContext, TeamContextService } from './team-context.service';
import { CurrentTeam, TeamRoles } from './team-roles.decorator';
import {
  AcceptTeamInviteDto, AssignCoachDto, CreateTeamPlanDto, InviteMemberDto, ListTeamAthletesQueryDto,
  TransferOwnershipDto, UpdateMemberDto, UpdateTeamDto, UpdateTeamFeeDto, UpdateTeamPlanDto,
} from './dto/teams.dto';

type AuthUser = { id: string; role: UserRole; email?: string | null };

@ApiTags('Equipes')
@Controller('teams')
export class TeamsController {
  constructor(private teams: TeamsService, private teamContext: TeamContextService, private uploads: UploadsService) {}

  // ── Público ──────────────────────────────────────────────────────────────

  @Get('public/:slug')
  @ApiOperation({ summary: 'Dados públicos da equipe + planos de mensalidade ativos' })
  getPublic(@Param('slug') slug: string) {
    return this.teams.getPublicTeam(slug);
  }

  @Get('invites/check')
  @Throttle({ medium: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Informações de um convite de equipe (tela de cadastro)' })
  checkInvite(@Query('token') token: string) {
    return this.teams.checkInvite(token);
  }

  // ── Autenticado ──────────────────────────────────────────────────────────

  @Post('invites/accept')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceitar convite de equipe (conta de treinador com o e-mail do convite)' })
  acceptInvite(@CurrentUser() user: AuthUser, @Body() dto: AcceptTeamInviteDto) {
    return this.teams.acceptInvite(user, dto.token);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-team-id', required: false, description: 'Equipe ativa (quando o usuário pertence a mais de uma)' })
  @ApiOperation({ summary: 'Minhas equipes e a equipe ativa' })
  async getMine(@CurrentUser() user: AuthUser, @Req() req: any) {
    const ctx = await this.teamContext.resolve(user, req);
    return this.teams.getMyTeams(user, ctx);
  }

  @Put('me')
  @TeamRoles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar dados da equipe (carteira Asaas: somente OWNER)' })
  updateTeam(@CurrentUser() user: AuthUser, @CurrentTeam() ctx: TeamContext, @Body() dto: UpdateTeamDto) {
    return this.teams.updateTeam(user, ctx, dto);
  }

  @Post('me/logo')
  @TeamRoles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload do logo da equipe (PNG/JPG/WebP, valida o conteúdo) — grava em logoUrl' })
  async uploadLogo(@CurrentUser() user: AuthUser, @CurrentTeam() ctx: TeamContext, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    const url = await this.uploads.uploadPublicImage(file, `teams/${ctx.teamId}/logo-${Date.now()}`);
    return this.teams.updateTeam(user, ctx, { logoUrl: url } as UpdateTeamDto);
  }

  // Membros
  @Get('me/invites')
  @TeamRoles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Convites enviados nos últimos 7 dias ainda não aceitos (via AuditLog)' })
  listInvites(@CurrentTeam() ctx: TeamContext) {
    return this.teams.listRecentInvites(ctx);
  }

  @Get('me/members')
  @TeamRoles('OWNER', 'ADMIN', 'COACH', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Membros da equipe (treinadores, gestores, apoio)' })
  listMembers(@CurrentTeam() ctx: TeamContext) {
    return this.teams.listMembers(ctx);
  }

  @Post('me/members/invite')
  @TeamRoles('OWNER', 'ADMIN')
  @Throttle({ medium: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Convidar membro (ADMIN, COACH, STAFF) por e-mail' })
  invite(@CurrentUser() user: AuthUser, @CurrentTeam() ctx: TeamContext, @Body() dto: InviteMemberDto) {
    return this.teams.inviteMember(user, ctx, dto);
  }

  @Patch('me/members/:userId')
  @TeamRoles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alterar papel / ativar / desativar membro' })
  updateMember(
    @CurrentUser() user: AuthUser,
    @CurrentTeam() ctx: TeamContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.teams.updateMember(user, ctx, userId, dto);
  }

  @Delete('me/members/:userId')
  @TeamRoles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desativar membro (atletas dele voltam para o dono)' })
  deactivateMember(@CurrentUser() user: AuthUser, @CurrentTeam() ctx: TeamContext, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.teams.deactivateMember(user, ctx, userId);
  }

  @Post('me/transfer-ownership')
  @TeamRoles('OWNER')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transferir a propriedade da equipe (o dono atual vira gestor)' })
  transfer(@CurrentUser() user: AuthUser, @CurrentTeam() ctx: TeamContext, @Body() dto: TransferOwnershipDto) {
    return this.teams.transferOwnership(user, ctx, dto.userId);
  }

  // Atletas
  @Get('me/athletes')
  @TeamRoles('OWNER', 'ADMIN', 'COACH', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atletas da equipe (treinador: somente os atribuídos a ele)' })
  listAthletes(@CurrentUser() user: AuthUser, @CurrentTeam() ctx: TeamContext, @Query() q: ListTeamAthletesQueryDto) {
    return this.teams.listAthletes(user, ctx, q);
  }

  @Patch('me/athletes/:athleteId/coach')
  @TeamRoles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atribuir / trocar o treinador responsável pelo atleta' })
  assignCoach(@CurrentTeam() ctx: TeamContext, @Param('athleteId', ParseUUIDPipe) athleteId: string, @Body() dto: AssignCoachDto) {
    return this.teams.assignCoach(ctx, athleteId, dto);
  }

  // Planos de mensalidade
  @Get('me/plans')
  @TeamRoles('OWNER', 'ADMIN', 'COACH', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Planos de mensalidade da equipe' })
  listPlans(@CurrentTeam() ctx: TeamContext) {
    return this.teams.listPlans(ctx);
  }

  @Post('me/plans')
  @TeamRoles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar plano de mensalidade' })
  createPlan(@CurrentTeam() ctx: TeamContext, @Body() dto: CreateTeamPlanDto) {
    return this.teams.createPlan(ctx, dto);
  }

  @Put('me/plans/:id')
  @TeamRoles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar plano de mensalidade' })
  updatePlan(@CurrentTeam() ctx: TeamContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTeamPlanDto) {
    return this.teams.updatePlan(ctx, id, dto);
  }

  @Delete('me/plans/:id')
  @TeamRoles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Excluir plano (desativa se houver mensalidades vinculadas)' })
  deletePlan(@CurrentTeam() ctx: TeamContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.teams.deletePlan(ctx, id);
  }
}

/** Rotas da equipe da plataforma (ADMIN/SUPER_ADMIN). */
@ApiTags('Equipes (plataforma)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/teams')
export class AdminTeamsController {
  constructor(private teams: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar equipes (plataforma)' })
  list(@Query('search') search?: string) {
    return this.teams.listAllTeams({ search });
  }

  @Put(':id/fee')
  @ApiOperation({ summary: 'Definir taxa da plataforma da equipe (%)' })
  setFee(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTeamFeeDto) {
    return this.teams.setPlatformFee(id, dto.platformFeePercent);
  }
}
