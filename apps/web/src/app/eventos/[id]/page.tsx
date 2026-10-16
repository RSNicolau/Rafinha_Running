'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import BuyerFields from '../../checkout/_components/BuyerFields';
import PaymentMethodPicker from '../../checkout/_components/PaymentMethodPicker';
import {
  CheckoutBuyer, PaymentChoice, apiFetch, createCheckout, fmtBRL, isLoggedIn, paymentUrl, validateBuyer,
} from '../../checkout/_lib/checkout';

const RED = '#CC1F1A';

type EventData = {
  id: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  eventDate: string;
  location?: string;
  city?: string;
  state?: string;
  modality?: string;
  maxParticipants?: number;
  price: number;
  status: string;
  rules?: string;
  kitDescription?: string;
  kitCompletePrice?: number | null;
  kitPremiumPrice?: number | null;
  kitPickupLocation?: string;
  kitPickupDate?: string;
  spotsLeft?: number | null;
};

type Distance = {
  id: string;
  name: string;
  distanceKm?: number | null;
  price: number;
  maxParticipants?: number | null;
  registeredCount: number;
  description?: string | null;
  ageGroup?: string | null;
};

type Quote = { base: number; kit: number; subtotal: number; discountInCents: number; totalInCents: number; coupon: { code: string } | null };

type Step = 'info' | 'opcoes' | 'dados' | 'sucesso' | 'espera';

const SHIRT_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Mensagem amigável para cupom recusado (nunca texto técnico). */
function friendlyCouponError(e: any): string {
  const msg: string = typeof e?.message === 'string' ? e.message : '';
  if (msg && !/^Erro \d+$/.test(msg) && !/cannot (post|get)|not found|internal server/i.test(msg)) return msg;
  return 'Cupom inválido, expirado ou esgotado.';
}

