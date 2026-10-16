'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, friendlyError } from '@/lib/api';

interface Event {
  id: string;
  title: string;
  description?: string;
  eventDate: string;
  location?: string;
  city?: string;
  state?: string;
  modality?: string;
  maxParticipants?: number;
  price: number;
  currency: string;
  status: string;
  kitCompletePrice?: number | null;
  kitPremiumPrice?: number | null;
  coverImageUrl?: string;
  latitude?: number;
  longitude?: number;
  meetingPoint?: string;
  registrationCount?: number;
  _count?: { registrations: number };
}

interface MyRegistration {
  id: string;
  eventId: string;
  status: string;
  paymentStatus?: string;
  finalPrice?: number | null;
  bibNumber?: string;
  checkinAt?: string;
  kitDeliveredAt?: string | null;
  paymentExpiresAt?: string | null;
  distance?: { id: string; name: string; distanceKm?: number | null } | null;
  event: Event;
}

/** Inscrição paga e confirmada: reembolso é manual → atleta fala com a organização. */
function isPaidConfirmed(reg: MyRegistration) {
  const price = reg.finalPrice ?? reg.event?.price ?? 0;
  return reg.paymentStatus === 'SUCCEEDED' && price > 0;
}

/** Pode cancelar pela própria área: gratuita, pendente de pagamento ou lista de espera (sem check-in). */
function canSelfCancel(reg: MyRegistration) {
  if (['CANCELED', 'CHECKED_IN', 'ABSENT'].includes(reg.status)) return false;
  if (reg.kitDeliveredAt) return false;
  if (new Date(reg.event.eventDate).getTime() < Date.now()) return false;
  return !isPaidConfirmed(reg);
}

