/** Cliente das mensalidades do atleta (GET /memberships/me etc.). */
import { apiFetch, CheckoutBuyer, onlyDigits, rememberPaymentToken } from '../../checkout/_lib/checkout';

export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELED';
export type BillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';

export interface TeamPlan {
  id: string;
  name: string;
  description: string | null;
  interval: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
  priceInCents: number;
  monthlyEquivalentInCents: number;
  benefits: string[];
}

export interface MyMembership {
  team: { id: string; name: string; slug: string; logoUrl: string | null } | null;
  membership: {
    id: string;
    status: MembershipStatus;
    plan: { id: string; name: string; interval: string };
    priceInCents: number;
    provider: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    nextDueDate: string | null;
    canceledAt: string | null;
    hasAccess: boolean;
    inGracePeriod: boolean;
    openInvoice: { paymentId: string; amountInCents: number; dueDate: string | null; invoiceUrl: string | null; payPath: string; overdue: boolean } | null;
  } | null;
  plans: TeamPlan[];
  payments: Array<{
    id: string;
    amountInCents: number;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
    method: string | null;
    dueDate: string | null;
    paidAt: string | null;
    invoiceUrl: string | null;
    payPath: string | null;
  }>;
  legacySubscription: { planType: string; status: string; provider: string; currentPeriodEnd: string } | null;
  access: { active: boolean; banner: 'PAST_DUE' | 'IN_GRACE' | 'PENDING' | 'CANCELED' | null; blocksTraining: boolean };
  methods: { provider: string | null; pix: boolean; boleto: boolean; creditCard: boolean; fake: boolean };
}

export interface MembershipCheckout {
  membershipId: string;
  membershipStatus: MembershipStatus;
  paymentId: string | null;
  accessToken: string | null;
  provider: string;
  amountInCents: number;
  payPath: string | null;
}

export const INTERVAL_LABEL: Record<string, string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

export const INTERVAL_PERIOD: Record<string, string> = {
  MONTHLY: '/mês',
  QUARTERLY: 'a cada 3 meses',
  SEMIANNUAL: 'a cada 6 meses',
  ANNUAL: 'por ano',
};

export const STATUS_LABEL: Record<MembershipStatus, string> = {
  PENDING: 'Aguardando pagamento',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Em atraso',
  PAUSED: 'Pausada',
  CANCELED: 'Cancelada',
};

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

export function getMyMembership() {
  return apiFetch<MyMembership>('/memberships/me');
}

export async function subscribeMembership(planId: string, buyer: CheckoutBuyer, billingType: BillingType) {
  const r = await apiFetch<MembershipCheckout>('/memberships/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      planId,
      billingType,
      buyer: {
        name: buyer.name.trim(),
        email: buyer.email.trim(),
        cpf: onlyDigits(buyer.cpf),
        ...(buyer.phone ? { phone: onlyDigits(buyer.phone) } : {}),
      },
    }),
  });
  if (r.paymentId && r.accessToken) rememberPaymentToken(r.paymentId, r.accessToken);
  return r;
}

export function cancelMyMembership(reason?: string) {
  return apiFetch<{ status: string; accessUntil: string | null }>('/memberships/me/cancel', {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function changeMyPlan(planId: string) {
  return apiFetch('/memberships/me/change-plan', { method: 'POST', body: JSON.stringify({ planId }) });
}
