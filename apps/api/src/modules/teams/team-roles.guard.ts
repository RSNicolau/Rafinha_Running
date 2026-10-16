import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isPlatformAdmin } from '../../common/utils/ownership';
import { TeamContextService } from './team-context.service';
import type { TeamRoleName } from './team-scope';

const TEAM_ROLES_KEY = 'teamRoles';

@Injectable()
export class TeamRolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private teamContext: TeamContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<TeamRoleName[]>(TEAM_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.id) return false;

    const ctx = await this.teamContext.resolve(user, req);
    if (!ctx) throw new NotFoundException('Você ainda não faz parte de nenhuma equipe');
    req.team = ctx;

    if (isPlatformAdmin(user)) return true;
    if (required.length && !required.includes(ctx.role)) {
      throw new ForbiddenException('Seu papel na equipe não permite esta ação');
    }
    return true;
  }
}
