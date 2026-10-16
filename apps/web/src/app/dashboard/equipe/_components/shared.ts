import { parseBRLToCents } from '../../../checkout/_lib/money';
export type TeamRole = 'OWNER' | 'ADMIN' | 'COACH' | 'STAFF';

export interface TeamMember {
  userId: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: TeamRole;
  roleLabel: string;
  isActive: boolean;
  joinedAt: string;
  athleteCount: number;
}

export interface ActiveTeamDetails {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  city: string | null;
  graceDays: number;
  role: TeamRole;
  asaasWalletId?: string | null;
  hasWallet?: boolean;
  platformFeePercent?: number;
}

export interface TeamPlan {
  id: string;
  name: string;
  description: string | null;
  interval: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
  priceInCents: number;
  benefits: string[];
  isActive: boolean;
  sortOrder: number;
  _count?: { memberships: number };
}

export const ROLE_LABEL: Record<TeamRole, string> = {
  OWNER: 'Dono(a)',
  ADMIN: 'Gestor(a)',
  COACH: 'Treinador(a)',
  STAFF: 'Apoio',
};

export const INTERVAL_LABEL: Record<TeamPlan['interval'], string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

export const MEMBERSHIP_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Aguardando pagamento', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  ACTIVE: { label: 'Em dia', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PAST_DUE: { label: 'Em atraso', cls: 'bg-red-50 text-red-700 border-red-200' },
  PAUSED: { label: 'Pausada', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  CANCELED: { label: 'Cancelada', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
};

export function brl(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
}

/** "174", "174,00", "1.234,50", "R$ 174,90" → centavos (null se inválido). */
export function parseBrlToCents(input: string): number | null {
  // pt-BR: "1.299,90", "1299,90", "1.299" (milhar), "174" — mesma regra de checkout/_lib/money
  const cents = parseBRLToCents(input);
  return cents === null || cents < 0 ? null : cents;
}

export function apiError(err: any, fallback: string): string {
  const raw = err?.response?.data?.message;
  if (Array.isArray(raw)) return raw.join(' ');
  return raw || fallback;
}

export const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30';
export const labelCls = 'block text-xs font-medium text-gray-500 mb-1';
export const btnPrimary =
  'px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed';
export const btnGhost =
  'px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50';
