import { AuthGuard } from '@nestjs/passport';
import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata, UseGuards } from '@nestjs/common';
import { TeamRolesGuard } from './team-roles.guard';
import type { TeamRoleName } from './team-scope';

export const TEAM_ROLES_KEY = 'teamRoles';

/**
 * Exige equipe ativa (ver TeamContextService) com um dos papéis indicados.
 * ADMIN/SUPER_ADMIN da plataforma ignoram a checagem de papel. Já inclui AuthGuard('jwt') (na ordem certa).
 * O contexto fica em `req.team` — leia com @CurrentTeam().
 */
export const TeamRoles = (...roles: TeamRoleName[]) =>
  applyDecorators(SetMetadata(TEAM_ROLES_KEY, roles), UseGuards(AuthGuard('jwt'), TeamRolesGuard));

export const CurrentTeam = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().team ?? null;
});
