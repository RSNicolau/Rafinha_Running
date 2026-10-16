'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import PaymentMethodPicker from './PaymentMethodPicker';
import { PaymentChoice, choiceToRequest, fmtBRL, isValidCpf, maskCpf, paymentUrl, rememberPaymentToken } from '../_lib/checkout';

export interface PlatformPlan {
  type: string;
  name: string;
  description?: string | null;
  priceInCents: number;
  maxAthletes: number | null;
  features?: string[] | null;
}

/** Plano destacado (um só selo "Mais popular"). */
export const POPULAR_PLAN = 'PRO';

/** Planos da plataforma (GET /platform/plans — público). Nunca planos de atleta. */
export function usePlatformPlans() {
  const [plans, setPlans] = useState<PlatformPlan[] | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    setPlans(null);
    api
      .get('/platform/plans')
      .then((r) => setPlans(Array.isArray(r.data) ? r.data : []))
      .catch(() => {
        setPlans([]);
        setError('Não foi possível carregar os planos. Tente novamente em instantes.');
      });
  };
  useEffect(load, []);
  return { plans, error, reload: load };
}

/**
 * Checkout do plano da plataforma (POST /platform/subscribe → cobrança PLATFORM_PLAN no Asaas/FAKE).
 * O plano só ativa depois da confirmação do pagamento (tela /pedido/<id>).
 */
export default function PlatformPlanCheckout({
  currentPlan,
  onClose,
  showPlanCards = true,
}: {
  currentPlan?: string | null;
  onClose?: () => void;
  showPlanCards?: boolean;
}) {
  const { plans, error: plansError, reload } = usePlatformPlans();
  const [plan, setPlan] = useState<string>(currentPlan ?? '');
  const [cpf, setCpf] = useState('');
  const [choice, setChoice] = useState<PaymentChoice>('PIX');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!plan && plans?.length) setPlan((plans.find((p) => p.type === POPULAR_PLAN) ?? plans[0]).type);
  }, [plans, plan]);

  const pay = async () => {
    if (!plan) return setError('Escolha um plano.');
    if (!isValidCpf(cpf)) return setError('CPF inválido.');
    setBusy(true);
    setError('');
    try {
      const { provider, method } = choiceToRequest(choice);
      const { data } = await api.post('/platform/subscribe', { plan, cpf: cpf.replace(/\D/g, ''), provider, method });
      if (data?.checkout?.paymentId) {
        rememberPaymentToken(data.checkout.paymentId, data.checkout.accessToken);
        window.location.href = paymentUrl(data.checkout);
      } else if (data?.status === 'ACTIVE') {
        window.location.href = '/dashboard';
      } else {
        setError('Não foi possível gerar a cobrança. Tente novamente.');
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError((Array.isArray(msg) ? msg.join(' · ') : msg) || 'Não foi possível gerar a cobrança.');
    } finally {
      setBusy(false);
    }
  };

  if (plans === null) return <div className="mt-4 h-32 rounded-xl bg-gray-100 animate-pulse" />;

  if (!plans.length) {
    return (
      <div className="mt-4 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
        {plansError || 'Nenhum plano disponível no momento. Fale com o suporte.'}
        <button onClick={reload} className="ml-2 font-semibold underline">Tentar novamente</button>
      </div>
    );
  }

  const selected = plans.find((p) => p.type === plan);

  return (
    <div className="mt-4 p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
      {showPlanCards && (
        <>
          <p className="text-sm font-semibold text-gray-800">Escolha o plano (30 dias)</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {plans.map((p) => (
              <button
                key={p.type}
                type="button"
                onClick={() => setPlan(p.type)}
                className={`text-left rounded-xl border-2 px-3 py-2 ${plan === p.type ? 'border-primary bg-white' : 'border-gray-200 bg-white/60'}`}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  {p.name}
                  {p.type === POPULAR_PLAN && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase">Mais popular</span>
                  )}
                </span>
                <span className="block text-xs text-gray-500">
                  {fmtBRL(p.priceInCents)}/mês · {p.maxAthletes ? `até ${p.maxAthletes} atletas` : 'atletas ilimitados'}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {selected && !showPlanCards && (
        <p className="text-sm text-gray-700">
          Plano <strong>{selected.name}</strong> · {fmtBRL(selected.priceInCents)}/mês
        </p>
      )}
      <input
        value={cpf}
        onChange={(e) => setCpf(maskCpf(e.target.value))}
        inputMode="numeric"
        placeholder="CPF do responsável *"
        className="w-full px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-sm"
      />
      <PaymentMethodPicker value={choice} onChange={setChoice} />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-gray-500">
        Pagamento processado com segurança via Asaas. O plano só é ativado após a confirmação do pagamento. Pagando o mesmo plano antes do
        vencimento, os 30 dias são somados ao período atual.
      </p>
      <div className="flex gap-2">
        {onClose && (
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">
            Fechar
          </button>
        )}
        <button type="button" onClick={pay} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50">
          {busy ? 'Gerando…' : 'Ir para o pagamento'}
        </button>
      </div>
    </div>
  );
}
