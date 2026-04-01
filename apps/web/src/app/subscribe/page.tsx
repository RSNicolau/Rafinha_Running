'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

// Fallback plans in case the API is unavailable
const FALLBACK_PLANS = [
  {
    type: 'MONTHLY',
    name: 'Básico',
    price: 'R$ 49',
    amount: 4900,
    desc: 'Para coaches iniciando',
    popular: false,
    features: ['Até 15 atletas', 'Planilhas ilimitadas', 'Sync Garmin & Strava', 'Dashboard web', 'Live Tracking'],
  },
  {
    type: 'PRO',
    name: 'Pro',
    price: 'R$ 99',
    amount: 9900,
    desc: 'Para assessorias em crescimento',
    popular: true,
    features: ['Até 50 atletas', 'IA para planilhas', 'Live Tracking avançado', 'App mobile white-label', 'Suporte prioritário'],
  },
  {
    type: 'ELITE',
    name: 'Elite',
    price: 'R$ 199',
    amount: 19900,
    desc: 'Para grandes assessorias',
    popular: false,
    features: ['Atletas ilimitados', 'Tudo do Pro', 'Múltiplos coaches', 'Relatórios financeiros', 'Suporte VIP WhatsApp'],
  },
];

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

interface PixData {
  paymentId: string;
  pixQrCode: string;
  pixQrCodeUrl: string;
  pixExpiresAt: string;
  amount: number;
}

export default function SubscribePage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixStatus, setPixStatus] = useState<'pending' | 'paid' | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadUser(); }, []);

  useEffect(() => {
    if (!isAuthenticated) { router.replace('/login'); return; }
    // Fetch plans from API and check subscription in parallel
    Promise.all([
      api.get('/admin/config/plans').catch(() => null),
      api.get('/subscriptions/current').catch(() => null),
    ]).then(([plansRes, subRes]) => {
      // Load plans from API if available
      if (plansRes?.data?.coach?.length) {
        setPlans(plansRes.data.coach.map(apiPlanToUi));
      }
      // Redirect if already subscribed
      if (subRes?.data?.status === 'ACTIVE' || subRes?.data?.status === 'TRIALING') {
        router.replace('/dashboard');
      }
    }).finally(() => setLoading(false));
  }, [isAuthenticated]);

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 50%)' }}>
        <div className="w-8 h-8 border-2 border-red-200 border-t-[#DC2626] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom, #FEF2F2 0%, #F9FAFB 40%)' }}>
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              <filter id="logo-fix" colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values="1.062 0 0 0 -0.062  0 1.107 0 0 -0.107  0 0 1.038 0 -0.038  0 0 0 1 0" />
              </filter>
            </defs>
          </svg>
          <img src="/logo.png" alt="RR" className="h-8" style={{ filter: 'url(#logo-fix)' }} />
        </div>
        <button
          onClick={() => { logout(); router.replace('/login'); }}
          className="text-xs text-gray-400 hover:text-gray-600 transition"
        >
          Sair
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div className="text-center mb-8 sm:mb-10 mt-4">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">Escolha seu plano</h1>
          <p className="text-gray-500">
            Olá, <strong>{user?.name}</strong>. Selecione um plano para acessar o painel de coach.
          </p>
        </div>

        {/* Plan cards */}
        {!pixData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-8">
            {plans.map((plan) => (
              <div
                key={plan.type}
                onClick={() => setSelectedPlan(plan)}
                className={`rounded-2xl p-6 border-2 cursor-pointer transition-all ${
                  selectedPlan?.type === plan.type
                    ? 'border-[#DC2626] bg-red-50 shadow-lg shadow-red-100'
                    : plan.popular
                    ? 'border-gray-200 bg-white hover:border-[#DC2626]/40'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                {plan.popular && (
                  <span className="inline-block text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#DC2626] text-white mb-3">
                    MAIS POPULAR
                  </span>
                )}
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <p className="text-xs text-gray-400 mb-3">{plan.desc}</p>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-2xl sm:text-3xl font-black text-gray-900">{plan.price}</span>
                  <span className="text-sm text-gray-400">/mês</span>
                </div>
                <ul className="space-y-1.5 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-500">
                      <svg className="w-3.5 h-3.5 text-[#DC2626] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className={`w-5 h-5 rounded-full border-2 mx-auto transition-all ${
                  selectedPlan?.type === plan.type ? 'border-[#DC2626] bg-[#DC2626]' : 'border-gray-300'
                }`}>
                  {selectedPlan?.type === plan.type && (
                    <svg className="w-full h-full text-white p-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payment */}
        {selectedPlan && !pixData && (
          <div className="max-w-md mx-auto glass-card p-6 text-center">
            <h3 className="font-semibold text-gray-900 mb-1">Pagar com PIX</h3>
            <p className="text-sm text-gray-500 mb-4">
              Plano <strong>{selectedPlan.name}</strong> — {selectedPlan.price}/mês
            </p>
            <button
              onClick={() => handlePix(selectedPlan)}
              disabled={pixLoading}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition disabled:opacity-50 cursor-pointer"
            >
              {pixLoading ? 'Gerando PIX...' : 'Pagar com PIX →'}
            </button>
            <p className="text-xs text-gray-400 mt-3">Pagamento instantâneo · Confirmação automática</p>
          </div>
        )}

        {/* PIX QR Code */}
        {pixData && pixStatus === 'pending' && (
          <div className="max-w-sm mx-auto glass-card p-6 text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 mb-1">QR Code PIX gerado</h3>
            <p className="text-xs text-gray-500 mb-4">Escaneie com seu banco ou copie o código</p>
            {pixData.pixQrCodeUrl && (
              <img src={pixData.pixQrCodeUrl} alt="QR Code PIX" className="w-36 sm:w-44 h-36 sm:h-44 mx-auto mb-4 rounded-xl border border-gray-100" />
            )}
            <button
              onClick={handleCopy}
              className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium transition cursor-pointer mb-3"
            >
              {pixCopied ? '✓ Copiado!' : 'Copiar código PIX'}
            </button>
            <div className="flex items-center gap-2 justify-center text-xs text-gray-400">
              <div className="w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              Aguardando pagamento...
            </div>
          </div>
        )}

        {/* Paid */}
        {pixStatus === 'paid' && (
          <div className="max-w-sm mx-auto glass-card p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Pagamento confirmado!</h3>
            <p className="text-sm text-gray-500">Redirecionando para o painel...</p>
          </div>
        )}
      </main>
    </div>
  );
}
