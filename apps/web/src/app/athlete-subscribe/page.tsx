'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

const FALLBACK_PLAN = {
  type: 'MONTHLY',
  name: 'Plano Atleta',
  price: 'R$ 29',
  amount: 2900,
  features: ['Planilha de treinos do seu coach', 'Histórico completo de corridas', 'Sync Garmin & Strava & Apple Health', 'Live tracking durante corridas', 'Ranking & evolução pessoal', 'Chat com seu coach'],
};

interface PixData {
  paymentId: string;
  pixQrCode: string;
  pixQrCodeUrl: string;
  amount: number;
}

export default function AthleteSubscribePage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(FALLBACK_PLAN);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixStatus, setPixStatus] = useState<'pending' | 'paid' | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadUser(); }, []);

  useEffect(() => {
    if (!isAuthenticated) { router.replace('/athlete-login'); return; }
    Promise.all([
      api.get('/admin/config/plans').catch(() => null),
      api.get('/subscriptions/current').catch(() => null),
    ]).then(([plansRes, subRes]) => {
      const athletePlans = plansRes?.data?.athlete;
      if (athletePlans?.length) {
        const p = athletePlans[0];
        setPlan({
          type: p.id,
          name: p.name,
          price: `R$ ${(p.price / 100).toFixed(0)}`,
          amount: p.price,
          features: p.features,
        });
      }
      if (subRes?.data?.status === 'ACTIVE' || subRes?.data?.status === 'TRIALING') {
        router.replace('/athlete');
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
        amount: plan.amount,
        description: `${plan.name} - Rafinha Running`,
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
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 55%)' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="logo-red-fix" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1.062 0 0 0 -0.062  0 1.107 0 0 -0.107  0 0 1.038 0 -0.038  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>

      <div className="w-full max-w-md">
        {/* Logo + header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl overflow-hidden shadow-md mx-auto mb-5">
            <img src="/logo.png" alt="RR" className="w-full block" style={{ filter: 'url(#logo-red-fix)' }} />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">Ative sua conta</h1>
          <p className="text-sm text-gray-500">
            Olá, <strong className="text-gray-700">{user?.name}</strong>. Assine para acessar seus treinos.
          </p>
        </div>

        {/* Plan card */}
        {!pixData ? (
          <div className="glass-card p-7">
            {/* Plan header */}
            <div className="flex items-start justify-between mb-5 pb-5 border-b border-gray-100">
              <div>
                <p className="text-xs text-[#DC2626] font-semibold uppercase tracking-wider mb-1">Plano completo</p>
                <h2 className="font-bold text-gray-900 text-xl">{plan.name}</h2>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-gray-900">{plan.price}</span>
                <span className="text-sm text-gray-400 ml-1">/mês</span>
              </div>
            </div>

            {/* Features */}
            <ul className="space-y-2.5 mb-7">
              {plan.features.map((f) => (
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

            {/* CTA */}
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
              ) : 'Pagar com PIX →'}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">Pagamento instantâneo · Confirmação automática</p>
          </div>
        ) : pixStatus === 'pending' ? (
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
