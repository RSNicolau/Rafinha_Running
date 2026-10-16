'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fmtBRL } from '../../checkout/_lib/checkout';
import { MyMembership, STATUS_LABEL, cancelMyMembership, fmtDate, getMyMembership } from '../../athlete-subscribe/_lib/memberships';

const BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PAST_DUE: 'bg-red-100 text-red-700',
  PENDING: 'bg-amber-100 text-amber-700',
  PAUSED: 'bg-sky-100 text-sky-700',
  CANCELED: 'bg-gray-100 text-gray-500',
};

/** Card "Minha mensalidade": status, próximo vencimento, fatura, trocar plano, cancelar. */
export default function MembershipCard() {
  const [data, setData] = useState<MyMembership | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getMyMembership()
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => load(), [load]);

  if (failed) return null;
  if (!data) return <div className="h-28 rounded-3xl bg-gray-100 animate-pulse" />;
  if (!data.team && !data.membership && !data.legacySubscription) return null;

  const m = data.membership;
  const legacy = !m ? data.legacySubscription : null;

  const cancel = async () => {
    const reason = window.prompt(
      'Cancelar sua mensalidade? As próximas cobranças são encerradas e você mantém o acesso até o fim do período já pago.\n\nSe quiser, conte o motivo:',
      '',
    );
    if (reason === null) return;
    setBusy(true);
    try {
      const r = await cancelMyMembership(reason || undefined);
      alert(r.accessUntil ? `Mensalidade cancelada. Seu acesso continua até ${fmtDate(r.accessUntil)}.` : 'Mensalidade cancelada.');
      load();
    } catch (e: any) {
      alert(e?.message || 'Não foi possível cancelar agora.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Minha mensalidade</p>
        {m && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${BADGE[m.status] ?? ''}`}>{STATUS_LABEL[m.status]}</span>}
      </div>

      {data.access.banner === 'PAST_DUE' && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 mb-3 text-xs text-red-800 font-semibold">
          Mensalidade em atraso — regularize para continuar com a assessoria.
        </div>
      )}
      {data.access.banner === 'IN_GRACE' && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-3 text-xs text-amber-900 font-semibold">
          Sua mensalidade venceu. Pague até o fim da carência para evitar atraso.
        </div>
      )}

      {m ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">{m.plan.name}</span>
            <span className="text-sm font-black text-gray-900">{fmtBRL(m.priceInCents)}</span>
          </div>
          {m.status === 'CANCELED' ? (
            <p className="text-xs text-gray-500">
              {m.hasAccess && m.currentPeriodEnd ? `Cancelada · acesso até ${fmtDate(m.currentPeriodEnd)}` : `Cancelada em ${fmtDate(m.canceledAt)}`}
            </p>
          ) : m.status === 'PAUSED' ? (
            <p className="text-xs text-gray-500">Pausada pela equipe{m.currentPeriodEnd ? ` · período pago até ${fmtDate(m.currentPeriodEnd)}` : ''}</p>
          ) : (
            <p className="text-xs text-gray-500">
              Próximo vencimento: <strong className="text-gray-700">{fmtDate(m.openInvoice?.dueDate ?? m.nextDueDate)}</strong>
            </p>
          )}

          {m.openInvoice && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={m.openInvoice.payPath} className="px-3 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-bold">
                Pagar {fmtBRL(m.openInvoice.amountInCents)}
              </Link>
              {m.openInvoice.invoiceUrl && (
                <a href={m.openInvoice.invoiceUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700">
                  Ver fatura
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs">
            {m.status === 'ACTIVE' && data.plans.length > 1 && (
              <Link href="/athlete-subscribe?trocar=1" className="font-semibold text-gray-600 underline">Trocar plano</Link>
            )}
            {(m.status === 'CANCELED' || m.status === 'PENDING' || m.status === 'PAST_DUE') && data.plans.length > 0 && (
              <Link href="/athlete-subscribe" className="font-semibold text-gray-600 underline">
                {m.status === 'CANCELED' ? 'Assinar novamente' : 'Escolher outro plano'}
              </Link>
            )}
            {m.status !== 'CANCELED' && m.status !== 'PAUSED' && (
              <button onClick={cancel} disabled={busy} className="font-semibold text-gray-400 underline disabled:opacity-50">
                Cancelar mensalidade
              </button>
            )}
          </div>

          {data.payments.filter((p) => p.status === 'SUCCEEDED').length > 0 && (
            <details className="pt-2">
              <summary className="text-xs text-gray-400 cursor-pointer">Histórico de pagamentos</summary>
              <ul className="mt-2 divide-y divide-gray-100">
                {data.payments.slice(0, 12).map((p) => (
                  <li key={p.id} className="py-1.5 flex items-center justify-between text-xs">
                    <span className="text-gray-600">{fmtDate(p.paidAt ?? p.dueDate)}</span>
                    <span className="text-gray-500">
                      {p.status === 'SUCCEEDED' ? 'Pago' : p.status === 'PENDING' ? 'Em aberto' : p.status === 'REFUNDED' ? 'Estornado' : 'Cancelado'}
                    </span>
                    <span className="font-bold text-gray-800">{fmtBRL(p.amountInCents)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : legacy ? (
        <p className="text-sm text-gray-600">
          Assinatura {legacy.planType.toLowerCase()} ({legacy.status === 'ACTIVE' ? 'ativa' : legacy.status.toLowerCase()}) até {fmtDate(legacy.currentPeriodEnd)}
        </p>
      ) : data.plans.length > 0 ? (
        <div>
          <p className="text-sm text-gray-600 mb-3">Você ainda não tem mensalidade com a {data.team?.name}.</p>
          <Link href="/athlete-subscribe" className="inline-block px-4 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-bold">Ver planos</Link>
        </div>
      ) : (
        <p className="text-sm text-gray-400">Sua equipe ainda não publicou planos de mensalidade.</p>
      )}
    </div>
  );
}
