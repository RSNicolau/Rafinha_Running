'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

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
  bibNumber?: string;
  checkinAt?: string;
  event: Event;
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

function formatPrice(cents: number, currency: string) {
  if (cents === 0) return 'Gratuito';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

function isCheckinAvailable(eventDate: string) {
  const diff = Math.abs(new Date().getTime() - new Date(eventDate).getTime());
  return diff <= 60 * 60 * 1000; // ±1 hour
}

export default function AthleteEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [myRegs, setMyRegs] = useState<MyRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);
  const [checkinLoading, setCheckinLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'mine'>('upcoming');

  const myRegMap = new Map(myRegs.map((r) => [r.eventId, r]));

  const loadData = async () => {
    try {
      const [eventsRes, regsRes] = await Promise.all([
        api.get('/events'),
        api.get('/events/my-registrations'),
      ]);
      setEvents(eventsRes.data?.data || eventsRes.data || []);
      setMyRegs(regsRes.data?.data || regsRes.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleRegister = async (eventId: string) => {
    setRegistering(eventId);
    try {
      await api.post(`/events/${eventId}/register`, {});
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao inscrever-se');
    } finally {
      setRegistering(null);
    }
  };

  const handleCheckin = async (eventId: string) => {
    setCheckinLoading(eventId);
    try {
      await api.post(`/events/${eventId}/checkin`, {});
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao fazer check-in');
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

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100/80 rounded-xl w-fit mb-6">
        {[
          { key: 'upcoming', label: `Disponíveis (${upcomingEvents.length})` },
          { key: 'mine', label: `Minhas Inscrições (${myEventsList.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
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
                        <span className="text-xs text-gray-500">{formatPrice(event.price, event.currency)}</span>
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
                          <button
                            onClick={() => handleRegister(event.id)}
                            disabled={registering === event.id}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
                          >
                            {registering === event.id ? 'Inscrevendo...' : 'Inscrever-se'}
                          </button>
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
