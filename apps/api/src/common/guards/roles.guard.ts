import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Regras:
 *  - SUPER_ADMIN passa em qualquer rota com @Roles.
 *  - ADMIN passa em qualquer rota com @Roles, EXCETO quando a rota exige exclusivamente SUPER_ADMIN
 *    (ex.: @Roles(UserRole.SUPER_ADMIN)). O ADMIN é amplo porque a dona do negócio opera como coach.
 *  - Demais papéis: precisam estar listados em @Roles.
 */
export function isRoleAllowed(userRole: string | undefined | null, requiredRoles: UserRole[]): boolean {
  if (!userRole) return false;
  if (userRole === UserRole.SUPER_ADMIN) return true;
  const superAdminOnly = requiredRoles.length > 0 && requiredRoles.every((r) => r === UserRole.SUPER_ADMIN);
  if (userRole === UserRole.ADMIN) return !superAdminOnly;
  return requiredRoles.includes(userRole as UserRole);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    // Guard against missing user object (e.g. malformed JWT)
    if (!user) return false;
    return isRoleAllowed(user.role, requiredRoles);
  }
}
