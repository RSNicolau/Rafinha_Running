'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { apiFetch, fmtBRL, recallPaymentToken, rememberPaymentToken } from '../../checkout/_lib/checkout';

type Status = {
  paymentId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  purpose: 'STORE_ORDER' | 'EVENT_REGISTRATION' | 'PLATFORM_PLAN' | string;
  provider: string;
  method: string | null;
  amountInCents: number;
  checkoutUrl: string | null;
  pix: { qrCodeBase64: string | null; copyPaste: string; expiresAt: string | null } | null;
  paidAt: string | null;
  expiresAt: string | null;
  /** Mensalidade: vencimento da cobrança (não é prazo de reserva) */
  dueDate?: string | null;
  needsRefund: boolean;
  fakePayAvailable: boolean;
  reference: any;
};

const POLL_MS = 4000;

const MEMBERSHIP_INTERVAL: Record<string, string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

function PaymentScreen() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const search = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t = search.get('token') || recallPaymentToken(paymentId);
    if (t) {
      setToken(t);
      rememberPaymentToken(paymentId, t);
    } else {
      setToken('');
    }
  }, [paymentId, search]);

  const load = useCallback(async () => {
    if (token === null) return;
    try {
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      const s = await apiFetch<Status>(`/checkout/${paymentId}/status${qs}`);
      setData(s);
      setError('');
      if (s.status !== 'PENDING' && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    } catch (e: any) {
      setError(e?.status === 404 ? 'Pagamento não encontrado. Use o link recebido ao finalizar a compra.' : e.message);
    }
  }, [paymentId, token]);

  useEffect(() => {
    if (token === null) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
      clearInterval(clock);
    };
  }, [token, load]);

  const copy = async () => {
    if (!data?.pix?.copyPaste) return;
    try {
      await navigator.clipboard.writeText(data.pix.copyPaste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard indisponível em http na rede local — o campo abaixo permite copiar manualmente */
    }
  };

  const simulate = async () => {
    setSimulating(true);
    try {
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      await apiFetch(`/checkout/${paymentId}/fake-pay${qs}`, { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSimulating(false);
    }
  };

  if (error && !data) {
    return (
      <Shell>
        <div className="text-center py-10">
          <p className="text-4xl mb-3">🔎</p>
          <p className="font-semibold text-zinc-900">{error}</p>
          <Link href="/loja" className="inline-block mt-6 text-sm font-semibold text-red-700 underline">Voltar à loja</Link>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="py-16 text-center text-zinc-500">
          <div className="inline-block w-7 h-7 border-2 border-red-200 border-t-red-600 rounded-full animate-spin mb-3" />
          <p className="text-sm">Carregando pagamento…</p>
        </div>
      </Shell>
    );
  }

  const ref = data.reference ?? {};
  const isMembership = data.purpose === 'MEMBERSHIP' || ref.type === 'MEMBERSHIP';
  // mensalidade não tem reserva com prazo: sem contagem regressiva
  const expiresAt = !isMembership && data.expiresAt ? new Date(data.expiresAt).getTime() : null;
  const dueDate = isMembership ? ref.dueDate ?? data.dueDate ?? null : null;
  const remaining = expiresAt ? Math.max(0, expiresAt - now) : null;

  return (
    <Shell>
      {/* Resumo */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 mb-4 flex items-center gap-3">
        {ref.productImage ? (
          <img src={ref.productImage} alt="" className="w-14 h-14 rounded-xl object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-zinc-100 flex items-center justify-center text-2xl">
            {data.purpose === 'EVENT_REGISTRATION' ? '🏁' : data.purpose === 'PLATFORM_PLAN' ? '🚀' : isMembership ? '🏃' : '🛍️'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-900 truncate">
            {ref.type === 'STORE_ORDER' && `${ref.productName} × ${ref.quantity}`}
            {ref.type === 'EVENT_REGISTRATION' && `Inscrição — ${ref.eventTitle}`}
            {ref.type === 'PLATFORM_PLAN' && `Plano ${ref.planType}`}
            {isMembership && `Mensalidade — ${ref.planName ?? 'plano'}${ref.teamName ? ` · ${ref.teamName}` : ''}`}
          </p>
          <p className="text-xs text-zinc-500">
            {ref.type === 'STORE_ORDER' && <>Pedido #{ref.orderCode}{ref.size ? ` · ${ref.size}` : ''}{ref.color ? ` · ${ref.color}` : ''}{ref.isPreOrder ? ' · Encomenda' : ''}</>}
            {ref.type === 'EVENT_REGISTRATION' && ref.eventDate && new Date(ref.eventDate).toLocaleDateString('pt-BR')}
            {isMembership && (
              <>
                {MEMBERSHIP_INTERVAL[ref.interval] ?? 'Mensalidade'}
                {dueDate ? ` · vencimento ${new Date(dueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}
              </>
            )}
          </p>
        </div>
        <p className="text-lg font-black text-red-700">{fmtBRL(data.amountInCents)}</p>
      </div>

      {data.status === 'SUCCEEDED' && <Success data={data} paymentId={paymentId} />}

      {data.status === 'PENDING' && (
        <>
          {data.pix && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 mb-4 text-center">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">Pague com Pix</p>
              {data.pix.qrCodeBase64 ? (
                <img src={data.pix.qrCodeBase64} alt="QR Code Pix" className="mx-auto w-56 h-56 rounded-lg border border-zinc-100" />
              ) : (
                <p className="text-xs text-zinc-500 mb-2">Use o código copia-e-cola abaixo.</p>
              )}
              <p className="text-xs text-zinc-500 mt-3 mb-2">Ou copie o código e cole no app do seu banco:</p>
              <textarea
                readOnly
                value={data.pix.copyPaste}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full text-[11px] font-mono rounded-lg border border-zinc-200 bg-zinc-50 p-2 h-20 resize-none text-zinc-700"
              />
              <button
                onClick={copy}
                className="mt-2 w-full py-3 rounded-xl text-white text-sm font-black uppercase tracking-widest"
                style={{ background: 'linear-gradient(135deg,#CC1F1A,#8B0000)' }}
              >
                {copied ? '✓ Código copiado' : 'Copiar código Pix'}
              </button>
            </div>
          )}

          {data.checkoutUrl && (
            <a
              href={data.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 rounded-xl border-2 border-zinc-900 text-zinc-900 text-sm font-black mb-4"
            >
              {data.provider === 'STRIPE' ? 'Pagar com cartão internacional →' : data.pix ? 'Prefere cartão ou boleto? Abrir fatura →' : 'Abrir fatura para pagar →'}
            </a>
          )}

          <div className="rounded-xl bg-zinc-100 p-3 text-center text-xs text-zinc-600 mb-4">
            <span className="inline-block w-3 h-3 border-2 border-zinc-300 border-t-red-600 rounded-full animate-spin align-middle mr-2" />
            Aguardando confirmação do pagamento — esta tela atualiza sozinha.
            {remaining !== null && remaining > 0 && (
              <p className="mt-1 font-semibold text-zinc-800">{holdLabel(remaining, expiresAt!)}</p>
            )}
            {remaining === 0 && <p className="mt-1 font-semibold text-red-700">O prazo de pagamento terminou.</p>}
          </div>

          {data.fakePayAvailable && (
            <button
              onClick={simulate}
              disabled={simulating}
              className="w-full py-2.5 rounded-xl border border-dashed border-amber-400 bg-amber-50 text-amber-800 text-xs font-bold"
            >
              {simulating ? 'Simulando…' : '⚙️ Simular pagamento (ambiente de testes)'}
            </button>
          )}
        </>
      )}

      {data.status === 'FAILED' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-3xl mb-2">⏱️</p>
          <p className="font-bold text-red-800">Pagamento não concluído</p>
          <p className="text-sm text-red-700 mt-1">
            {isMembership
              ? 'Esta cobrança foi encerrada (substituída, cancelada ou paga por outro meio). Veja sua mensalidade para a fatura atual.'
              : 'O prazo expirou ou a cobrança foi cancelada. A reserva foi liberada.'}
          </p>
          <BackLink data={data} />
        </div>
      )}

      {data.status === 'REFUNDED' && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-center">
          <p className="font-bold text-zinc-900">Pagamento estornado</p>
          <p className="text-sm text-zinc-600 mt-1">O valor foi devolvido para o meio de pagamento original.</p>
        </div>
      )}

      {error && <p className="text-center text-xs text-red-600 mt-3">{error}</p>}
    </Shell>
  );
}

/**
 * Prazo da reserva: até 1 h → mm:ss; até 24 h → "Xh YYmin"; acima disso → data e hora
 * (evita "Reserva válida por 4319:55" em cobranças de 72 h).
 */
function holdLabel(remainingMs: number, expiresAtMs: number): string {
  const H = 60 * 60 * 1000;
  if (remainingMs > 24 * H) {
    const d = new Date(expiresAtMs);
    return `Reserva válida até ${d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`;
  }
  if (remainingMs >= H) {
    const h = Math.floor(remainingMs / H);
    const m = Math.floor((remainingMs % H) / 60000);
    return `Reserva válida por ${h}h${String(m).padStart(2, '0')}min`;
  }
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000);
  return `Reserva válida por ${mm}:${String(ss).padStart(2, '0')}`;
}

/** Link "Defina sua senha" guardado pelo onboarding (conta criada sem senha conhecida). */
function useSetPasswordPath(paymentId: string): string | null {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(`rr_set_password:${paymentId}`);
      if (v && v.startsWith('/reset-password?')) setPath(v);
    } catch {
      /* armazenamento indisponível — o link também foi enviado por e-mail */
    }
  }, [paymentId]);
  return path;
}

function Success({ data, paymentId }: { data: Status; paymentId: string }) {
  const ref = data.reference ?? {};
  const setPasswordPath = useSetPasswordPath(paymentId);
  if (data.needsRefund) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
        <p className="text-3xl mb-2">⚠️</p>
        <p className="font-bold text-amber-900">Pagamento recebido, mas o item não está mais disponível</p>
        <p className="text-sm text-amber-800 mt-1">A reserva havia expirado e o estoque/vaga acabou. O organizador fará o estorno integral.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
      <p className="text-5xl mb-2">🎉</p>
      <p className="text-xl font-black text-emerald-900">Pagamento confirmado!</p>
      {ref.type === 'STORE_ORDER' && (
        <>
          <p className="text-sm text-emerald-800 mt-2">Pedido #{ref.orderCode} pago. Enviamos a confirmação por e-mail.</p>
          {ref.isPreOrder && (
            <p className="text-sm text-emerald-800 mt-1">
              Encomenda{ref.estimatedDelivery ? ` com previsão de entrega em ${new Date(ref.estimatedDelivery).toLocaleDateString('pt-BR')}` : ''}.
            </p>
          )}
          <Link href="/loja" className="inline-block mt-5 text-sm font-bold text-emerald-900 underline">Voltar à loja</Link>
        </>
      )}
      {ref.type === 'EVENT_REGISTRATION' && (
        <>
          <p className="text-sm text-emerald-800 mt-2">Sua inscrição em <strong>{ref.eventTitle}</strong> está confirmada.</p>
          {ref.bibNumber && (
            <div className="mx-auto mt-4 max-w-[200px] rounded-2xl border-2 border-red-600 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Número de peito</p>
              <p className="text-4xl font-black text-red-700">{ref.bibNumber}</p>
            </div>
          )}
          <Link href={`/eventos/${ref.eventId}`} className="inline-block mt-5 text-sm font-bold text-emerald-900 underline">Ver evento</Link>
        </>
      )}
      {ref.type === 'MEMBERSHIP' && (
        <>
          <p className="text-sm text-emerald-800 mt-2">
            Mensalidade {ref.planName ? <strong>{ref.planName}</strong> : null}{ref.teamName ? ` da ${ref.teamName}` : ''} confirmada.
            {ref.currentPeriodEnd ? ` Período garantido até ${new Date(ref.currentPeriodEnd).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` : ''}
          </p>
          {setPasswordPath ? (
            <div className="mt-5 rounded-xl bg-white border border-emerald-200 p-4">
              <p className="text-sm font-bold text-emerald-900">Defina sua senha</p>
              <p className="text-xs text-emerald-800 mt-1">Crie a senha para entrar no app e acompanhar seus treinos. Também enviamos este link por e-mail.</p>
              <Link href={setPasswordPath} className="inline-block mt-3 px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-bold">Definir minha senha</Link>
            </div>
          ) : (
            <Link href="/athlete" className="inline-block mt-5 text-sm font-bold text-emerald-900 underline">Ir para os treinos</Link>
          )}
        </>
      )}
      {ref.type === 'PLATFORM_PLAN' && (
        <>
          <p className="text-sm text-emerald-800 mt-2">Seu plano {ref.planType} está ativo.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-4"><Link href="/dashboard" className="text-sm font-bold text-emerald-900 underline">Ir para o painel</Link><Link href="/dashboard/billing" className="text-sm text-emerald-800 underline">Ver assinatura</Link></div>
        </>
      )}
    </div>
  );
}

function BackLink({ data }: { data: Status }) {
  const ref = data.reference ?? {};
  const href =
    ref.type === 'EVENT_REGISTRATION'
      ? `/eventos/${ref.eventId}`
      : ref.type === 'PLATFORM_PLAN'
        ? '/dashboard/billing'
        : ref.type === 'MEMBERSHIP' || data.purpose === 'MEMBERSHIP'
          ? '/athlete-subscribe'
          : '/loja';
  return (
    <Link href={href} className="inline-block mt-4 text-sm font-bold text-red-800 underline">
      Tentar novamente
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="py-6 text-center" style={{ background: '#CC1F1A' }}>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-red-100">Pagamento seguro</p>
      </div>
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

export default function PedidoPage() {
  return (
    <Suspense fallback={null}>
      <PaymentScreen />
    </Suspense>
  );
}
