import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Estado OAuth (anti-CSRF) — nonce aleatório de uso único guardado no servidor (tabela app_configs).
 *
 *  - `state` = 32 bytes aleatórios (hex). Nunca carrega o userId em claro.
 *  - registro: { userId, provider, client, expiresAt } com TTL de 10 minutos.
 *  - consumo atômico: `deleteMany` só devolve count=1 para UMA requisição concorrente; as outras falham.
 *  - vínculo com o navegador (web): cookie HttpOnly `rr_oauth_nonce` = sha256(state), definido na resposta
 *    autenticada de POST /integrations/:provider/connect (mesma origem via rewrite do Next).
 *  - mobile (sem cookie compartilhado): o callback devolve code+state ao app por deep link e o app conclui em
 *    POST /integrations/:provider/complete (JWT) — o servidor exige state.userId === usuário autenticado.
 */

export type OAuthClient = 'web' | 'mobile';

export interface OAuthStateRecord {
  userId: string;
  provider: string;
  client: OAuthClient;
  expiresAt: string;
}

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_NONCE_COOKIE = 'rr_oauth_nonce';
const STATE_RE = /^[a-f0-9]{64}$/;

export function oauthStateKey(provider: string, state: string): string {
  return `oauth_state:${provider.toLowerCase()}:${state}`;
}

export function isWellFormedState(state: unknown): state is string {
  return typeof state === 'string' && STATE_RE.test(state);
}

export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

/** Compara o cookie (hash) com o state recebido em tempo constante. */
export function cookieMatchesState(cookieValue: string | undefined | null, state: string): boolean {
  if (!cookieValue || !isWellFormedState(state)) return false;
  const expected = Buffer.from(hashOAuthState(state));
  const got = Buffer.from(String(cookieValue));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Lê um cookie do header bruto (a API não usa cookie-parser). */
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export async function createOAuthState(
  prisma: any,
  provider: string,
  userId: string,
  client: OAuthClient = 'web',
): Promise<string> {
  const state = randomBytes(32).toString('hex');
  const value: OAuthStateRecord = {
    userId,
    provider: provider.toUpperCase(),
    client,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
  };
  const key = oauthStateKey(provider, state);
  await prisma.appConfig.upsert({ where: { key }, create: { key, value }, update: { value } });

  // Limpeza oportunista de estados abandonados (> 1h). Nunca bloqueia nem falha o fluxo.
  void Promise.resolve()
    .then(() =>
      prisma.appConfig.deleteMany({
        where: { key: { startsWith: 'oauth_state:' }, createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
      }),
    )
    .catch(() => undefined);

  return state;
}

function parseRecord(provider: string, raw: any): OAuthStateRecord | null {
  if (!raw || typeof raw !== 'object' || typeof raw.userId !== 'string' || !raw.userId) return null;
  if (raw.provider && String(raw.provider).toUpperCase() !== provider.toUpperCase()) return null;
  return {
    userId: raw.userId,
    provider: provider.toUpperCase(),
    client: raw.client === 'mobile' ? 'mobile' : 'web',
    expiresAt: String(raw.expiresAt ?? ''),
  };
}

function isExpired(rec: OAuthStateRecord): boolean {
  const t = new Date(rec.expiresAt).getTime();
  return !Number.isFinite(t) || Date.now() > t;
}

/** Lê o estado SEM consumir (usado pelo callback público para decidir web vs mobile). */
export async function peekOAuthState(prisma: any, provider: string, state: string): Promise<OAuthStateRecord | null> {
  if (!isWellFormedState(state)) return null;
  const row = await prisma.appConfig.findUnique({ where: { key: oauthStateKey(provider, state) } });
  const rec = parseRecord(provider, row?.value);
  if (!rec || isExpired(rec)) return null;
  return rec;
}

/**
 * Consome o estado de forma atômica (uso único). Lança 400 se inválido/expirado/já usado
 * e 403 se `expectedUserId` foi informado e não bate com o dono do estado.
 */
export async function consumeOAuthState(
  prisma: any,
  provider: string,
  state: string,
  expectedUserId?: string,
): Promise<OAuthStateRecord> {
  if (!isWellFormedState(state)) throw new BadRequestException('Estado OAuth inválido ou expirado');
  const key = oauthStateKey(provider, state);
  const row = await prisma.appConfig.findUnique({ where: { key } });
  const rec = parseRecord(provider, row?.value);
  if (!rec) throw new BadRequestException('Estado OAuth inválido ou expirado');

  if (expectedUserId !== undefined && rec.userId !== expectedUserId) {
    // Não consome: o dono legítimo ainda pode concluir dentro do TTL.
    throw new ForbiddenException('Esta autorização foi iniciada por outra conta.');
  }

  const { count } = await prisma.appConfig.deleteMany({ where: { key } });
  if (count !== 1) throw new BadRequestException('Estado OAuth já utilizado. Tente conectar novamente.');
  if (isExpired(rec)) throw new BadRequestException('Estado OAuth expirado. Tente novamente.');
  return rec;
}
