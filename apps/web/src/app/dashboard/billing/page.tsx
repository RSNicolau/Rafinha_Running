'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

interface Subscription {
  id: string;
  planType: 'MONTHLY' | 'ANNUAL' | 'TRIAL';
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  provider: string;
}

interface PixPaymentData {
  paymentId: string;
  orderId: string;
  status: string;
  pixQrCode: string;
  pixQrCodeUrl: string;
  pixExpiresAt: string;
  amount: number;
}

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  paidAt: string | null;
  createdAt: string;
  planId?: string | null;
}

interface PaymentHistory {
  data: PaymentRecord[];
  total: number;
  page: number;
  totalPages: number;
}

const PLANS = [
  {
    type: 'MONTHLY',
    name: 'Básico',
    price: 'R$ 49',
    period: '/mês',
    amount: 4900, // centavos
    description: 'Flexibilidade total, sem fidelidade',
    popular: true,
    features: [
      'Treinos personalizados ilimitados',
      'Live tracking dos atletas',
      'Sync Garmin + Strava',
      'Chat em tempo real',
      'Relatórios avançados',
    ],
  },
  {
    type: 'PRO',
    name: 'Pro',
    price: 'R$ 99',
    period: '/mês',
    amount: 9900,
    description: 'Para atletas dedicados',
    popular: false,
    features: [
      'Tudo do Básico',
      'Análise de VO2max',
      'Planejamento de provas',
      'IA de treinos avançada',
      'Suporte prioritário',
    ],
  },
  {
    type: 'ELITE',
    name: 'Elite',
    price: 'R$ 199',
    period: '/mês',
    amount: 19900,
    description: 'Performance máxima',
    popular: false,
    badge: 'VIP',
    features: [
      'Tudo do Pro',
      'Coach dedicado',
      'Acesso antecipado a novidades',
      'Desconto em eventos parceiros',
      'Suporte VIP WhatsApp',
    ],
  },
];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE: { label: 'Ativa', color: '#059669', bg: '#D1FAE5' },
  TRIALING: { label: 'Teste grátis', color: '#2563EB', bg: '#DBEAFE' },
  PAST_DUE: { label: 'Pagamento pendente', color: '#D97706', bg: '#FEF3C7' },
  CANCELED: { label: 'Cancelada', color: '#DC2626', bg: '#FEE2E2' },
  INCOMPLETE: { label: 'Incompleta', color: '#6B7280', bg: '#F3F4F6' },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  SUCCEEDED: { label: 'Pago', color: '#059669' },
  PENDING: { label: 'Pendente', color: '#D97706' },
  FAILED: { label: 'Falhou', color: '#DC2626' },
  REFUNDED: { label: 'Estornado', color: '#6B7280' },
};

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  // PIX state
  const [pixLoading, setPixLoading] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixPaymentData | null>(null);
  const [pixStatus, setPixStatus] = useState<'pending' | 'paid' | 'failed' | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Card state
  const [cardLoading, setCardLoading] = useState<string | null>(null);
  const [cardPlanType, setCardPlanType] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Payment history
  const [history, setHistory] = useState<PaymentHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    api.get('/subscriptions/current')
      .then((r) => setSubscription(r.data?.id ? r.data : null))
      .catch(() => {})
      .finally(() => setLoading(false));

    loadHistory();
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/payments/history');
      setHistory(data);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  // Poll PIX payment status every 5 seconds
  const startPixPolling = useCallback((paymentId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/order/${paymentId}`);
        if (data.status === 'paid' || data.dbStatus === 'SUCCEEDED') {
          setPixStatus('paid');
          clearInterval(pollIntervalRef.current!);
          loadHistory();
        } else if (data.status === 'failed' || data.status === 'canceled') {
          setPixStatus('failed');
          clearInterval(pollIntervalRef.current!);
        }
      } catch {
        // ignore transient errors
      }
    }, 5000);
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleSubscribeMercadoPago = async (planType: string) => {
    setSubscribing(planType);
    try {
      const { data } = await api.post('/subscriptions', { planType, provider: 'MERCADO_PAGO' });
      if (data.checkoutUrl) window.open(data.checkoutUrl, '_blank');
      else alert('Assinatura processada com sucesso!');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erro ao processar assinatura');
    } finally {
      setSubscribing(null);
    }
  };

  const handlePixPayment = async (plan: typeof PLANS[0]) => {
    setPixLoading(plan.type);
    setPixData(null);
    setPixStatus(null);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    try {
      const { data } = await api.post('/payments/pix', {
        amount: plan.amount,
        description: `Plano ${plan.name} - RR Rafinha Running`,
        planId: plan.type,
      });
      setPixData(data);
      setPixStatus('pending');
      startPixPolling(data.paymentId);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erro ao gerar PIX. Verifique se PAGARME_API_KEY está configurado.');
    } finally {
      setPixLoading(null);
    }
  };

  const formatCardNumber = (v: string) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();

  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const handleCardPayment = async (plan: typeof PLANS[0]) => {
    const raw = cardNumber.replace(/\s/g, '');
    if (raw.length < 16 || !cardHolder.trim() || cardExpiry.length < 5 || cardCvv.length < 3) {
      alert('Preencha todos os dados do cartão corretamente.');
      return;
    }
    setCardLoading(plan.type);
    try {
      // Tokenize via Pagar.me API (using public encryption key)
      const ek = process.env.NEXT_PUBLIC_PAGARME_EK;
      let cardToken = '';
      if (ek) {
        const tokenRes = await fetch('https://api.pagar.me/core/v5/tokens?appId=' + ek, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'card',
            card: {
              number: raw,
              holder_name: cardHolder.trim().toUpperCase(),
              exp_month: Number(cardExpiry.slice(0, 2)),
              exp_year: Number(cardExpiry.slice(3)),
              cvv: cardCvv,
            },
          }),
        });
        if (!tokenRes.ok) {
          const err = await tokenRes.json();
          throw new Error(err?.message || 'Erro ao tokenizar cartão');
        }
        const tokenData = await tokenRes.json();
        cardToken = tokenData.id;
      } else {
        // Dev mode: skip tokenization
        cardToken = `dev_token_${Date.now()}`;
      }

      const { data } = await api.post('/payments/card', {
        amount: plan.amount,
        description: `Plano ${plan.name} - RR Rafinha Running`,
        planId: plan.type,
        cardToken,
      });
      alert(`Pagamento processado! Status: ${data.status}`);
      setCardNumber(''); setCardHolder(''); setCardExpiry(''); setCardCvv('');
      setCardPlanType(null);
      loadHistory();
    } catch (e: any) {
      alert(e?.message || e?.response?.data?.message || 'Erro ao processar pagamento');
    } finally {
      setCardLoading(null);
    }
  };

  const handleCopyPix = () => {
    if (!pixData?.pixQrCode) return;
    navigator.clipboard.writeText(pixData.pixQrCode).then(() => {
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
    });
  };

  const handleCancel = async () => {
    if (!confirm('Cancelar assinatura? Você continua com acesso até o fim do período.')) return;
    try {
      await api.post('/subscriptions/cancel');
      alert('Assinatura cancelada.');
      window.location.reload();
    } catch {
      alert('Erro ao cancelar');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const statusInfo = subscription ? STATUS_MAP[subscription.status] : null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Assinatura & Cobrança</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie seu plano e métodos de pagamento via Pagar.me</p>
      </div>

      {/* Current subscription */}
      {subscription && statusInfo && (
        <div className="glass-card p-6 mb-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Plano atual</p>
              <h2 className="text-xl font-bold text-gray-900">
                {subscription.planType === 'ANNUAL' ? 'Plano Anual'
                  : subscription.planType === 'MONTHLY' ? 'Básico'
                  : 'Teste Grátis'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Válido até {new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
              </p>
              <p className="text-xs text-gray-400 mt-1 capitalize">via {subscription.provider?.toLowerCase?.().replace('_', ' ')}</p>
            </div>
            <span
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ color: statusInfo.color, backgroundColor: statusInfo.bg }}
            >
              {statusInfo.label}
            </span>
          </div>

          {subscription.cancelAtPeriodEnd && (
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-4 py-2.5 rounded-xl">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              Cancelamento agendado para o fim do período
            </div>
          )}

          {!subscription.cancelAtPeriodEnd && subscription.status === 'ACTIVE' && (
            <button
              onClick={handleCancel}
              className="mt-4 text-sm text-red-500 hover:text-red-700 font-medium cursor-pointer"
            >
              Cancelar assinatura
            </button>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {subscription ? 'Trocar plano' : 'Escolher plano'}
        </h3>
        <p className="text-sm text-gray-400 mb-4">Pagamentos processados com segurança via Pagar.me</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = subscription?.planType === plan.type;
            return (
              <div
                key={plan.type}
                className={`glass-card p-6 relative transition-all ${
                  plan.popular
                    ? 'border border-primary/30 ring-1 ring-primary/10'
                    : 'border border-gray-100'
                } ${isCurrent ? 'bg-primary/5' : ''}`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-6 text-xs font-bold px-3 py-1 rounded-full bg-primary text-white">
                    MAIS POPULAR
                  </span>
                )}
                {plan.badge && (
                  <span className="absolute -top-3 right-6 text-xs font-bold px-3 py-1 rounded-full bg-emerald-500 text-white">
                    {plan.badge}
                  </span>
                )}

                <div className="mb-4">
                  <h4 className="text-base font-bold text-gray-900">{plan.name}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-sm text-gray-400">{plan.period}</span>
                </div>

                <ul className="space-y-2 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-500">
                      <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* PIX payment button */}
                <button
                  onClick={() => handlePixPayment(plan)}
                  disabled={isCurrent || pixLoading === plan.type}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition cursor-pointer mb-2 flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  } disabled:opacity-60`}
                >
                  {pixLoading === plan.type ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                    </svg>
                  )}
                  {isCurrent ? 'Plano Atual' : 'Pagar com PIX'}
                </button>

                {/* Card payment button */}
                {!isCurrent && (
                  <button
                    onClick={() => setCardPlanType(cardPlanType === plan.type ? null : plan.type)}
                    className="w-full py-2.5 rounded-xl text-sm font-medium transition cursor-pointer border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                    Pagar com Cartão
                  </button>
                )}

                {/* Card form */}
                {cardPlanType === plan.type && !isCurrent && (
                  <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                    <p className="text-xs font-semibold text-gray-600 mb-1">Dados do cartão</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Número do cartão"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      maxLength={19}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Nome impresso no cartão"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="MM/AA"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                        maxLength={5}
                        className="w-1/2 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="CVV"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        maxLength={4}
                        className="w-1/2 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                    </div>
                    <button
                      onClick={() => handleCardPayment(plan)}
                      disabled={cardLoading === plan.type}
                      className="w-full py-2 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 cursor-pointer transition"
                    >
                      {cardLoading === plan.type ? 'Processando...' : `Pagar R$ ${(plan.amount / 100).toFixed(2).replace('.', ',')}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PIX QR Code section */}
      {pixData && (
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
            </svg>
            <h3 className="text-base font-semibold text-gray-800">Pagar com PIX</h3>
          </div>

          {pixStatus === 'paid' ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-lg font-bold text-emerald-700">Pagamento confirmado!</p>
              <p className="text-sm text-gray-500">Seu plano foi ativado com sucesso.</p>
            </div>
          ) : pixStatus === 'failed' ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="text-sm font-semibold text-red-600">Pagamento não concluído</p>
              <p className="text-xs text-gray-400">O prazo expirou ou houve um erro. Tente novamente.</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* QR code image */}
              {pixData.pixQrCodeUrl ? (
                <div className="flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pixData.pixQrCodeUrl}
                    alt="QR Code PIX"
                    className="w-48 h-48 rounded-xl border border-gray-100"
                  />
                </div>
              ) : null}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Aguardando pagamento...
                  </span>
                  <span className="text-xs text-gray-400">
                    Expira em {new Date(pixData.pixExpiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Valor: R$ {(pixData.amount / 100).toFixed(2).replace('.', ',')}
                </p>

                <p className="text-xs text-gray-500 mb-2">Copia e Cola PIX:</p>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 mb-3">
                  <p className="text-xs font-mono text-gray-600 break-all leading-relaxed">
                    {pixData.pixQrCode || 'QR code indisponível'}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleCopyPix}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                    {pixCopied ? 'Copiado!' : 'Copiar código'}
                  </button>
                  <span className="text-gray-300">|</span>
                  <span className="text-xs text-gray-400">Verificando automaticamente a cada 5s...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment History */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Histórico de Pagamentos</h3>
          <button
            onClick={loadHistory}
            className="text-xs text-primary hover:underline cursor-pointer"
          >
            Atualizar
          </button>
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : history && history.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left pb-3 font-medium">Data</th>
                  <th className="text-left pb-3 font-medium">Valor</th>
                  <th className="text-left pb-3 font-medium">Método</th>
                  <th className="text-left pb-3 font-medium">Plano</th>
                  <th className="text-left pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.data.map((p) => {
                  const s = PAYMENT_STATUS_MAP[p.status] ?? { label: p.status, color: '#6B7280' };
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition">
                      <td className="py-3 text-gray-600">
                        {new Date(p.createdAt).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 font-medium text-gray-900">
                        R$ {(p.amount / 100).toFixed(2).replace('.', ',')}
                      </td>
                      <td className="py-3 text-gray-500 capitalize">
                        {p.provider?.toLowerCase?.().replace('_', ' ')}
                      </td>
                      <td className="py-3 text-gray-500">
                        {p.planId ?? '—'}
                      </td>
                      <td className="py-3">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ color: s.color, backgroundColor: s.color + '18' }}
                        >
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {history.total > history.data.length && (
              <p className="text-xs text-gray-400 text-center mt-3">
                Mostrando {history.data.length} de {history.total} pagamentos
              </p>
            )}
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
