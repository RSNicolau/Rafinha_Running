'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import PlatformPlanCheckout, { POPULAR_PLAN, usePlatformPlans } from '../checkout/_components/PlatformPlanCheckout';
import { fmtBRL } from '../checkout/_lib/checkout';

/**
 * Tela pós-cadastro do dono da assessoria: escolhe o plano da PLATAFORMA (GET /platform/plans, público) e paga
 * pelo mesmo checkout do /dashboard/billing (POST /platform/subscribe → Asaas/FAKE → /pedido/<id>).
 * O painel não é bloqueado: dá para seguir no período de teste.
 */
export default function SubscribePage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { plans, error, reload } = usePlatformPlans();
  const [selected, setSelected] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => { loadUser(); }, [loadUser]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    if (user?.role === 'ATHLETE') { router.replace('/athlete-subscribe'); return; }
    api.get('/platform/my-subscription')
      .then((r) => { if (r.data?.status === 'ACTIVE') router.replace('/dashboard/billing'); })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [isAuthenticated, authLoading, user?.role, router]);

  if (checking || plans === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 55%)' }}>
        <div className="w-8 h-8 border-2 border-red-200 border-t-[#DC2626] rounded-full animate-spin" />
      </div>
    );
  }

  const isMember = user?.team && user.team.role !== 'OWNER';

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 55%)' }}>
      <header className="px-4 sm:px-6 py-5 flex items-center justify-between max-w-5xl mx-auto">
        <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-sm">
          <img src="/logo.png" alt="RR" className="w-full block" />
        </div>
        <button onClick={() => { logout(); router.replace('/login'); }} className="text-xs text-gray-400 hover:text-gray-600 transition font-medium">
          Sair
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div className="text-center mb-8 mt-2">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 tracking-tight">Escolha o plano da sua assessoria</h1>
          <p className="text-gray-500 text-sm">
            Olá, <strong className="text-gray-700">{user?.name}</strong>. Você já pode usar o painel no período de teste e assinar quando quiser.
          </p>
          <Link href="/dashboard" className="inline-block mt-3 text-sm font-semibold text-[#DC2626] hover:underline">
            Continuar no período de teste →
          </Link>
        </div>

        {isMember ? (
          <div className="glass-card p-8 text-center max-w-lg mx-auto">
            <p className="text-sm text-gray-600">A assinatura da plataforma é do dono da equipe {user?.team?.name}. Você não precisa assinar.</p>
            <Link href="/dashboard" className="inline-block mt-4 text-sm font-semibold text-[#DC2626] hover:underline">Ir para o painel</Link>
          </div>
        ) : !plans.length ? (
          <div className="glass-card p-8 text-center mb-8">
            <p className="text-gray-500 text-sm mb-3">{error || 'Nenhum plano disponível no momento.'}</p>
            <button onClick={reload} className="text-sm font-semibold text-[#DC2626] hover:underline">Tentar novamente</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-8">
              {plans.map((plan) => {
                const isSelected = selected === plan.type;
                const popular = plan.type === POPULAR_PLAN;
                return (
                  <button
                    type="button"
                    key={plan.type}
                    onClick={() => setSelected(plan.type)}
                    className={`glass-card p-6 text-left relative overflow-hidden transition-all ${
                      isSelected ? 'ring-2 ring-[#DC2626] shadow-[0_4px_32px_rgba(220,38,38,0.18)]' : 'hover:shadow-[0_4px_24px_rgba(0,0,0,0.12)]'
                    }`}
                  >
                    {popular && (
                      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#DC2626]/10 text-[#DC2626] mb-2 tracking-wider uppercase">
                        Mais popular
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                    {plan.description && <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>}
                    <div className="flex items-baseline gap-1 my-4">
                      <span className="text-2xl font-black text-gray-900">{fmtBRL(plan.priceInCents)}</span>
                      <span className="text-sm text-gray-400 font-medium">/mês</span>
                    </div>
                    <ul className="space-y-2">
                      {(plan.features ?? []).map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-gray-500">
                          <span className="text-[#DC2626]">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="max-w-md mx-auto" id="pagamento">
                <PlatformPlanCheckout key={selected} currentPlan={selected} showPlanCards={false} onClose={() => setSelected(null)} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
