import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Autenticação JWT OPCIONAL: se houver Bearer válido, popula `req.user`; senão segue sem usuário
 * (o handler decide — ex.: download do .FIT por link assinado do e-mail).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // sem token / token inválido → anônimo
    }
    return true;
  }

  handleRequest(_err: unknown, user: any) {
    return user || null;
  }
}
