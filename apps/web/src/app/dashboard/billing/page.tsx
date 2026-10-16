'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import PlatformPlanCheckout from '../../checkout/_components/PlatformPlanCheckout';

/**
 * Assinatura da PLATAFORMA (plano do dono da assessoria). Planos de atleta (mensalidades) ficam em
 * /dashboard/mensalidades — nada de plano de atleta aqui. Cobrança via Asaas (ou FAKE em teste).
 */

interface PaymentRecord {
  id: string;
  amount: number;
  status: string;
  provider: string;
  purpose?: string | null;
  paidAt: string | null;
  createdAt: string;
  planId?: string | null;
}

interface PaymentHistory {
  data: PaymentRecord[];
  total: number;
}

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  SUCCEEDED: { label: 'Pago', color: '#059669' },
  PENDING: { label: 'Pendente', color: '#D97706' },
  FAILED: { label: 'Não pago', color: '#DC2626' },
  REFUNDED: { label: 'Estornado', color: '#6B7280' },
};

const SUB_STATUS_LABEL: Record<string, string> = {
  TRIAL: 'Período de teste',
  ACTIVE: 'Ativo',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelado',
  SUSPENDED: 'Suspenso',
};

const PROVIDER_LABEL: Record<string, string> = { ASAAS: 'Asaas', FAKE: 'Teste', STRIPE: 'Stripe', PAGARME: 'Pagar.me', MERCADO_PAGO: 'Mercado Pago' };

const PLAN_COLORS: Record<string, string> = {
  STARTER: '#6366F1', PRO: '#0EA5E9', SCALE: '#8B5CF6', ELITE: '#DC2626', WHITE_LABEL: '#F59E0B',
};

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PlatformPlanCard() {
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    api.get('/platform/my-subscription')
      .then((r) => setSub(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="glass-card p-6 mb-6 animate-pulse">
        <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
        <div className="h-6 w-24 bg-gray-100 rounded" />
      </div>
    );
  }

  const noPlan = !sub || sub.status === 'NONE';
  const trial = sub?.trial;
  const planName = noPlan ? 'Período de teste' : sub?.plan?.name ?? 'Sem plano';
  const planType = sub?.plan?.type;
  const color = planType ? PLAN_COLORS[planType] ?? '#DC2626' : '#6B7280';
  // sem plano o limite é o do período de teste (não "ilimitado")
  const maxAthletes: number | null = noPlan ? trial?.maxAthletes ?? 5 : sub?.plan?.maxAthletes ?? null;
  const athleteCount = sub?.athleteCount ?? 0;
  const percent = maxAthletes ? Math.round((athleteCount / maxAthletes) * 100) : 0;
  const isOverLimit = maxAthletes !== null && athleteCount >= maxAthletes;

  return (
    <div className="glass-card p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Plano da plataforma</p>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            {planName}
          </h2>
          {sub?.plan && (
            <p className="text-sm text-gray-500 mt-0.5">R$ {((sub.plan.priceInCents ?? 0) / 100).toFixed(2).replace('.', ',')}/mês</p>
          )}
        </div>
        <Link href="/pricing" className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 transition">
          Comparar planos →
        </Link>
      </div>

      {maxAthletes !== null ? (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Atletas cadastrados</span>
            <span className={isOverLimit ? 'text-red-600 font-semibold' : ''}>{athleteCount} / {maxAthletes}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(percent, 100)}%`, background: isOverLimit ? '#DC2626' : color }} />
          </div>
          {isOverLimit && <p className="text-xs text-red-600 mt-1.5 font-medium">Limite atingido — assine ou troque de plano para adicionar mais atletas.</p>}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Atletas ilimitados</p>
      )}

      {noPlan && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
          <p className="text-xs text-amber-800 font-medium">
            Você está no período de teste (até {trial?.maxAthletes ?? 5} atletas)
            {trial?.trialEndsAt ? (trial.expired ? ' — o período de teste terminou.' : ` até ${fmtDate(trial.trialEndsAt)}.`) : '.'}
          </p>
          <p className="text-xs text-amber-700">Assine um plano para continuar crescendo sem limite de teste.</p>
        </div>
      )}

      {!noPlan && sub?.currentPeriodEnd && (
        <p className="text-xs text-gray-500 mt-3">
          Situação: <strong>{SUB_STATUS_LABEL[sub.status] ?? sub.status}</strong> · válido até {fmtDate(sub.currentPeriodEnd)}
        </p>
      )}

      {showCheckout ? (
        <PlatformPlanCheckout currentPlan={planType} onClose={() => setShowCheckout(false)} />
      ) : (
        <button onClick={() => setShowCheckout(true)} className="mt-4 text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-white">
          {noPlan ? 'Assinar plano' : 'Renovar / trocar plano'}
        </button>
      )}
    </div>
  );
}

export default function BillingPage() {
  const user = useAuthStore((s) => s.user);
  const [history, setHistory] = useState<PaymentHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // A assinatura é do dono da equipe: membros (gestor/treinador/apoio) não gerenciam
  const teamRole = user?.team?.role;
  const isPlatformAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const canManage = isPlatformAdmin || !teamRole || teamRole === 'OWNER';

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/payments/history');
      setHistory(data);
    } catch {
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  if (!canManage) {
    return (
      <div className="glass-card p-8 text-center max-w-lg mx-auto mt-8">
        <h1 className="text-lg font-bold text-gray-900 mb-2">Assinatura da equipe</h1>
        <p className="text-sm text-gray-500">
          A assinatura da plataforma é gerenciada pelo dono da equipe{user?.team?.name ? ` ${user.team.name}` : ''}. Fale com ele se precisar mudar o plano.
        </p>
        <Link href="/dashboard" className="inline-block mt-4 text-sm font-semibold text-primary hover:underline">Voltar ao painel</Link>
      </div>
    );
  }

  // Só pagamentos do plano da plataforma (o histórico pode trazer outras compras do usuário)
  const rows = (history?.data ?? []).filter((p) => !p.purpose || p.purpose === 'PLATFORM_PLAN' || p.purpose === 'SUBSCRIPTION');

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Assinatura da plataforma</h1>
        <p className="text-sm text-gray-500 mt-1">Seu plano no app e os pagamentos — processados com segurança via Asaas.</p>
        <p className="text-xs text-gray-400 mt-1">
          As mensalidades dos seus atletas ficam em <Link href="/dashboard/mensalidades" className="underline">Mensalidades</Link>.
        </p>
      </div>

      <PlatformPlanCard />

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Histórico de pagamentos</h3>
          <button onClick={loadHistory} className="text-xs text-primary hover:underline cursor-pointer">Atualizar</button>
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left pb-3 font-medium">Data</th>
                  <th className="text-left pb-3 font-medium">Valor</th>
                  <th className="text-left pb-3 font-medium">Provedor</th>
                  <th className="text-left pb-3 font-medium">Plano</th>
                  <th className="text-left pb-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((p) => {
                  const s = PAYMENT_STATUS_MAP[p.status] ?? { label: p.status, color: '#6B7280' };
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition">
                      <td className="py-3 text-gray-600">{fmtDate(p.createdAt)}</td>
                      <td className="py-3 font-medium text-gray-900">R$ {(p.amount / 100).toFixed(2).replace('.', ',')}</td>
                      <td className="py-3 text-gray-500">{PROVIDER_LABEL[p.provider] ?? p.provider}</td>
                      <td className="py-3 text-gray-500">{p.planId ?? '—'}</td>
                      <td className="py-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: s.color, backgroundColor: s.color + '18' }}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">Nenhum pagamento encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
