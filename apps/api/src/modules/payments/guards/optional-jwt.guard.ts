import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT opcional: se o Bearer for válido, popula req.user; senão segue como visitante
 * (nunca lança 401 — o endpoint decide o que um visitante pode fazer).
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (!req.headers?.authorization) return true;
    return super.canActivate(context) as any;
  }

  handleRequest(_err: any, user: any) {
    return user || null;
  }
}
