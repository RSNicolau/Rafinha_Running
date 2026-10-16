import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isPlatformAdmin } from '../../common/utils/ownership';
import { activeMemberships, pickDefaultMembership, TeamRoleName } from './team-scope';

export const TEAM_HEADER = 'x-team-id';

export interface TeamContext {
  teamId: string;
  role: TeamRoleName;
  /** true quando o acesso vem do papel global ADMIN/SUPER_ADMIN (sem ser membro). */
  platformAdmin?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TeamContextService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolve a equipe ativa do usuário:
   *  - header `x-team-id` (validado contra os memberships ativos; ADMIN/SUPER_ADMIN da plataforma podem
   *    escolher qualquer equipe existente e atuam como OWNER);
   *  - senão, a primeira equipe em que é OWNER/ADMIN; senão a primeira em que é membro;
   *  - null quando não pertence a nenhuma equipe.
   */
  async resolve(user: { id: string; role?: string | null } | null | undefined, req?: any): Promise<TeamContext | null> {
    if (!user?.id) return null;
    const raw = req?.headers?.[TEAM_HEADER];
    const header = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? '').trim() : '';
    const memberships = await activeMemberships(this.prisma, user.id);

    if (header) {
      const m = memberships.find((x) => x.teamId === header);
      if (m) return { teamId: m.teamId, role: m.role };
      if (isPlatformAdmin(user) && UUID_RE.test(header)) {
        const team = await this.prisma.team.findUnique({ where: { id: header }, select: { id: true } });
        if (team) return { teamId: team.id, role: 'OWNER', platformAdmin: true };
      }
      throw new ForbiddenException('Você não pertence a esta equipe');
    }

    const chosen = pickDefaultMembership(memberships);
    return chosen ? { teamId: chosen.teamId, role: chosen.role } : null;
  }
}
