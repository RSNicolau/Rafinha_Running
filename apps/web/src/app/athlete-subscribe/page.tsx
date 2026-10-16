'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import BuyerFields from '../checkout/_components/BuyerFields';
import { CheckoutBuyer, fmtBRL, validateBuyer } from '../checkout/_lib/checkout';
import {
  BillingType,
  INTERVAL_LABEL,
  INTERVAL_PERIOD,
  MyMembership,
  TeamPlan,
  changeMyPlan,
  fmtDate,
  getMyMembership,
  subscribeMembership,
} from './_lib/memberships';

/**
 * Assinatura da mensalidade com a EQUIPE do atleta: os planos vêm de GET /memberships/me
 * (planos da equipe), o pagamento reaproveita a tela /pedido/[paymentId].
 * ?trocar=1 → troca de plano para quem já tem mensalidade ativa (vale a partir do próximo ciclo).
 */
function SubscribeScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const changeMode = params.get('trocar') === '1';
  const { user, logout, loadUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [data, setData] = useState<MyMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TeamPlan | null>(null);
  const [buyer, setBuyer] = useState<CheckoutBuyer>({ name: '', email: '', cpf: '', phone: '' });
  const [billing, setBilling] = useState<BillingType>('PIX');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) setBuyer((b) => ({ ...b, name: b.name || user.name || '', email: b.email || user.email || '' }));
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/athlete-login');
      return;
    }
    getMyMembership()
      .then((d) => {
        setData(d);
        const current = d.membership?.plan.id;
        // Troca de plano: começa no plano ATUAL (o atleta escolhe o novo); senão o atual ou o primeiro
        const preferred = d.plans.find((p) => p.id === current) ?? d.plans[0] ?? null;
        setSelected(preferred);
        // assinatura legada (Mercado Pago) ativa e sem mensalidade nova: segue para os treinos
        if (!d.membership && d.legacySubscription && d.access.active && !changeMode) router.replace('/athlete');
        // mensalidade em dia (o login ainda consulta só a assinatura legada): segue para os treinos
        if (d.membership?.status === 'ACTIVE' && !d.membership.openInvoice && !changeMode) router.replace('/athlete');
      })
      .catch((e) => setError(e?.message || 'Não foi possível carregar seus planos.'))
      .finally(() => setLoading(false));
  }, [isAuthenticated, authLoading, changeMode, router]);

  const m = data?.membership ?? null;
  const isActive = m?.status === 'ACTIVE';
  const billingOptions = useMemo(() => {
    const md = data?.methods;
    const list: Array<{ id: BillingType; label: string; hint: string }> = [];
    if (md?.pix) list.push({ id: 'PIX', label: 'Pix', hint: 'Aprovação na hora' });
    if (md?.creditCard || md?.boleto) list.push({ id: 'UNDEFINED', label: 'Cartão de crédito ou boleto', hint: 'Você escolhe na fatura segura' });
    return list;
  }, [data]);

  useEffect(() => {
    if (billingOptions.length && !billingOptions.some((o) => o.id === billing)) setBilling(billingOptions[0].id);
  }, [billingOptions, billing]);

  const submit = async () => {
    if (!selected) return;
    setError('');
    if (changeMode && isActive) {
      setSubmitting(true);
      try {
        await changeMyPlan(selected.id);
        setDone(`Plano alterado para ${selected.name}. O novo valor vale a partir do próximo vencimento.`);
      } catch (e: any) {
        setError(e?.message || 'Não foi possível trocar o plano.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const problem = validateBuyer(buyer);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    try {
      const r = await subscribeMembership(selected.id, buyer, billing);
      if (r.payPath) router.push(r.payPath);
      else setDone('Assinatura criada! A fatura será gerada em instantes — acompanhe em “Minha mensalidade”.');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível concluir a assinatura.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 55%)' }}>
        <div className="w-8 h-8 border-2 border-red-200 border-t-[#DC2626] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-5 py-10" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 55%)' }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          {data?.team?.logoUrl ? (
            <img src={data.team.logoUrl} alt={data.team.name} className="w-24 h-24 mx-auto mb-4 rounded-2xl object-cover shadow-lg" />
          ) : (
            <div className="w-36 sm:w-44 mx-auto mb-5 rounded-2xl overflow-hidden shadow-lg">
              <img src="/logo.png" alt="Logo" className="w-full block" />
            </div>
          )}
          <h1 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">
            {changeMode && isActive ? 'Trocar de plano' : 'Minha mensalidade'}
          </h1>
          <p className="text-sm text-gray-500">
            Olá, <strong className="text-gray-700">{user?.name}</strong>
            {data?.team ? <> · {data.team.name}</> : null}
          </p>
        </div>

        {!data?.team ? (
          <div className="glass-card p-7 text-center">
            <p className="text-3xl mb-2">🏃</p>
            <p className="font-bold text-gray-900">Você ainda não faz parte de uma equipe</p>
            <p className="text-sm text-gray-500 mt-1">Peça o convite ao seu treinador para liberar os planos da assessoria.</p>
          </div>
        ) : done ? (
          <div className="glass-card p-8 text-center">
            <p className="text-4xl mb-2">✅</p>
            <p className="font-bold text-gray-900">{done}</p>
            <Link href="/athlete" className="inline-block mt-5 text-sm font-semibold text-red-700 underline">Voltar aos treinos</Link>
          </div>
        ) : isActive && !changeMode ? (
          <div className="glass-card p-7 text-center">
            <p className="text-4xl mb-2">🎉</p>
            <p className="font-bold text-gray-900">Sua mensalidade está ativa</p>
            <p className="text-sm text-gray-500 mt-1">
              {m!.plan.name} · próximo vencimento {fmtDate(m!.nextDueDate)}
            </p>
            <div className="flex flex-col gap-2 mt-5">
              <Link href="/athlete" className="py-3 rounded-xl bg-[#DC2626] text-white text-sm font-semibold">Ir para os treinos</Link>
              {data.plans.length > 1 && (
                <Link href="/athlete-subscribe?trocar=1" className="text-xs text-gray-500 underline">Trocar de plano</Link>
              )}
            </div>
          </div>
        ) : data.plans.length === 0 ? (
          <div className="glass-card p-7 text-center">
            <p className="font-bold text-gray-900">Sua equipe ainda não publicou planos de mensalidade</p>
            <p className="text-sm text-gray-500 mt-1">Assim que a assessoria cadastrar os planos, eles aparecem aqui.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {m?.openInvoice && !changeMode && (
              <div className={`rounded-2xl p-4 border ${m.status === 'PAST_DUE' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className={`text-sm font-bold ${m.status === 'PAST_DUE' ? 'text-red-800' : 'text-amber-900'}`}>
                  {m.status === 'PAST_DUE' ? 'Mensalidade em atraso' : 'Você tem uma fatura em aberto'}
                </p>
                <p className="text-xs text-gray-700 mt-0.5">
                  {m.plan.name} · {fmtBRL(m.openInvoice.amountInCents)} · vencimento {fmtDate(m.openInvoice.dueDate)}
                </p>
                <Link href={m.openInvoice.payPath} className="inline-block mt-2 text-xs font-bold underline text-gray-900">Pagar agora →</Link>
              </div>
            )}

            {changeMode && isActive && (
              <p className="text-xs text-gray-500 text-center">Seu plano atual está marcado. Escolha o novo plano abaixo.</p>
            )}
            <div className={`grid gap-3 pt-2 grid-cols-1 ${data.plans.length >= 3 ? 'sm:grid-cols-3' : data.plans.length === 2 ? 'sm:grid-cols-2' : ''}`}>
              {data.plans.map((p) => {
                const isSel = selected?.id === p.id;
                const isCurrent = m?.plan.id === p.id && isActive;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    disabled={isCurrent}
                    className={`relative min-w-0 rounded-2xl border-2 p-4 text-left transition cursor-pointer disabled:cursor-default disabled:opacity-80 ${
                      isSel ? 'border-[#DC2626] bg-white shadow-[0_4px_20px_rgba(220,38,38,0.15)]' : 'border-gray-200 bg-white/70 hover:border-gray-300'
                    }`}
                  >
                    {p.interval !== 'MONTHLY' && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#DC2626] text-white text-[10px] font-bold whitespace-nowrap">
                        {fmtBRL(p.monthlyEquivalentInCents)}/mês
                      </span>
                    )}
                    <div className="flex items-baseline justify-between gap-2 sm:block">
                      <p className={`text-xs font-semibold mb-1 truncate ${isSel ? 'text-[#DC2626]' : 'text-gray-400'}`}>{p.name}</p>
                      <p className={`text-lg sm:text-base lg:text-lg font-black leading-tight whitespace-nowrap ${isSel ? 'text-gray-900' : 'text-gray-700'}`}>{fmtBRL(p.priceInCents)}</p>
                    </div>
                    <p className={`text-[10px] mt-0.5 ${isCurrent ? 'font-bold text-emerald-700' : 'text-gray-400'}`}>{isCurrent ? '✓ plano atual' : INTERVAL_PERIOD[p.interval] ?? INTERVAL_LABEL[p.interval]}</p>
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="glass-card p-6">
                <div className="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-gray-100">
                  <div className="min-w-0">
                    <p className="text-xs text-[#DC2626] font-semibold uppercase tracking-wider mb-1">Plano selecionado</p>
                    <h2 className="font-bold text-gray-900 text-xl">{selected.name}</h2>
                    <p className="text-xs text-gray-400">{INTERVAL_LABEL[selected.interval]} · renovação automática</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xl sm:text-2xl font-black text-gray-900 whitespace-nowrap">{fmtBRL(selected.priceInCents)}</span>
                    <p className="text-xs text-gray-400">{INTERVAL_PERIOD[selected.interval]}</p>
                  </div>
                </div>

                {selected.description && <p className="text-sm text-gray-600 mb-3">{selected.description}</p>}
                {selected.benefits?.length > 0 && (
                  <ul className="space-y-2 mb-5">
                    {selected.benefits.map((f) => (
                      <li key={f} className="flex items-center gap-3 text-sm text-gray-600">
                        <span className="w-5 h-5 rounded-full bg-[#DC2626]/10 flex items-center justify-center flex-shrink-0 text-[#DC2626] text-xs">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}

                {changeMode && isActive ? (
                  <p className="text-xs text-gray-500 mb-4">
                    O novo valor passa a valer no próximo vencimento ({fmtDate(m?.nextDueDate)}). Nada é cobrado agora.
                  </p>
                ) : (
                  <div className="space-y-4 mb-5">
                    <BuyerFields value={buyer} onChange={setBuyer} />
                    {billingOptions.length > 1 && (
                      <div className="grid grid-cols-2 gap-2">
                        {billingOptions.map((o) => (
                          <button
                            key={o.id}
                            onClick={() => setBilling(o.id)}
                            className={`rounded-xl border-2 p-3 text-left ${billing === o.id ? 'border-[#DC2626] bg-red-50/40' : 'border-gray-200 bg-white'}`}
                          >
                            <p className="text-sm font-bold text-gray-900">{o.label}</p>
                            <p className="text-[11px] text-gray-500">{o.hint}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {data.methods.fake && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Ambiente de testes: o pagamento é simulado na próxima tela.
                      </p>
                    )}
                  </div>
                )}

                {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

                <button
                  onClick={submit}
                  disabled={submitting || (m?.plan.id === selected.id && isActive)}
                  className="w-full py-3.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold text-sm transition disabled:opacity-50 cursor-pointer shadow-[0_4px_16px_rgba(220,38,38,0.3)]"
                >
                  {submitting
                    ? 'Processando…'
                    : changeMode && isActive
                      ? `Trocar para ${selected.name}`
                      : `Assinar e pagar ${fmtBRL(selected.priceInCents)} →`}
                </button>
                {!(changeMode && isActive) && (
                  <p className="text-xs text-gray-400 text-center mt-3">A 1ª cobrança é hoje; as próximas são geradas automaticamente. Cancele quando quiser.</p>
                )}
              </div>
            )}
          </div>
        )}

        {error && !selected && <p className="text-center text-sm text-red-600 mt-4">{error}</p>}

        <div className="flex justify-center gap-6 mt-6">
          <Link href="/athlete" className="text-xs text-gray-400 hover:text-gray-600">Voltar</Link>
          <button
            onClick={() => { void logout({ redirectTo: '/athlete-login' }); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AthleteSubscribePage() {
  return (
    <Suspense fallback={null}>
      <SubscribeScreen />
    </Suspense>
  );
}
