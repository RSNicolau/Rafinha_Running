import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUserLike } from '../../common/utils/ownership';
import { TEAM_HEADER, TeamContext, TeamContextService } from '../teams/team-context.service';

export type ResolvedTeam = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  logoUrl: string | null;
  asaasWalletId: string | null;
  platformFeePercent: number;
  graceDays: number;
};

const TEAM_SELECT = {
  id: true,
  name: true,
  slug: true,
  ownerId: true,
  logoUrl: true,
  asaasWalletId: true,
  platformFeePercent: true,
  graceDays: true,
} as const;

/** Papéis da equipe com acesso ao financeiro das mensalidades (COACH não tem). */
export const BILLING_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;
/** Ações sensíveis (ex.: registrar pagamento por fora): só OWNER/ADMIN. */
export const MANAGER_ROLES = ['OWNER', 'ADMIN'] as const;

/**
 * Adaptador do módulo de mensalidades sobre o TeamContextService (módulo teams):
 *  - gestor: equipe ativa resolvida pelo TeamContextService (header `x-team-id`, ou `?teamId=` como alias),
 *    exigindo um dos papéis de `roles` (padrão OWNER/ADMIN/STAFF — COACH não acessa o financeiro);
 *  - atleta: AthleteProfile.teamId; fallback: equipe do treinador responsável (AthleteProfile.coachId).
 */
@Injectable()
export class TeamContextResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TeamContextService,
  ) {}

  async teamForManager(
    user: AuthUserLike,
    requestedTeamId?: string | null,
    req?: any,
    roles: readonly string[] = BILLING_ROLES,
  ): Promise<ResolvedTeam> {
    if (!user?.id) throw new ForbiddenException('Acesso negado');
    const effectiveReq = requestedTeamId ? { headers: { [TEAM_HEADER]: requestedTeamId } } : req;
    let context: TeamContext | null;
    try {
      context = await this.ctx.resolve(user, effectiveReq);
    } catch (e) {
      // ?teamId de outra equipe: 404 sem revelar existência
      if (requestedTeamId && e instanceof ForbiddenException) throw new NotFoundException('Equipe não encontrada');
      throw e;
    }
    if (!context) throw new NotFoundException('Equipe não encontrada');
    if (!roles.includes(context.role)) {
      throw new ForbiddenException(
        roles.includes('STAFF')
          ? 'Somente dono, gestor ou equipe de apoio acessam as mensalidades'
          : 'Somente o dono ou um gestor da equipe pode fazer isso',
      );
    }
    const team = await this.prisma.team.findUnique({ where: { id: context.teamId }, select: TEAM_SELECT });
    if (!team) throw new NotFoundException('Equipe não encontrada');
    return team;
  }

  /** Equipe do atleta (ou null). */
  async teamForAthlete(athleteId: string): Promise<ResolvedTeam | null> {
    const profile = await this.prisma.athleteProfile.findUnique({
      where: { userId: athleteId },
      select: { teamId: true, coachId: true },
    });
    if (profile?.teamId) {
      const t = await this.prisma.team.findUnique({ where: { id: profile.teamId }, select: TEAM_SELECT });
      if (t) return t;
    }
    if (profile?.coachId) {
      const member = await this.prisma.teamMember.findFirst({
        where: { userId: profile.coachId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { team: { select: TEAM_SELECT } },
      });
      if (member?.team) return member.team;
      return this.prisma.team.findFirst({ where: { ownerId: profile.coachId }, orderBy: { createdAt: 'asc' }, select: TEAM_SELECT });
    }
    return null;
  }
}