function EventoInner() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<EventData | null>(null);
  const [distances, setDistances] = useState<Distance[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('info');

  const [distanceId, setDistanceId] = useState('');
  const [kitType, setKitType] = useState<'COMPLETO' | 'PREMIUM'>('COMPLETO');
  const [shirtSize, setShirtSize] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [medicalInfo, setMedicalInfo] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [couponError, setCouponError] = useState('');
  const [buyer, setBuyer] = useState<CheckoutBuyer>({ name: '', email: '', cpf: '', phone: '' });
  const [choice, setChoice] = useState<PaymentChoice>('PIX');
  const [logged, setLogged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [registration, setRegistration] = useState<{ bibNumber?: string | null } | null>(null);

  useEffect(() => {
    setLogged(isLoggedIn());
    try {
      const u = JSON.parse(localStorage.getItem('rr_user') || 'null');
      if (u) setBuyer((b) => ({ ...b, name: u.name ?? '', email: u.email ?? '' }));
    } catch {
      /* sem sessão */
    }
    Promise.all([
      apiFetch<EventData>(`/events/${eventId}`),
      apiFetch<Distance[]>(`/events/${eventId}/distances`).catch(() => []),
    ])
      .then(([ev, ds]) => {
        setEvent(ev);
        setDistances(Array.isArray(ds) ? ds : []);
      })
      .catch(() => setEvent(null))
      .finally(() => setLoading(false));
  }, [eventId]);

  const hasKits = !!event && (event.kitCompletePrice != null || event.kitPremiumPrice != null);
  const hasPremium = !!event && event.kitPremiumPrice != null;

  // Prévia de preço calculada no servidor (percurso + kit + cupom)
  useEffect(() => {
    if (!event || step === 'info') return;
    if (distances.length && !distanceId) {
      setQuote(null);
      return;
    }
    const t = setTimeout(() => {
      apiFetch<Quote>('/events/quote', {
        method: 'POST',
        body: JSON.stringify({ eventId, distanceId: distanceId || undefined, kitType: hasKits ? kitType : undefined, code: couponCode || undefined }),
      })
        .then((q) => {
          setQuote(q);
          setQuoteError('');
          // Cupom informado mas não aplicado pelo servidor → avisa (não some em silêncio)
          if (couponCode && !q?.coupon) {
            setCouponError('Este cupom não se aplica a esta inscrição.');
            setCouponCode('');
          }
        })
        .catch((e) => {
          if (couponCode) {
            // Erro do cupom fica num estado próprio: a nova prévia (sem cupom) não o apaga
            setCouponError(friendlyCouponError(e));
            setCouponCode('');
          } else {
            setQuoteError(e?.message && !/^Erro \d+$/.test(e.message) ? e.message : 'Não foi possível calcular o valor. Tente novamente.');
          }
        });
    }, 200);
    return () => clearTimeout(t);
  }, [event, eventId, distanceId, kitType, couponCode, hasKits, step, distances.length]);

  const selectedDistance = useMemo(() => distances.find((d) => d.id === distanceId), [distances, distanceId]);
  const returnTo = `/eventos/${eventId}`;

  function rememberReturn() {
    try {
      localStorage.setItem('rr_return_to', returnTo);
    } catch {
      /* ignore */
    }
  }

  function toDados() {
    if (distances.length && !distanceId) return setError('Escolha o percurso.');
    if (!shirtSize) return setError('Escolha o tamanho da camiseta.');
    setError('');
    setStep('dados');
  }

  async function submit() {
    const total = quote?.totalInCents ?? 0;
    if (total > 0) {
      const problem = validateBuyer(buyer);
      if (problem) return setError(problem);
    }
    setSubmitting(true);
    setError('');
    try {
      const reg = await apiFetch<any>(`/events/${eventId}/register`, {
        method: 'POST',
        body: JSON.stringify({
          distanceId: distanceId || undefined,
          kitType: hasKits ? kitType : undefined,
          shirtSize,
          emergencyContact: emergencyContact.trim() || undefined,
          medicalInfo: medicalInfo.trim() || undefined,
          couponCode: couponCode || undefined,
        }),
      });
      if (reg.waitlisted) {
        setStep('espera');
        return;
      }
      if (!reg.requiresPayment) {
        setRegistration(reg);
        setStep('sucesso');
        return;
      }
      const checkout = await createCheckout({ purpose: 'EVENT_REGISTRATION', refId: reg.id, buyer, choice });
      router.push(paymentUrl(checkout));
    } catch (e: any) {
      if (e.status === 401) {
        setLogged(false);
        setError('Sua sessão expirou. Entre novamente para concluir a inscrição.');
      } else {
        setError(e.message || 'Não foi possível concluir a inscrição.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 text-zinc-500">
        <div className="inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!event) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-100 text-zinc-500">Evento não encontrado.</div>;
  }

  const closed = event.status === 'CANCELED' || event.status === 'COMPLETED' || event.status === 'DRAFT';

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Hero */}
      <div className="relative bg-zinc-900" style={{ minHeight: 220 }}>
        {event.coverImageUrl ? (
          <img src={event.coverImageUrl} alt={event.title} className="w-full h-56 object-cover opacity-60" />
        ) : (
          <div className="w-full h-56 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}>
            <div style={{ isolation: 'isolate', background: RED }}>
              <Image src="/logo.png" alt="RR Rafinha Running" width={140} height={100}
                style={{ display: 'block', filter: 'saturate(0) brightness(0.6) contrast(100)', mixBlendMode: 'screen' }} />
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-5" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300 mb-1">{event.modality ?? 'Corrida de rua'}</p>
          <h1 className="text-2xl font-black text-white leading-tight">{event.title}</h1>
          <p className="text-sm text-zinc-300 mt-1">
            📅 {fmtDate(event.eventDate)}
            {event.city && <span> · 📍 {event.city}{event.state ? `/${event.state}` : ''}</span>}
          </p>
        </div>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto">
        {error && <div className="rounded-xl p-3 mb-4 text-sm font-semibold bg-red-50 text-red-700">{error}</div>}

        {step === 'info' && (
          <>
            {event.description && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 mb-4">
                <p className="text-sm leading-relaxed text-zinc-800 whitespace-pre-line">{event.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { icon: '📅', label: 'Data', value: fmtDateTime(event.eventDate) },
                { icon: '📍', label: 'Local', value: event.location ?? event.city ?? '–' },
                { icon: '💰', label: 'Inscrição', value: event.price > 0 ? `a partir de ${fmtBRL(Math.min(event.price, ...distances.filter((d) => d.price > 0).map((d) => d.price)))}` : distances.some((d) => d.price > 0) ? 'Ver percursos' : 'Gratuita' },
                { icon: '👥', label: 'Vagas', value: event.spotsLeft != null ? `${event.spotsLeft} restantes` : 'Ilimitadas' },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xl mb-1">{c.icon}</p>
                  <p className="text-[10px] uppercase font-bold tracking-widest mb-0.5 text-zinc-500">{c.label}</p>
                  <p className="text-sm font-bold leading-tight text-zinc-900">{c.value}</p>
                </div>
              ))}
            </div>

            {distances.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 mb-4">
                <p className="text-xs font-black uppercase tracking-widest mb-2 text-zinc-500">Percursos</p>
                {distances.map((d) => (
                  <div key={d.id} className="flex justify-between py-1.5 text-sm">
                    <span className="text-zinc-800">{d.name}{d.distanceKm ? ` · ${d.distanceKm} km` : ''}</span>
                    <span className="font-bold text-zinc-900">{fmtBRL(d.price > 0 ? d.price : event.price)}</span>
                  </div>
                ))}
              </div>
            )}

            {(event.kitPickupLocation || event.kitPickupDate) && (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 mb-4">
                <p className="text-xs font-black uppercase tracking-widest mb-2 text-orange-700">📦 Retirada do kit</p>
                {event.kitPickupLocation && <p className="text-sm text-zinc-900"><strong>Local:</strong> {event.kitPickupLocation}</p>}
                {event.kitPickupDate && <p className="text-sm mt-1 text-zinc-900"><strong>Data:</strong> {fmtDateTime(event.kitPickupDate)}</p>}
              </div>
            )}

            {event.rules && (
              <details className="rounded-2xl border border-zinc-200 bg-white p-4 mb-4">
                <summary className="text-sm font-bold text-zinc-900 cursor-pointer">Regulamento</summary>
                <p className="text-xs text-zinc-600 mt-2 whitespace-pre-line">{event.rules}</p>
              </details>
            )}

            {closed ? (
              <p className="text-center text-sm font-bold text-zinc-500">Inscrições encerradas.</p>
            ) : (
              <button onClick={() => setStep('opcoes')}
                className="w-full py-4 rounded-2xl text-white font-black uppercase tracking-widest text-sm shadow-md"
                style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}>
                {event.status === 'SOLD_OUT' ? 'Entrar na lista de espera →' : 'Inscrever-se →'}
              </button>
            )}
          </>
        )}

        {step === 'opcoes' && (
          <>
            {distances.length > 0 && (
              <div className="mb-5">
                <h2 className="text-lg font-black mb-3 text-zinc-900">Escolha o percurso</h2>
                {distances.map((d) => {
                  const soldOut = d.maxParticipants != null && d.registeredCount >= d.maxParticipants;
                  return (
                    <button key={d.id} disabled={soldOut} onClick={() => setDistanceId(d.id)}
                      className={`w-full flex items-center justify-between rounded-2xl border-2 p-4 mb-2 text-left transition disabled:opacity-50 ${distanceId === d.id ? 'border-red-600 bg-red-50' : 'border-zinc-200 bg-white'}`}>
                      <span>
                        <span className="block font-bold text-zinc-900">{d.name}{d.distanceKm ? ` · ${d.distanceKm} km` : ''}</span>
                        {(d.description || d.ageGroup) && <span className="block text-xs text-zinc-500">{d.description || d.ageGroup}</span>}
                      </span>
                      <span className="font-black text-red-700">{soldOut ? 'Esgotado' : fmtBRL(d.price > 0 ? d.price : event.price)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {hasKits && (
              <div className="mb-5">
                <h2 className="text-lg font-black mb-3 text-zinc-900">Kit</h2>
                {(['COMPLETO', ...(hasPremium ? ['PREMIUM'] : [])] as Array<'COMPLETO' | 'PREMIUM'>).map((k) => {
                  const add = k === 'PREMIUM' ? event.kitPremiumPrice ?? 0 : event.kitCompletePrice ?? 0;
                  return (
                    <button key={k} onClick={() => setKitType(k)}
                      className={`w-full flex items-center justify-between rounded-2xl border-2 p-4 mb-2 text-left ${kitType === k ? 'border-red-600 bg-red-50' : 'border-zinc-200 bg-white'}`}>
                      <span className="font-bold text-zinc-900">Kit {k === 'PREMIUM' ? 'Premium' : 'Completo'}</span>
                      <span className="font-black text-red-700">{add > 0 ? `+ ${fmtBRL(add)}` : 'Incluso'}</span>
                    </button>
                  );
                })}
                {event.kitDescription && <p className="text-xs text-zinc-500 whitespace-pre-line">{event.kitDescription}</p>}
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 mb-5">
              <p className="text-xs font-black uppercase tracking-widest mb-3 text-zinc-500">Tamanho da camiseta</p>
              <div className="flex flex-wrap gap-2">
                {SHIRT_SIZES.map((s) => (
                  <button key={s} onClick={() => setShirtSize(s)}
                    className={`px-4 py-2 rounded-xl border font-black text-sm ${shirtSize === s ? 'border-red-600 bg-red-50 text-red-700' : 'border-zinc-200 text-zinc-900'}`}>{s}</button>
                ))}
              </div>
            </div>

            {quote && (
              <div className="rounded-xl bg-white border border-zinc-200 p-3 mb-4 flex justify-between text-sm">
                <span className="text-zinc-600">Total</span>
                <span className="font-black text-zinc-900">{quote.totalInCents > 0 ? fmtBRL(quote.totalInCents) : 'Gratuito'}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('info')} className="px-5 py-3 rounded-2xl border border-zinc-200 font-black text-sm text-zinc-500">← Voltar</button>
              <button onClick={toDados} className="flex-1 py-3 rounded-2xl text-white font-black uppercase tracking-widest text-sm"
                style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}>Continuar →</button>
            </div>
          </>
        )}

        {step === 'dados' && !logged && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center">
            <p className="text-3xl mb-2">🔐</p>
            <p className="font-bold text-zinc-900">Entre na sua conta para concluir a inscrição</p>
            <p className="text-sm text-zinc-500 mt-1">Sua inscrição, número de peito e QR Code do kit ficam na sua área do atleta.</p>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <Link href={`/athlete-login?redirect=${encodeURIComponent(returnTo)}`} onClick={rememberReturn}
                className="py-3 rounded-xl text-white text-sm font-black" style={{ background: RED }}>Entrar</Link>
              <Link href={`/athlete-register?redirect=${encodeURIComponent(returnTo)}`} onClick={rememberReturn}
                className="py-3 rounded-xl border-2 border-zinc-900 text-zinc-900 text-sm font-black">Criar conta</Link>
            </div>
            <button onClick={() => setLogged(isLoggedIn())} className="mt-4 text-xs text-zinc-500 underline">Já entrei — continuar</button>
          </div>
        )}

        {step === 'dados' && logged && (
          <>
            <h2 className="text-lg font-black mb-1 text-zinc-900">Seus dados</h2>
            <p className="text-sm mb-4 text-zinc-500">
              {selectedDistance ? `${selectedDistance.name} · ` : ''}{hasKits ? `Kit ${kitType === 'PREMIUM' ? 'Premium' : 'Completo'} · ` : ''}Camiseta {shirtSize}
            </p>

            <div className="space-y-3 mb-4">
              <BuyerFields value={buyer} onChange={setBuyer} hideCpf={!!quote && quote.totalInCents === 0} />
              <input className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm outline-none" placeholder="Contato de emergência (nome e telefone)"
                value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} />
              <textarea rows={2} className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm outline-none resize-none" placeholder="Condições médicas relevantes (opcional)"
                value={medicalInfo} onChange={(e) => setMedicalInfo(e.target.value)} />
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 mb-4">
              <p className="text-xs font-black uppercase tracking-widest mb-2 text-zinc-500">🎟️ Cupom</p>
              {couponCode && quote?.coupon ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-emerald-700">✓ {quote.coupon.code} (−{fmtBRL(quote.discountInCents)})</p>
                  <button onClick={() => { setCouponCode(''); setCouponInput(''); }} className="text-xs px-2 py-1 rounded-lg border border-red-600 text-red-700">Remover</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={couponInput} onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                    placeholder="Código" className="flex-1 border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none uppercase" />
                  <button onClick={() => { setCouponError(''); setCouponCode(couponInput.trim()); }} disabled={!couponInput.trim()}
                    className="px-3 py-2 rounded-xl text-sm font-semibold bg-zinc-900 text-white disabled:bg-zinc-200 disabled:text-zinc-500">Aplicar</button>
                </div>
              )}
              {couponError && <p className="text-xs mt-1.5 font-semibold text-red-600" role="alert">{couponError}</p>}
              {quoteError && <p className="text-xs mt-1.5 font-semibold text-red-600">{quoteError}</p>}
            </div>

            {quote && (
              <div className="rounded-2xl bg-white border border-zinc-200 p-4 mb-4 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-zinc-600">Inscrição</span><span>{fmtBRL(quote.base)}</span></div>
                {quote.kit > 0 && <div className="flex justify-between"><span className="text-zinc-600">Kit</span><span>{fmtBRL(quote.kit)}</span></div>}
                {quote.discountInCents > 0 && <div className="flex justify-between text-emerald-700"><span>Cupom</span><span>−{fmtBRL(quote.discountInCents)}</span></div>}
                <div className="flex justify-between font-black text-zinc-900 pt-1 border-t border-zinc-100"><span>Total</span><span>{quote.totalInCents > 0 ? fmtBRL(quote.totalInCents) : 'Gratuito'}</span></div>
              </div>
            )}

            {(quote?.totalInCents ?? 0) > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold mb-1.5 text-zinc-500">Forma de pagamento</p>
                <PaymentMethodPicker value={choice} onChange={setChoice} />
                <p className="text-[11px] text-zinc-500 mt-2">Sua vaga fica reservada por 30 minutos enquanto o pagamento é confirmado. O número de peito é gerado na confirmação.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('opcoes')} className="px-5 py-3 rounded-2xl border border-zinc-200 font-black text-sm text-zinc-500">← Voltar</button>
              <button onClick={submit} disabled={submitting || !quote}
                className="flex-1 py-3.5 rounded-2xl text-white font-black uppercase tracking-widest text-sm disabled:opacity-70"
                style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}>
                {submitting ? 'Processando…' : (quote?.totalInCents ?? 0) > 0 ? 'Ir para o pagamento →' : 'Confirmar inscrição →'}
              </button>
            </div>
          </>
        )}

        {step === 'espera' && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">⏳</div>
            <h2 className="text-xl font-black text-zinc-900">Você está na lista de espera</h2>
            <p className="text-sm text-zinc-500 mt-2">As vagas esgotaram. Se uma vaga abrir, avisamos por e-mail e você terá 24h para concluir o pagamento.</p>
          </div>
        )}

        {step === 'sucesso' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-black mb-2 text-zinc-900">Inscrição confirmada!</h2>
            <p className="text-sm mb-6 text-zinc-500">Você está inscrito em <strong>{event.title}</strong>.</p>
            {registration?.bibNumber && (
              <div className="rounded-2xl border-2 border-red-600 bg-red-50 p-6 mb-5 mx-auto max-w-xs">
                <p className="text-xs font-black uppercase tracking-widest mb-2 text-zinc-500">Seu número de peito</p>
                <p className="text-5xl font-black text-red-700">{registration.bibNumber}</p>
              </div>
            )}
            <p className="text-sm text-zinc-600 mb-4">O QR Code para retirar o kit fica em Eventos → Minhas inscrições.</p>
            <Link href="/dashboard/athlete/events?tab=mine" className="inline-block px-5 py-3 rounded-2xl text-white text-sm font-black" style={{ background: RED }}>
              Ver minhas inscrições e QR do kit
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EventoPage() {
  return (
    <Suspense fallback={null}>
      <EventoInner />
    </Suspense>
  );
}
