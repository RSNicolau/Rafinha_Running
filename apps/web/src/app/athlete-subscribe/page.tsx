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
    // Fetch athlete plan from API and check subscription in parallel
    Promise.all([
      api.get('/admin/config/plans').catch(() => null),
      api.get('/subscriptions/current').catch(() => null),
    ]).then(([plansRes, subRes]) => {
      // Load first athlete plan from API if available
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom, #E5E7EB 0%, #F2F2F7 50%)' }}>
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-8" style={{ background: 'linear-gradient(to bottom, #E5E7EB 0%, #F9FAFB 50%)' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="logo-fix" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1.062 0 0 0 -0.062  0 1.107 0 0 -0.107  0 0 1.038 0 -0.038  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="RR" className="h-12 mx-auto mb-4" style={{ filter: 'url(#logo-fix)' }} />
          <h1 className="text-2xl font-black text-gray-900 mb-1">Ative sua conta</h1>
          <p className="text-sm text-gray-500">
            Olá, <strong>{user?.name}</strong>. Assine para acessar seus treinos.
          </p>
        </div>

        {!pixData ? (
          <div className="glass-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{plan.name}</h2>
                <p className="text-xs text-gray-400">Acesso completo à plataforma</p>
              </div>
              <div className="sm:text-right">
                <span className="text-2xl font-black text-gray-900">{plan.price}</span>
                <span className="text-xs text-gray-400 ml-1">/mês</span>
              </div>
            </div>

            <ul className="space-y-2 mb-6">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="w-3.5 h-3.5 text-gray-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={handlePix}
              disabled={pixLoading}
              className="w-full py-3.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-semibold text-sm transition disabled:opacity-50 cursor-pointer"
            >
              {pixLoading ? 'Gerando PIX...' : 'Pagar com PIX →'}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">Pagamento instantâneo · Confirmação automática</p>
          </div>
        ) : pixStatus === 'pending' ? (
          <div className="glass-card p-6 text-center">
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
        ) : (
          <div className="glass-card p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
