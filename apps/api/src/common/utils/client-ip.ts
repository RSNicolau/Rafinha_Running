import { timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * IP real do cliente, resistente a spoofing:
 *  1. Se a requisição veio do nosso front (Next.js) com o segredo compartilhado PROXY_SHARED_SECRET,
 *     confia no header x-rr-client-ip que o middleware do Next preenche.
 *  2. Senão usa req.ip — com `trust proxy` configurado (TRUST_PROXY_HOPS) o Express pega o IP
 *     acrescentado pelo proxy reverso (Caddy/Nginx/Railway), não o que o cliente escreveu.
 */
export function clientIp(req: any): string {
  const secret = process.env.PROXY_SHARED_SECRET;
  const sent = req?.headers?.['x-rr-proxy-secret'];
  const forwarded = req?.headers?.['x-rr-client-ip'];
  if (secret && typeof sent === 'string' && typeof forwarded === 'string' && safeEqual(sent, secret)) {
    return forwarded.split(',')[0].trim().slice(0, 64);
  }
  return (req?.ip || req?.socket?.remoteAddress || 'unknown').toString();
}
