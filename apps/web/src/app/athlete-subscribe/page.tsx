'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

interface Plan {
  type: string;
  name: string;
  price: string;
  period: string;
  amount: number;
  features: string[];
  badge?: string;
}

const FALLBACK_PLANS: Plan[] = [
  {
    type: 'MONTHLY',
    name: 'Mensal',
    price: 'R$ 174',
    period: '/mês',
    amount: 17400,
    features: ['Planilhas personalizadas', 'Treino na Concha Acústica (terças)', 'Treinos alternados aos sábados', 'Assessoria em provas', 'Acesso ao App da equipe'],
  },
  {
    type: 'QUARTERLY',
    name: 'Trimestral',
    price: 'R$ 495',
    period: 'parcela única',
    amount: 49500,
    badge: 'Economize 5%',
    features: ['Planilhas personalizadas', 'Treino na Concha Acústica (terças)', 'Treinos alternados aos sábados', 'Assessoria em provas', 'Acesso ao App da equipe'],
  },
  {
    type: 'SEMIANNUAL',
    name: 'Semestral',
    price: 'R$ 960',
    period: 'parcela única',
    amount: 96000,
    badge: 'Mais popular',
    features: ['Planilhas personalizadas', 'Treino na Concha Acústica (terças)', 'Treinos alternados aos sábados', 'Assessoria em provas', 'Acesso ao App da equipe'],
  },
];

interface PixData {
  paymentId: string;
  pixQrCode: string;
  pixQrCodeUrl: string;
  amount: number;
}

export default function AthleteSubscribePage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(FALLBACK_PLANS[2]); // Semestral default
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixStatus, setPixStatus] = useState<'pending' | 'paid' | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadUser(); }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.replace('/athlete-login'); return; }
    Promise.all([
      api.get('/admin/config/plans').catch(() => null),
      api.get('/subscriptions/current').catch(() => null),
    ]).then(([plansRes, subRes]) => {
      const athletePlans = plansRes?.data?.athlete;
      if (athletePlans?.length) {
        const mapped: Plan[] = athletePlans.map((p: any, i: number) => ({
          type: p.id,
          name: p.name,
          price: `R$ ${Math.round(p.price / 100).toLocaleString('pt-BR')}`,
          period: p.id === 'MONTHLY' ? '/mês' : 'parcela única',
          amount: p.price,
          badge: i === athletePlans.length - 1 ? 'Mais popular' : i === 1 ? 'Economize 5%' : undefined,
          features: p.features,
        }));
        setPlans(mapped);
        setSelectedPlan(mapped[mapped.length - 1]);
      }
      if (subRes?.data?.status === 'ACTIVE' || subRes?.data?.status === 'TRIALING') {
        router.replace('/athlete');
      }
    }).finally(() => setLoading(false));
  }, [isAuthenticated, authLoading]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPolling = useCallback((paymentId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/order/${paymentId}`);
        if (data.status === 'paid' || data.dbStatus === 'SUCCEEDED') {
          setPixStatus('paid');
          clearInterval(pollRef.current!);
          setTimeout(() => router.replace('/athlete'), 3000);
        }
      } catch {}
    }, 5000);
  }, [router]);

  const handlePix = async () => {
    setPixLoading(true);
    setPixData(null);
    setPixStatus(null);
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      const { data } = await api.post('/payments/pix', {
        amount: selectedPlan.amount,
        description: `${selectedPlan.name} - Rafinha Running`,
        planId: selectedPlan.type,
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
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 55%)' }}>
      <div className="w-full max-w-lg">
        {/* Logo + header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-xl bg-[#DC2626] flex items-center justify-center">
              <svg viewBox="0 0 28 20" fill="none" className="w-4 h-3.5">
                <path d="M2 18 L8 2 L14 12 L20 2 L26 18" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-lg font-black tracking-tight text-gray-900">RAFINHA<span className="text-[#DC2626]"> RUNNING</span></span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">Ative sua conta</h1>
          <p className="text-sm text-gray-500">
            Olá, <strong className="text-gray-700">{user?.name}</strong>. Escolha seu plano para acessar os treinos.
          </p>
        </div>

        {!pixData ? (
          <div className="space-y-4">
            {/* Plan selector */}
            <div className="grid grid-cols-3 gap-3">
              {plans.map((p) => {
                const isSelected = selectedPlan.type === p.type;
                return (
                  <button
                    key={p.type}
                    onClick={() => setSelectedPlan(p)}
                    className={`relative rounded-2xl border-2 p-4 text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-[#DC2626] bg-white shadow-[0_4px_20px_rgba(220,38,38,0.15)]'
                        : 'border-gray-200 bg-white/70 hover:border-gray-300'
                    }`}
                  >
                    {p.badge && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#DC2626] text-white text-[10px] font-bold whitespace-nowrap">
                        {p.badge}
                      </span>
                    )}
                    <p className={`text-xs font-semibold mb-1 ${isSelected ? 'text-[#DC2626]' : 'text-gray-400'}`}>{p.name}</p>
                    <p className={`text-xl font-black leading-tight ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{p.price}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{p.period}</p>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#DC2626] flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected plan details */}
            <div className="glass-card p-6">
              <div className="flex items-start justify-between mb-5 pb-4 border-b border-gray-100">
                <div>
                  <p className="text-xs text-[#DC2626] font-semibold uppercase tracking-wider mb-1">Plano selecionado</p>
                  <h2 className="font-bold text-gray-900 text-xl">{selectedPlan.name}</h2>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black text-gray-900">{selectedPlan.price}</span>
                  <span className="text-sm text-gray-400 ml-1">{selectedPlan.period}</span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6">
                {selectedPlan.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="w-5 h-5 rounded-full bg-[#DC2626]/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={handlePix}
                disabled={pixLoading}
                className="w-full py-3.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold text-sm transition disabled:opacity-50 cursor-pointer shadow-[0_4px_16px_rgba(220,38,38,0.3)]"
              >
                {pixLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Gerando PIX...
                  </span>
                ) : `Pagar ${selectedPlan.price} com PIX →`}
              </button>
              <p className="text-xs text-gray-400 text-center mt-3">Pagamento instantâneo · Confirmação automática</p>
            </div>
          </div>
        ) : pixStatus === 'pending' ? (
          <div className="glass-card p-7 text-center">
            <div className="w-10 h-10 rounded-2xl bg-[#DC2626]/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 mb-1">QR Code PIX gerado</h3>
            <p className="text-xs text-gray-500 mb-1">Escaneie com seu banco ou copie o código abaixo</p>
            <p className="text-xs text-gray-400 font-medium mb-5">{selectedPlan.name} · {selectedPlan.price}</p>
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
            <button
              onClick={() => { setPixData(null); setPixStatus(null); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition underline cursor-pointer"
            >
              Trocar plano
            </button>
            <div className="flex items-center gap-2 justify-center text-xs text-gray-400 mt-4">
              <div className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
              Aguardando pagamento...
            </div>
          </div>
        ) : (
          <div className="glass-card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Pagamento confirmado!</h3>
            <p className="text-sm text-gray-500">Redirecionando para seus treinos...</p>
          </div>
        )}

        <button
          onClick={() => { logout(); router.replace('/athlete-login'); }}
          className="block text-center text-xs text-gray-400 hover:text-gray-600 transition mt-5 w-full"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
