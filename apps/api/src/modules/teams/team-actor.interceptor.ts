import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';
import { TeamContextService } from './team-context.service';

/**
 * Anexa a equipe ATIVA do chamador em `req.user.team` (header x-team-id validado pelo TeamContextService).
 * Assim `@CurrentUser() user` já carrega o contexto usado pelo escopo de conteúdo (loja/eventos) —
 * o conteúdo é sempre filtrado pela equipe ativa, nunca por todas as equipes do usuário.
 * Atletas e visitantes não recebem contexto. Header de equipe alheia → 403 (do TeamContextService).
 */
@Injectable()
export class TeamActorInterceptor implements NestInterceptor {
  constructor(private readonly teamContext: TeamContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (!user?.id || user.role === 'ATHLETE' || user.team !== undefined) return next.handle();
    return from(this.teamContext.resolve(user, req)).pipe(
      switchMap((team) => {
        user.team = team ?? null;
        return next.handle();
      }),
    );
  }
}
