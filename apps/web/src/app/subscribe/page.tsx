'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';


interface ApiPlan {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
}

interface Plan {
  type: string;
  name: string;
  price: string;
  amount: number;
  desc: string;
  popular: boolean;
  features: string[];
}

function apiPlanToUi(plan: ApiPlan, idx: number): Plan {
  return {
    type: plan.id,
    name: plan.name,
    price: `R$ ${(plan.price / 100).toFixed(0).replace('.', ',')}`,
    amount: plan.price,
    desc: plan.description,
    popular: idx === 1,
    features: plan.features,
  };
}

// Fallback platform plans shown when admin config endpoint is inaccessible
const DEFAULT_PLANS: Plan[] = [
  {
    type: 'STARTER',
    name: 'Starter',
    price: 'R$ 197',
    amount: 19700,
    desc: 'Para coaches iniciando',
    popular: false,
    features: ['Até 30 atletas', 'Questionário de anamnese', 'Planos de treino', 'App para atletas', 'Loja virtual'],
  },
  {
    type: 'PRO',
    name: 'Pro',
    price: 'R$ 397',
    amount: 39700,
    desc: 'Para assessorias em crescimento',
    popular: true,
    features: ['Até 100 atletas', 'Tudo do Starter', 'Coach Brain IA', 'Eventos e provas', 'Relatórios avançados'],
  },
  {
    type: 'SCALE',
    name: 'Scale',
    price: 'R$ 697',
    amount: 69700,
    desc: 'Para assessorias escalando',
    popular: false,
    features: ['Até 300 atletas', 'Tudo do Pro', 'Multi-coach', 'Dashboard analítico', 'Acesso à API'],
  },
  {
    type: 'ELITE',
    name: 'Elite',
    price: 'R$ 997',
    amount: 99700,
    desc: 'Para grandes assessorias',
    popular: false,
    features: ['Atletas ilimitados', 'Tudo do Scale', 'SLA garantido', 'Integração Garmin/Strava', 'Onboarding dedicado'],
  },
];

interface PixData {
  paymentId: string;
  pixQrCode: string;
  pixQrCodeUrl: string;
  pixExpiresAt: string;
  amount: number;
}

