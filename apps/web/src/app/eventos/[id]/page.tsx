'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';

const RED   = '#CC1F1A';
const PAGE  = '#F4F4F5';
const WHITE = '#FFFFFF';
const DARK  = '#18181B';
const GRAY  = '#71717A';
const LIGHT = '#E4E4E7';
const GREEN = '#16A34A';

type Event = {
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
  kitDescription?: string;
  kitCompletePrice?: number;
  kitPremiumPrice?: number;
  kitPickupLocation?: string;
  kitPickupDate?: string;
  _count?: { registrations: number };
};

type Step = 'info' | 'kit' | 'dados' | 'sucesso';

const KIT_ITEMS = {
  COMPLETO: ['Camiseta oficial', 'Eco Bolsa', 'Medalha Finisher', 'Número de peito', 'Chip de cronometragem'],
  PREMIUM:  ['Camiseta oficial', 'Bolsa', 'Viseira', 'Toalha', 'Medalha Finisher', 'Número de peito', 'Chip de cronometragem'],
};

const SHIRT_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

function fmtPrice(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EventoPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('info');
  const [kitType, setKitType] = useState<'COMPLETO' | 'PREMIUM' | null>(null);
  const [shirtSize, setShirtSize] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', emergencyContact: '', medicalInfo: '' });
  const [submitting, setSubmitting] = useState(false);
  const [registration, setRegistration] = useState<{ bibNumber?: string; kitPickupScheduledAt?: string } | null>(null);
  const [error, setError] = useState('');

  const API = '/api/v1';

  useEffect(() => {
    if (searchParams.get('payment') === 'success') setStep('sucesso');
  }, [searchParams]);

  useEffect(() => {
    fetch(`${API}/events/${eventId}`)
      .then(r => r.json())
      .then(data => setEvent(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId]);

  const kitPrice = kitType === 'PREMIUM'
    ? (event?.kitPremiumPrice ?? 0)
    : (event?.kitCompletePrice ?? event?.price ?? 0);

  async function submitRegistration() {
    if (!shirtSize) { setError('Selecione o tamanho da camiseta.'); return; }
    if (!form.name || !form.email) { setError('Nome e email são obrigatórios.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('rr_access_token');
      const res = await fetch(`${API}/events/${eventId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          shirtSize,
          kitType,
          emergencyContact: form.emergencyContact,
          medicalInfo: form.medicalInfo,
          customerName: form.name,
          customerEmail: form.email,
          customerPhone: form.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erro ao realizar inscrição');
      setRegistration(data);
      setStep('sucesso');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAGE }}>
        <div className="text-center" style={{ color: GRAY }}>
          <div className="inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
          <p>Carregando evento...</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAGE }}>
        <p style={{ color: GRAY }}>Evento não encontrado.</p>
      </div>
    );
  }

  const spots = event.maxParticipants
    ? event.maxParticipants - (event._count?.registrations ?? 0)
    : null;

  return (
    <div className="min-h-screen" style={{ background: PAGE }}>

      {/* Hero */}
      <div className="relative" style={{ background: DARK, minHeight: 220 }}>
        {event.coverImageUrl ? (
          <img src={event.coverImageUrl} alt={event.title}
            className="w-full h-56 object-cover opacity-60" />
        ) : (
          <div className="w-full h-56 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}>
            <div style={{ isolation: 'isolate', background: RED }}>
              <Image src="/logo.png" alt="RR Rafinha Running" width={140} height={100}
                style={{ display: 'block', filter: 'saturate(0) brightness(0.6) contrast(100)', mixBlendMode: 'screen' }} />
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-5"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)' }}>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300 mb-1">
            {event.modality ?? 'Corrida de Rua'}
          </p>
          <h1 className="text-2xl font-black text-white leading-tight">{event.title}</h1>
          <p className="text-sm text-gray-300 mt-1">
            📅 {fmtDate(event.eventDate)}
            {event.city && <span> · 📍 {event.city}{event.state ? `/${event.state}` : ''}</span>}
          </p>
        </div>
      </div>

      {/* Progress steps */}
      {step !== 'sucesso' && (
        <div className="flex items-center justify-center gap-1 py-4 px-4"
          style={{ background: WHITE, borderBottom: `1px solid ${LIGHT}` }}>
          {(['info', 'kit', 'dados'] as Step[]).map((s, i) => {
            const labels = ['Evento', 'Kit', 'Dados'];
            const done = ['info', 'kit', 'dados'].indexOf(step) > i;
            const active = step === s;
            return (
              <div key={s} className="flex items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                    style={{ background: done || active ? RED : LIGHT, color: done || active ? WHITE : GRAY }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className="text-xs font-semibold" style={{ color: active ? RED : done ? DARK : GRAY }}>
                    {labels[i]}
                  </span>
                </div>
                {i < 2 && <div className="w-8 h-px mx-1" style={{ background: done ? RED : LIGHT }} />}
              </div>
            );
          })}
        </div>
      )}

      <div className="px-4 py-6 max-w-lg mx-auto">

        {/* STEP: INFO */}
        {step === 'info' && (
          <>
            {event.description && (
              <div className="rounded-2xl border p-5 mb-4" style={{ background: WHITE, borderColor: LIGHT }}>
                <p className="text-sm leading-relaxed" style={{ color: DARK }}>{event.description}</p>
              </div>
            )}

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { icon: '📅', label: 'Data', value: fmtDate(event.eventDate) },
                { icon: '📍', label: 'Local', value: event.location ?? event.city ?? '–' },
                { icon: '🏃', label: 'Modalidade', value: event.modality ?? 'Corrida' },
                { icon: '👥', label: 'Vagas', value: spots != null ? `${spots} restantes` : 'Ilimitado' },
              ].map(c => (
                <div key={c.label} className="rounded-2xl border p-4" style={{ background: WHITE, borderColor: LIGHT }}>
                  <p className="text-xl mb-1">{c.icon}</p>
                  <p className="text-[10px] uppercase font-bold tracking-widest mb-0.5" style={{ color: GRAY }}>{c.label}</p>
                  <p className="text-sm font-bold leading-tight" style={{ color: DARK }}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* Kit pickup info */}
            {(event.kitPickupLocation || event.kitPickupDate) && (
              <div className="rounded-2xl border p-4 mb-4" style={{ background: '#FFF7ED', borderColor: '#FED7AA' }}>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#C2410C' }}>
                  📦 Retirada do Kit
                </p>
                {event.kitPickupLocation && (
                  <p className="text-sm" style={{ color: DARK }}>
                    <span className="font-semibold">Local:</span> {event.kitPickupLocation}
                  </p>
                )}
                {event.kitPickupDate && (
                  <p className="text-sm mt-1" style={{ color: DARK }}>
                    <span className="font-semibold">Data:</span> {fmtDateTime(event.kitPickupDate)}
                  </p>
                )}
              </div>
            )}

            <button onClick={() => setStep('kit')}
              className="w-full py-4 rounded-2xl text-white font-black uppercase tracking-widest text-sm shadow-md"
              style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}>
              Inscrever-se →
            </button>
            {spots != null && spots <= 20 && (
              <p className="text-center text-xs mt-2 font-bold" style={{ color: RED }}>
                ⚠️ Apenas {spots} vagas disponíveis!
              </p>
            )}
          </>
        )}

        {/* STEP: KIT */}
        {step === 'kit' && (
          <>
            <h2 className="text-lg font-black mb-4" style={{ color: DARK }}>Escolha seu Kit</h2>

            {/* Kit Completo */}
            <div
              onClick={() => setKitType('COMPLETO')}
              className="rounded-2xl border-2 p-5 mb-4 cursor-pointer transition"
              style={{
                borderColor: kitType === 'COMPLETO' ? RED : LIGHT,
                background: kitType === 'COMPLETO' ? '#FEF2F2' : WHITE,
              }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-black text-base" style={{ color: DARK }}>Kit Completo</p>
                  <p className="text-xs mt-0.5" style={{ color: GRAY }}>O essencial para correr com estilo</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-lg" style={{ color: RED }}>
                    {event.kitCompletePrice ? fmtPrice(event.kitCompletePrice) : fmtPrice(event.price)}
                  </p>
                  <div className="w-5 h-5 rounded-full border-2 ml-auto mt-1 flex items-center justify-center"
                    style={{ borderColor: kitType === 'COMPLETO' ? RED : LIGHT }}>
                    {kitType === 'COMPLETO' && <div className="w-2.5 h-2.5 rounded-full" style={{ background: RED }} />}
                  </div>
                </div>
              </div>
              {/* Kit visual mockup */}
              <div className="rounded-xl p-3 mb-3 flex gap-3 items-center" style={{ background: '#F4F4F5' }}>
                <div className="text-3xl">👕</div>
                <div className="text-3xl">🎽</div>
                <div className="text-3xl">🏅</div>
                <div className="text-3xl">🔢</div>
                <div className="text-3xl">⚡</div>
              </div>
              <ul className="space-y-1.5">
                {KIT_ITEMS.COMPLETO.map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm" style={{ color: DARK }}>
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke={GREEN} strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Kit Premium */}
            <div
              onClick={() => setKitType('PREMIUM')}
              className="rounded-2xl border-2 p-5 mb-4 cursor-pointer relative transition"
              style={{
                borderColor: kitType === 'PREMIUM' ? RED : LIGHT,
                background: kitType === 'PREMIUM' ? '#FEF2F2' : WHITE,
              }}>
              <div className="absolute -top-3 left-5">
                <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full"
                  style={{ background: RED, color: WHITE }}>Mais popular</span>
              </div>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-black text-base" style={{ color: DARK }}>Kit Premium</p>
                  <p className="text-xs mt-0.5" style={{ color: GRAY }}>Experiência completa de corrida</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-lg" style={{ color: RED }}>
                    {event.kitPremiumPrice ? fmtPrice(event.kitPremiumPrice) : fmtPrice((event.kitCompletePrice ?? event.price) + 3000)}
                  </p>
                  <div className="w-5 h-5 rounded-full border-2 ml-auto mt-1 flex items-center justify-center"
                    style={{ borderColor: kitType === 'PREMIUM' ? RED : LIGHT }}>
                    {kitType === 'PREMIUM' && <div className="w-2.5 h-2.5 rounded-full" style={{ background: RED }} />}
                  </div>
                </div>
              </div>
              <div className="rounded-xl p-3 mb-3 flex gap-2 items-center flex-wrap" style={{ background: '#F4F4F5' }}>
                <div className="text-3xl">👕</div>
                <div className="text-3xl">👜</div>
                <div className="text-3xl">🧢</div>
                <div className="text-3xl">🏅</div>
                <div className="text-3xl">🔢</div>
                <div className="text-3xl">⚡</div>
                <div className="text-3xl">🏃</div>
              </div>
              <ul className="space-y-1.5">
                {KIT_ITEMS.PREMIUM.map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm" style={{ color: DARK }}>
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke={GREEN} strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Shirt size */}
            <div className="rounded-2xl border p-4 mb-5" style={{ background: WHITE, borderColor: LIGHT }}>
              <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: GRAY }}>
                Tamanho da camiseta
              </p>
              <div className="flex flex-wrap gap-2">
                {SHIRT_SIZES.map(s => (
                  <button key={s} onClick={() => setShirtSize(s)}
                    className="px-4 py-2 rounded-xl border font-black text-sm transition"
                    style={{
                      borderColor: shirtSize === s ? RED : LIGHT,
                      background: shirtSize === s ? '#FEF2F2' : WHITE,
                      color: shirtSize === s ? RED : DARK,
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('info')}
                className="px-5 py-3 rounded-2xl border font-black text-sm"
                style={{ borderColor: LIGHT, color: GRAY }}>
                ← Voltar
              </button>
              <button
                onClick={() => { if (!kitType) { setError('Escolha um kit.'); return; } setError(''); setStep('dados'); }}
                disabled={!kitType}
                className="flex-1 py-3 rounded-2xl text-white font-black uppercase tracking-widest text-sm transition"
                style={{ background: kitType ? `linear-gradient(135deg, ${RED}, #8B0000)` : LIGHT, color: kitType ? WHITE : GRAY }}>
                Continuar →
              </button>
            </div>
            {error && <p className="text-center text-sm mt-2 font-semibold" style={{ color: RED }}>{error}</p>}
          </>
        )}

        {/* STEP: DADOS */}
        {step === 'dados' && (
          <>
            <h2 className="text-lg font-black mb-1" style={{ color: DARK }}>Seus dados</h2>
            <p className="text-sm mb-4" style={{ color: GRAY }}>
              Kit {kitType === 'PREMIUM' ? 'Premium' : 'Completo'} · {fmtPrice(kitPrice)} · Camiseta {shirtSize}
            </p>

            {error && (
              <div className="rounded-xl p-3 mb-4 text-sm font-semibold" style={{ background: '#FEF2F2', color: RED }}>
                {error}
              </div>
            )}

            <div className="space-y-3 mb-5">
              <input className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ borderColor: LIGHT, color: DARK }}
                placeholder="Nome completo *"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <input className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ borderColor: LIGHT, color: DARK }}
                placeholder="Email *"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <input className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ borderColor: LIGHT, color: DARK }}
                placeholder="WhatsApp (ex: 11 9 9999-9999)"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <input className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ borderColor: LIGHT, color: DARK }}
                placeholder="Contato de emergência (nome e telefone)"
                value={form.emergencyContact}
                onChange={e => setForm(f => ({ ...f, emergencyContact: e.target.value }))} />
              <textarea className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                style={{ borderColor: LIGHT, color: DARK }}
                placeholder="Condições médicas relevantes (opcional)"
                rows={2}
                value={form.medicalInfo}
                onChange={e => setForm(f => ({ ...f, medicalInfo: e.target.value }))} />
            </div>

            <div className="rounded-2xl p-4 mb-5" style={{ background: '#F0FDF4', border: `1px solid #BBF7D0` }}>
              <p className="text-sm font-black mb-1" style={{ color: '#166534' }}>Após a inscrição você receberá:</p>
              <ul className="text-xs space-y-1" style={{ color: '#15803D' }}>
                <li>✅ Número de peito gerado automaticamente</li>
                <li>✅ Agendamento para retirada do kit{event.kitPickupLocation ? ` em ${event.kitPickupLocation}` : ''}</li>
                <li>✅ Confirmação por email e WhatsApp</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('kit')}
                className="px-5 py-3 rounded-2xl border font-black text-sm"
                style={{ borderColor: LIGHT, color: GRAY }}>
                ← Voltar
              </button>
              <button onClick={submitRegistration} disabled={submitting}
                className="flex-1 py-3.5 rounded-2xl text-white font-black uppercase tracking-widest text-sm transition"
                style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)`, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Processando...' : 'Confirmar Inscrição →'}
              </button>
            </div>
          </>
        )}

        {/* STEP: SUCESSO */}
        {step === 'sucesso' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-black mb-2" style={{ color: DARK }}>Inscrição confirmada!</h2>
            <p className="text-sm mb-6" style={{ color: GRAY }}>
              Você está inscrito no <strong>{event.title}</strong>
            </p>

            {registration?.bibNumber && (
              <div className="rounded-2xl border-2 p-6 mb-5 mx-auto max-w-xs"
                style={{ borderColor: RED, background: '#FEF2F2' }}>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: GRAY }}>
                  Seu número de peito
                </p>
                <p className="text-5xl font-black" style={{ color: RED }}>{registration.bibNumber}</p>
              </div>
            )}

            {(registration?.kitPickupScheduledAt ?? event.kitPickupDate) && (
              <div className="rounded-2xl border p-4 mb-5" style={{ background: WHITE, borderColor: LIGHT }}>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: GRAY }}>
                  📦 Retirada do Kit
                </p>
                {event.kitPickupLocation && (
                  <p className="text-sm font-semibold" style={{ color: DARK }}>{event.kitPickupLocation}</p>
                )}
                {(registration?.kitPickupScheduledAt ?? event.kitPickupDate) && (
                  <p className="text-sm mt-1" style={{ color: DARK }}>
                    {fmtDateTime(registration?.kitPickupScheduledAt ?? event.kitPickupDate!)}
                  </p>
                )}
                <p className="text-xs mt-2" style={{ color: GRAY }}>
                  Leve um documento com foto e este número de confirmação.
                </p>
              </div>
            )}

            <div className="rounded-2xl border p-4 mb-5" style={{ background: WHITE, borderColor: LIGHT }}>
              <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: GRAY }}>
                Próximos passos
              </p>
              <ul className="text-sm space-y-2 text-left" style={{ color: DARK }}>
                <li>📧 Verifique seu email — enviamos todos os detalhes</li>
                <li>📱 Você receberá atualizações pelo WhatsApp</li>
                <li>📦 O local de retirada do kit será confirmado no app</li>
                <li>🏁 Prepare-se para a prova!</li>
              </ul>
            </div>

            <a href={`/onboarding/rafinha`}
              className="block w-full py-3 rounded-2xl text-white font-black uppercase tracking-widest text-sm"
              style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}>
              Conhecer a assessoria →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
