import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Protege endpoints operacionais (/metrics, /health/detailed):
 * aceita header `x-metrics-token` igual a METRICS_TOKEN (scrapers Prometheus/uptime)
 * OU um JWT válido de SUPER_ADMIN.
 */
@Injectable()
export class MetricsAccessGuard implements CanActivate {
  private readonly jwtGuard: CanActivate = new (AuthGuard('jwt'))();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const expected = process.env.METRICS_TOKEN;
    const sent = req?.headers?.['x-metrics-token'];
    if (expected && typeof sent === 'string' && safeEqual(sent, expected)) {
      return true;
    }

    const authHeader = req?.headers?.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Acesso restrito');
    }

    let ok = false;
    try {
      ok = (await this.jwtGuard.canActivate(context)) as boolean;
    } catch {
      throw new UnauthorizedException('Acesso restrito');
    }
    if (!ok || req.user?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Acesso restrito');
    }
    return true;
  }
}