function QrModal({ reg, onClose }: { reg: MyRegistration; onClose: () => void }) {
  const [qr, setQr] = useState<{ qrDataUrl: string; bibNumber?: string | null } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/events/my-registrations/${reg.id}/qr`)
      .then((r) => setQr(r.data))
      .catch((e) => setError(friendlyError(e, 'Não foi possível carregar o QR Code.')));
  }, [reg.id]);
  // Fecha com Esc (e com clique no fundo)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4"
      role="dialog" aria-modal="true" aria-label="QR Code do kit"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">QR Code do kit</p>
        <h3 className="text-base font-bold text-gray-900 mb-4">{reg.event.title}</h3>
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
        ) : !qr ? (
          <div className="w-60 h-60 mx-auto rounded-2xl bg-gray-100 animate-pulse" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qrDataUrl} alt="QR Code da inscrição" className="w-60 h-60 mx-auto" />
            {(qr.bibNumber || reg.bibNumber) && (
              <p className="mt-3 text-sm text-gray-500">Número de peito <strong className="text-gray-900 text-lg">{qr.bibNumber || reg.bibNumber}</strong></p>
            )}
            <p className="mt-2 text-xs text-gray-400">Apresente este código na retirada do kit e no check-in.</p>
          </>
        )}
        <button onClick={onClose} className="mt-5 w-full py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600">Fechar</button>
      </div>
    </div>
  );
}

const REG_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Inscrito',
  PENDING: 'Pendente',
  WAITLIST: 'Lista de Espera',
  CHECKED_IN: 'Check-in Feito',
  ABSENT: 'Ausente',
  CANCELED: 'Cancelado',
};

const REG_STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  PENDING: 'bg-amber-50 text-amber-700',
  WAITLIST: 'bg-blue-50 text-blue-700',
  CHECKED_IN: 'bg-green-100 text-green-800',
  ABSENT: 'bg-red-50 text-red-500',
  CANCELED: 'bg-gray-100 text-gray-400',
};

const EVENT_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-500',
  PUBLISHED: 'bg-emerald-50 text-emerald-700',
  SOLD_OUT: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-blue-50 text-blue-700',
  CANCELED: 'bg-red-50 text-red-500',
};
const EVENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho', PUBLISHED: 'Publicado', SOLD_OUT: 'Esgotado',
  COMPLETED: 'Encerrado', CANCELED: 'Cancelado',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Menor preço possível da inscrição, pela mesma regra do servidor:
 * base = preço do percurso (se > 0) senão preço do evento; + kit (o mais barato disponível).
 */
function minRegistrationPrice(event: Event, distances: { price: number }[] | undefined) {
  const bases = distances && distances.length
    ? distances.map((d) => (d.price > 0 ? d.price : event.price))
    : [event.price];
  const kits = [event.kitCompletePrice, event.kitPremiumPrice].filter((k): k is number => k != null);
  const minKit = kits.length ? Math.min(...kits) : 0;
  const min = Math.min(...bases) + minKit;
  const varies = new Set(bases).size > 1 || kits.length > 1;
  return { min, varies };
}

function formatFromPrice(event: Event, distances: { price: number }[] | undefined) {
  const { min, varies } = minRegistrationPrice(event, distances);
  if (min === 0) return distances === undefined ? '…' : 'Gratuito';
  const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: event.currency || 'BRL' }).format(min / 100);
  return varies ? `a partir de ${value}` : value;
}

function isCheckinAvailable(eventDate: string) {
  const diff = Math.abs(new Date().getTime() - new Date(eventDate).getTime());
  return diff <= 60 * 60 * 1000; // ±1 hour
}

export default function AthleteEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [myRegs, setMyRegs] = useState<MyRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'mine'>('upcoming');
  const [qrReg, setQrReg] = useState<MyRegistration | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  // Erro do cancelamento mostrado ao lado da inscrição (a mensagem do topo pode ficar fora da tela)
  const [cancelError, setCancelError] = useState<{ regId: string; text: string } | null>(null);
  // Percursos por evento (o preço real pode estar no percurso, não no evento)
  const [distancesByEvent, setDistancesByEvent] = useState<Record<string, { price: number }[]>>({});
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // ?tab=mine (link da página do evento após a inscrição)
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('tab') === 'mine') setTab('mine');
    } catch {}
  }, []);

  const myRegMap = new Map(myRegs.map((r) => [r.eventId, r]));

  const loadData = async () => {
    try {
      const [eventsRes, regsRes] = await Promise.all([
        api.get('/events'),
        api.get('/events/my-registrations'),
      ]);
      const list: Event[] = eventsRes.data?.data || eventsRes.data || [];
      setEvents(list);
      setMyRegs(regsRes.data?.data || regsRes.data || []);
      // Não bloqueia a tela: os preços "a partir de" chegam logo depois
      Promise.all(
        list.slice(0, 30).map(async (ev) => {
          try {
            const r = await api.get(`/events/${ev.id}/distances`);
            const ds = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : [];
            return [ev.id, ds.map((d: any) => ({ price: Number(d?.price ?? 0) }))] as const;
          } catch {
            return [ev.id, []] as const;
          }
        }),
      ).then((entries) => setDistancesByEvent(Object.fromEntries(entries))).catch(() => {});
    } catch (e) {
      setMessage({ type: 'error', text: friendlyError(e, 'Não foi possível carregar os eventos.') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCancel = async (reg: MyRegistration) => {
    if (!canSelfCancel(reg)) return;
    if (!window.confirm(`Cancelar sua inscrição em "${reg.event.title}"?`)) return;
    setCanceling(reg.id);
    setMessage(null);
    setCancelError(null);
    try {
      await api.delete(`/events/${reg.eventId}/register`);
      setMessage({ type: 'ok', text: 'Inscrição cancelada.' });
      await loadData();
    } catch (e: any) {
      // Mostra a mensagem da API (ex.: 409 "inscrição paga — fale com a organização")
      const raw = e?.response?.data?.message;
      const apiMsg = Array.isArray(raw) ? raw.filter((m: unknown) => typeof m === 'string').join(' ') : typeof raw === 'string' ? raw : '';
      const text = apiMsg.trim() || friendlyError(e, 'Não foi possível cancelar a inscrição.');
      setCancelError({ regId: reg.id, text });
      setMessage({ type: 'error', text });
    } finally {
      setCanceling(null);
    }
  };

  const handleCheckin = async (eventId: string) => {
    setCheckinLoading(eventId);
    try {
      await api.post(`/events/${eventId}/checkin`, {});
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: friendlyError(err, 'Não foi possível fazer o check-in.') });
    } finally {
      setCheckinLoading(null);
    }
  };

  const now = new Date();
  const upcomingEvents = events.filter(
    (e) => new Date(e.eventDate) >= now && (e.status === 'PUBLISHED' || e.status === 'SOLD_OUT'),
  );
  const myEventsList = myRegs.filter((r) => r.status !== 'CANCELED');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Eventos</h1>
        <p className="text-sm text-gray-400 mt-1">Corridas e competições disponíveis</p>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}
      {qrReg && <QrModal reg={qrReg} onClose={() => setQrReg(null)} />}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100/80 rounded-xl w-fit max-w-full overflow-x-auto mb-6">
        {[
          { key: 'upcoming', label: `Disponíveis (${upcomingEvents.length})` },
          { key: 'mine', label: `Minhas Inscrições (${myEventsList.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition cursor-pointer ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 animate-pulse h-28" />)}
        </div>
      ) : tab === 'upcoming' ? (
        upcomingEvents.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
            <p className="text-sm font-medium text-gray-500">Nenhum evento disponível no momento</p>
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingEvents.map((event) => {
              const myReg = myRegMap.get(event.id);
              const canCheckin = myReg && myReg.status !== 'CHECKED_IN' && myReg.status !== 'ABSENT' && isCheckinAvailable(event.eventDate);
              const regCount = event.registrationCount ?? event._count?.registrations ?? 0;

              return (
                <div key={event.id} className="rounded-2xl border border-gray-100 bg-white p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0 text-primary">
                      <span className="text-lg font-bold leading-none">{new Date(event.eventDate).getDate()}</span>
                      <span className="text-xs uppercase">{new Date(event.eventDate).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">{event.title}</h3>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {event.modality && <span className="text-xs font-medium text-primary">{event.modality}</span>}
                            {event.city && <span className="text-xs text-gray-400">{event.city}</span>}
                            <span className="text-xs text-gray-400">{formatDate(event.eventDate)}</span>
                          </div>
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${EVENT_STATUS_COLORS[event.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {EVENT_STATUS_LABELS[event.status] ?? event.status}
                        </span>
                      </div>

                      {event.description && (
                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{event.description}</p>
                      )}

                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <span className="text-xs text-gray-500">{formatFromPrice(event, distancesByEvent[event.id])}</span>
                        <span className="text-xs text-gray-400">
                          {regCount} {regCount === 1 ? 'inscrito' : 'inscritos'}
                          {event.maxParticipants ? ` / ${event.maxParticipants}` : ''}
                        </span>
                        {event.location && (
                          <a
                            href={`https://maps.google.com/maps?q=${encodeURIComponent([event.location, event.city].filter(Boolean).join(', '))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                            </svg>
                            Ver local
                          </a>
                        )}
                      </div>

                      {/* Map embed if coordinates available */}
                      {event.latitude && event.longitude && (
                        <div className="mt-3 rounded-xl overflow-hidden border border-gray-100 h-32">
                          <iframe
                            title="Localização do evento"
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            loading="lazy"
                            src={`https://maps.google.com/maps?q=${event.latitude},${event.longitude}&z=15&output=embed`}
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-3 mt-4 flex-wrap">
                        {myReg ? (
                          <>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${REG_STATUS_COLORS[myReg.status] ?? 'bg-gray-100 text-gray-500'}`}>
                              {REG_STATUS_LABELS[myReg.status] ?? myReg.status}
                            </span>
                            {myReg.bibNumber && (
                              <span className="text-xs text-gray-400">Nº {myReg.bibNumber}</span>
                            )}
                            {canCheckin && (
                              <button
                                onClick={() => handleCheckin(event.id)}
                                disabled={checkinLoading === event.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                              >
                                {checkinLoading === event.id ? 'Aguarde...' : '✅ Fazer Check-in'}
                              </button>
                            )}
                          </>
                        ) : event.status === 'PUBLISHED' ? (
                          <Link
                            href={`/eventos/${event.id}`}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition"
                          >
                            Inscrever-se →
                          </Link>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">Vagas esgotadas</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        myEventsList.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
            <p className="text-sm font-medium text-gray-500">Você ainda não está inscrito em nenhum evento</p>
            <button onClick={() => setTab('upcoming')} className="mt-3 text-sm text-primary hover:underline cursor-pointer">Ver eventos disponíveis</button>
          </div>
        ) : (
          <div className="space-y-4">
            {myEventsList.map((reg) => {
              const event = reg.event;
              const canCheckin = reg.status !== 'CHECKED_IN' && reg.status !== 'ABSENT' && isCheckinAvailable(event.eventDate);
              return (
                <div key={reg.id} className="rounded-2xl border border-gray-100 bg-white p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0 text-primary">
                      <span className="text-lg font-bold leading-none">{new Date(event.eventDate).getDate()}</span>
                      <span className="text-xs uppercase">{new Date(event.eventDate).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-semibold text-gray-900">{event.title}</h3>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${REG_STATUS_COLORS[reg.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {REG_STATUS_LABELS[reg.status] ?? reg.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {event.modality && <span className="text-xs font-medium text-primary">{event.modality}</span>}
                        {event.city && <span className="text-xs text-gray-400">{event.city}</span>}
                        <span className="text-xs text-gray-400">{formatDate(event.eventDate)}</span>
                        {reg.bibNumber && <span className="text-xs font-mono text-gray-500">#{reg.bibNumber}</span>}
                      </div>

                      {event.meetingPoint && (
                        <p className="text-xs text-gray-500 mt-2">
                          <span className="font-medium">Ponto de encontro:</span> {event.meetingPoint}
                        </p>
                      )}

                      {event.latitude && event.longitude && (
                        <div className="mt-3 rounded-xl overflow-hidden border border-gray-100 h-32">
                          <iframe
                            title="Localização"
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            loading="lazy"
                            src={`https://maps.google.com/maps?q=${event.latitude},${event.longitude}&z=15&output=embed`}
                          />
                        </div>
                      )}

                      {canCheckin && (
                        <div className="mt-3">
                          <button
                            onClick={() => handleCheckin(event.id)}
                            disabled={checkinLoading === event.id}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
                          >
                            {checkinLoading === event.id ? 'Aguarde...' : '✅ Fazer Check-in'}
                          </button>
                          <p className="text-xs text-gray-400 mt-1">Check-in disponível ±1 hora do início</p>
                        </div>
                      )}

                      {reg.checkinAt && (
                        <p className="text-xs text-emerald-600 mt-2 font-medium">
                          Check-in feito: {new Date(reg.checkinAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-4 flex-wrap">
                        {(reg.status === 'CONFIRMED' || reg.status === 'CHECKED_IN') && (
                          <button onClick={() => setQrReg(reg)}
                            className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold cursor-pointer">
                            Ver QR do kit
                          </button>
                        )}
                        {reg.status === 'PENDING' && (
                          <Link href={`/eventos/${reg.eventId}`} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-semibold">
                            Concluir inscrição
                          </Link>
                        )}
                        {canSelfCancel(reg) ? (
                          <button onClick={() => handleCancel(reg)} disabled={canceling === reg.id}
                            className="px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold disabled:opacity-50 cursor-pointer">
                            {canceling === reg.id ? 'Cancelando...' : 'Cancelar inscrição'}
                          </button>
                        ) : isPaidConfirmed(reg) && reg.status !== 'CHECKED_IN' ? (
                          <p className="text-xs text-gray-400">
                            Inscrição paga: para cancelar ou pedir reembolso, fale com a organização do evento.
                          </p>
                        ) : null}
                      </div>
                      {cancelError?.regId === reg.id && (
                        <p role="alert" className="text-xs text-red-600 mt-2">{cancelError.text}</p>
                      )}
                      {reg.status === 'PENDING' && reg.paymentExpiresAt && (
                        <p className="text-xs text-amber-600 mt-2">
                          Pagamento pendente — vaga reservada até {new Date(reg.paymentExpiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
