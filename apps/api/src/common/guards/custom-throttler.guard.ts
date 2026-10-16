import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { clientIp } from '../utils/client-ip';

/**
 * Rate-limit por userId autenticado quando disponível; senão pelo IP real do cliente.
 * O IP vem de `clientIp(req)`: header x-rr-client-ip apenas quando assinado com PROXY_SHARED_SECRET
 * (middleware do Next), ou req.ip com `trust proxy` configurado. Nunca confia no primeiro
 * X-Forwarded-For enviado pelo cliente (trivialmente forjável → bypass do throttler).
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user?.id) return `user:${req.user.id}`;
    return `ip:${clientIp(req)}`;
  }
}
