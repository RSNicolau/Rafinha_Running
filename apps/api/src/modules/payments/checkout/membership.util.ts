import { Logger } from '@nestjs/common';
import type { AsaasCycle, AsaasSplit } from '../asaas/asaas.service';

/**
 * Regras puras de mensalidade (periodicidade, MRR, split, carência) — compartilhadas pelo
 * checkout/webhook (módulo payments) e pelo módulo memberships.
 */

export type Interval = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

const MONTHS: Record<Interval, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 };
const CYCLES: Record<Interval, AsaasCycle> = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  SEMIANNUAL: 'SEMIANNUALLY',
  ANNUAL: 'YEARLY',
};

export function intervalMonths(interval: string | null | undefined): number {
  return MONTHS[(interval ?? 'MONTHLY') as Interval] ?? 1;
}

export function asaasCycle(interval: string | null | undefined): AsaasCycle {
  return CYCLES[(interval ?? 'MONTHLY') as Interval] ?? 'MONTHLY';
}

/** Equivalente mensal (para MRR): trimestral/3, semestral/6, anual/12. */
export function monthlyEquivalentCents(priceInCents: number, interval: string | null | undefined): number {
  return Math.round((priceInCents || 0) / intervalMonths(interval));
}

/** Soma meses preservando o dia; se o mês de destino for mais curto, usa o último dia (31/01 + 1 → 28/02). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * Data do Asaas (YYYY-MM-DD, fuso de São Paulo) → instante da meia-noite em São Paulo (UTC-3,
 * sem horário de verão desde 2019). Retorna null para entrada inválida.
 */
export function dateFromAsaas(ymd: string | null | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return null;
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Instante → YYYY-MM-DD no fuso de São Paulo. */
export function toAsaasDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const DAY_MS = 86_400_000;

/**
 * A cobrança venceu em `dueDate` e a carência de `graceDays` dias já terminou?
 * O dia do vencimento conta inteiro (pagar no próprio dia nunca é atraso): com vencimento 10/10 e
 * 5 dias de carência, vira inadimplente a partir de 16/10 00:00 (SP).
 */
export function isBeyondGrace(dueDate: Date, graceDays: number, now = new Date()): boolean {
  const grace = Math.max(0, Math.floor(graceDays || 0));
  return now.getTime() >= dueDate.getTime() + (grace + 1) * DAY_MS;
}

/** Vencida (após o dia do vencimento) mas ainda dentro da carência. */
export function isInGrace(dueDate: Date, graceDays: number, now = new Date()): boolean {
  return now.getTime() >= dueDate.getTime() + DAY_MS && !isBeyondGrace(dueDate, graceDays, now);
}

const splitLogger = new Logger('TeamSplit');

/**
 * Split do Asaas para a equipe: a equipe recebe (100 − platformFeePercent)% na carteira dela.
 * Sem carteira → sem split (o valor fica na conta da plataforma; repasse manual) + aviso no log.
 * Nunca devolve split com walletId vazio.
 */
export function buildTeamSplit(
  team: { id?: string; asaasWalletId?: string | null; platformFeePercent?: number | null } | null | undefined,
): AsaasSplit[] | undefined {
  if (!team) return undefined;
  const walletId = (team.asaasWalletId ?? '').trim();
  if (!walletId) {
    splitLogger.warn(`Equipe ${team.id ?? '?'} sem asaasWalletId — cobrança SEM split (valor fica na conta da plataforma; repasse manual)`);
    return undefined;
  }
  const fee = Math.min(100, Math.max(0, Number(team.platformFeePercent ?? 0) || 0));
  const percentualValue = Math.round((100 - fee) * 100) / 100;
  if (percentualValue <= 0) return undefined;
  return [{ walletId, percentualValue }];
}

export type TeamForSplit = { id: string; asaasWalletId: string | null; platformFeePercent: number; ownerId?: string };

/**
 * Equipe de um usuário da equipe (treinador do produto / criador do evento / gestor):
 * vínculo ativo em TeamMember com um dos papéis → equipe; senão, equipe da qual é dono (Team.ownerId).
 * Tolerante a falhas: erro de banco → null (a cobrança segue sem split, com aviso).
 */
export async function resolveTeamOfUser(
  prisma: any,
  userId: string | null | undefined,
  roles: string[] = ['OWNER', 'ADMIN', 'COACH'],
): Promise<TeamForSplit | null> {
  if (!userId) return null;
  const select = { id: true, asaasWalletId: true, platformFeePercent: true, ownerId: true };
  try {
    const member = await prisma.teamMember.findFirst({
      where: { userId, isActive: true, role: { in: roles }, team: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'asc' },
      select: { team: { select } },
    });
    if (member?.team) return member.team;
    const owned = await prisma.team.findFirst({ where: { ownerId: userId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select });
    return owned ?? null;
  } catch (e: any) {
    splitLogger.warn(`Não foi possível resolver a equipe do usuário ${userId}: ${e?.message}`);
    return null;
  }
}