export default function SubscribePage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixStatus, setPixStatus] = useState<'pending' | 'paid' | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadUser(); }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    // Athletes should never see coach plans — redirect them
    if (user?.role === 'ATHLETE') { router.replace('/athlete-subscribe'); return; }
    Promise.all([
      api.get('/admin/config/plans').catch(() => null),
      api.get('/subscriptions/current').catch(() => null),
    ]).then(([plansRes, subRes]) => {
      if (plansRes?.data?.coach?.length) {
        setPlans(plansRes.data.coach.map(apiPlanToUi));
      } else {
        setPlans(DEFAULT_PLANS);
      }
      if (subRes?.data?.status === 'ACTIVE' || subRes?.data?.status === 'TRIALING') {
        router.replace('/dashboard');
      }
    }).finally(() => setLoading(false));
  }, [isAuthenticated, authLoading, user?.role, router]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPolling = useCallback((paymentId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/order/${paymentId}`);
        if (data.status === 'paid' || data.dbStatus === 'SUCCEEDED') {
          setPixStatus('paid');
          clearInterval(pollRef.current!);
          setTimeout(() => router.replace('/dashboard'), 3000);
        }
      } catch {}
    }, 5000);
  }, [router]);

  const handlePix = async (plan: Plan) => {
    setPixLoading(true);
    setPixData(null);
    setPixStatus(null);
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      const { data } = await api.post('/payments/pix', {
        amount: plan.amount,
        description: `Plano ${plan.name} - Rafinha Running`,
        planId: plan.type,
      });
      setPixData(data);
      setPixStatus('pending');
      startPolling(data.paymentId);
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Erro ao gerar PIX.');
    } finally {
      setPixLoading(false);
    }
  };

  const handleCopy = () => {
    if (!pixData?.pixQrCode) return;
    navigator.clipboard.writeText(pixData.pixQrCode).then(() => {
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 55%)' }}>
        <div className="w-8 h-8 border-2 border-red-200 border-t-[#DC2626] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 55%)' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="logo-red-fix" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1.062 0 0 0 -0.062  0 1.107 0 0 -0.107  0 0 1.038 0 -0.038  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>

      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto">
        <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-sm">
          <img src="/logo.png" alt="RR" className="w-full block" style={{ filter: 'url(#logo-red-fix)' }} />
        </div>
        <button
          onClick={() => { logout(); router.replace('/login'); }}
          className="text-xs text-gray-400 hover:text-gray-600 transition font-medium"
        >
          Sair
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        {/* Hero */}
        <div className="text-center mb-10 mt-2">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 tracking-tight">Escolha seu plano</h1>
          <p className="text-gray-500 text-sm">
            Olá, <strong className="text-gray-700">{user?.name}</strong>. Selecione um plano para acessar o painel de coach.
          </p>
        </div>

        {/* Plan cards */}
        {!pixData && plansError && (
          <div className="glass-card p-8 text-center mb-8">
            <p className="text-gray-500 text-sm mb-3">Não foi possível carregar os planos. Verifique sua conexão e tente novamente.</p>
            <button
              onClick={() => { setPlansError(false); setLoading(true); api.get('/admin/config/plans').then(r => { if (r.data?.coach?.length) setPlans(r.data.coach.map(apiPlanToUi)); else setPlans(DEFAULT_PLANS); }).catch(() => setPlans(DEFAULT_PLANS)).finally(() => setLoading(false)); }}
              className="text-sm font-semibold text-[#DC2626] hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}
        {!pixData && !plansError && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8">
            {plans.map((plan) => {
              const isSelected = selectedPlan?.type === plan.type;
              return (
                <div
                  key={plan.type}
                  onClick={() => setSelectedPlan(plan)}
                  className={`glass-card p-6 cursor-pointer relative overflow-hidden transition-all ${
                    isSelected
                      ? 'ring-2 ring-[#DC2626] shadow-[0_4px_32px_rgba(220,38,38,0.18)]'
                      : 'hover:shadow-[0_4px_24px_rgba(0,0,0,0.12)]'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#DC2626] via-red-400 to-[#DC2626]" />
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      {plan.popular && (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#DC2626]/10 text-[#DC2626] mb-2 tracking-wider uppercase">
                          Mais popular
                        </span>
                      )}
                      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{plan.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-all ${
                      isSelected ? 'border-[#DC2626] bg-[#DC2626]' : 'border-gray-200'
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 mb-5">
                    <span className="text-3xl font-black text-gray-900">{plan.price}</span>
                    <span className="text-sm text-gray-400 font-medium">/mês</span>
                  </div>

                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-500">
                        <svg className="w-3.5 h-3.5 text-[#DC2626] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {/* Payment CTA */}
        {selectedPlan && !pixData && (
          <div className="max-w-sm mx-auto">
            <div className="glass-card p-6 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Plano selecionado</p>
              <p className="text-lg font-bold text-gray-900 mb-4">
                {selectedPlan.name} · {selectedPlan.price}<span className="text-sm font-normal text-gray-400">/mês</span>
              </p>
              <button
                onClick={() => handlePix(selectedPlan)}
                disabled={pixLoading}
                className="w-full py-3.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold text-sm transition disabled:opacity-50 cursor-pointer shadow-[0_4px_16px_rgba(220,38,38,0.3)]"
              >
                {pixLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Gerando PIX...
                  </span>
                ) : 'Pagar com PIX →'}
              </button>
              <p className="text-xs text-gray-400 mt-3">Pagamento instantâneo · Confirmação automática</p>
            </div>
          </div>
        )}

        {/* PIX QR Code */}
        {pixData && pixStatus === 'pending' && (
          <div className="max-w-sm mx-auto">
            <div className="glass-card p-7 text-center">
              <div className="w-10 h-10 rounded-2xl bg-[#DC2626]/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-900 mb-1">QR Code PIX gerado</h3>
              <p className="text-xs text-gray-500 mb-5">Escaneie com seu banco ou copie o código abaixo</p>
              {pixData.pixQrCodeUrl && (
                <div className="inline-block p-3 rounded-2xl bg-white shadow-sm border border-gray-100 mb-5">
                  <img src={pixData.pixQrCodeUrl} alt="QR Code PIX" className="w-36 sm:w-44 h-36 sm:h-44 block" />
                </div>
              )}
              <button
                onClick={handleCopy}
                className="w-full py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition cursor-pointer mb-4"
              >
                {pixCopied ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Copiado!
                  </span>
                ) : 'Copiar código PIX'}
              </button>
              <div className="flex items-center gap-2 justify-center text-xs text-gray-400">
                <div className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                Aguardando pagamento...
              </div>
            </div>
          </div>
        )}

        {/* Paid */}
        {pixStatus === 'paid' && (
          <div className="max-w-sm mx-auto">
            <div className="glass-card p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Pagamento confirmado!</h3>
              <p className="text-sm text-gray-500">Redirecionando para o painel...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
