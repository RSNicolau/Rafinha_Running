import { BadRequestException, ConflictException } from '@nestjs/common';
import { promises as dns } from 'dns';
import { randomBytes } from 'crypto';

/**
 * Verificação de posse de domínio white-label (sem coluna no schema):
 *  - pedido pendente: AppConfig `domain-verify:<accountId>` = { domain, token, kind, requestedAt }
 *  - domínio verificado: AppConfig `domain-verified:<domain>` = { accountId, kind, verifiedAt }
 * O domínio só é gravado em TenantBranding.domain / WhiteLabelAccount.customDomain depois que o
 * registro TXT `_rr-verify.<domain>` contém `rr-verify=<token>`. A resolução pública exige o registro verificado.
 */
export type DomainAccountKind = 'branding' | 'white-label';

export const PENDING_PREFIX = 'domain-verify:';
export const VERIFIED_PREFIX = 'domain-verified:';
export const TXT_PREFIX = '_rr-verify.';

export type TxtResolver = (host: string) => Promise<string[][]>;
export const defaultTxtResolver: TxtResolver = (host) => dns.resolveTxt(host);

export function normalizeDomain(input: string | null | undefined): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function assertValidDomain(domain: string) {
  if (!DOMAIN_RE.test(domain)) throw new BadRequestException('Domínio inválido (ex.: app.suaassessoria.com.br)');
}

export interface PendingDomain {
  domain: string;
  token: string;
  kind: DomainAccountKind;
  requestedAt: string;
}

export function verificationInstructions(p: PendingDomain) {
  return {
    domain: p.domain,
    status: 'PENDING_VERIFICATION' as const,
    txtName: `${TXT_PREFIX}${p.domain}`,
    txtValue: `rr-verify=${p.token}`,
    requestedAt: p.requestedAt,
    message: `Crie um registro TXT em ${TXT_PREFIX}${p.domain} com o valor rr-verify=${p.token} e clique em "Verificar domínio".`,
  };
}

export async function getPendingDomain(prisma: any, accountId: string): Promise<PendingDomain | null> {
  const row = await prisma.appConfig?.findUnique?.({ where: { key: `${PENDING_PREFIX}${accountId}` } });
  const v = row?.value as any;
  return v && typeof v.domain === 'string' && typeof v.token === 'string' ? (v as PendingDomain) : null;
}

/** Dono verificado de um domínio (ou null). */
export async function verifiedOwner(prisma: any, domain: string): Promise<{ accountId: string; kind: DomainAccountKind } | null> {
  if (!domain) return null;
  const row = await prisma.appConfig?.findUnique?.({ where: { key: `${VERIFIED_PREFIX}${domain}` } });
  const v = row?.value as any;
  return v && typeof v.accountId === 'string' ? { accountId: v.accountId, kind: v.kind } : null;
}

/**
 * Registra (ou reaproveita) o pedido de verificação. Domínio já verificado por OUTRA conta → 409.
 * Retorna as instruções de DNS.
 */
export async function requestDomainVerification(prisma: any, accountId: string, kind: DomainAccountKind, rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  assertValidDomain(domain);
  const owner = await verifiedOwner(prisma, domain);
  if (owner && owner.accountId !== accountId) throw new ConflictException('Este domínio já está em uso por outra conta');
  const existing = await getPendingDomain(prisma, accountId);
  const pending: PendingDomain =
    existing && existing.domain === domain
      ? existing
      : { domain, token: randomBytes(16).toString('hex'), kind, requestedAt: new Date().toISOString() };
  await prisma.appConfig.upsert({
    where: { key: `${PENDING_PREFIX}${accountId}` },
    create: { key: `${PENDING_PREFIX}${accountId}`, value: pending as any },
    update: { value: pending as any },
  });
  return verificationInstructions(pending);
}

/**
 * Confere o TXT e, se ok, marca o domínio como verificado para a conta.
 * Retorna o domínio verificado (o chamador grava no modelo dele, tratando P2002 → 409).
 */
export async function confirmDomainVerification(
  prisma: any,
  accountId: string,
  resolver: TxtResolver = defaultTxtResolver,
): Promise<string> {
  const pending = await getPendingDomain(prisma, accountId);
  if (!pending) throw new BadRequestException('Nenhum domínio aguardando verificação');
  let records: string[][] = [];
  try {
    records = await resolver(`${TXT_PREFIX}${pending.domain}`);
  } catch {
    records = [];
  }
  const expected = `rr-verify=${pending.token}`;
  const found = records.some((chunks) => chunks.join('').trim() === expected);
  if (!found) {
    throw new BadRequestException(
      `Registro TXT não encontrado em ${TXT_PREFIX}${pending.domain}. A propagação do DNS pode levar algumas horas.`,
    );
  }
  const owner = await verifiedOwner(prisma, pending.domain);
  if (owner && owner.accountId !== accountId) throw new ConflictException('Este domínio já está em uso por outra conta');
  await prisma.appConfig.upsert({
    where: { key: `${VERIFIED_PREFIX}${pending.domain}` },
    create: { key: `${VERIFIED_PREFIX}${pending.domain}`, value: { accountId, kind: pending.kind, verifiedAt: new Date().toISOString() } },
    update: { value: { accountId, kind: pending.kind, verifiedAt: new Date().toISOString() } },
  });
  await prisma.appConfig.delete({ where: { key: `${PENDING_PREFIX}${accountId}` } }).catch(() => undefined);
  return pending.domain;
}

/** Erro de unicidade do Prisma → 409. */
export function isUniqueViolation(e: any): boolean {
  return e?.code === 'P2002';
}
