'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

const AddressPicker = dynamic(() => import('@/components/maps/AddressPicker'), { ssr: false });

interface Event {
  id: string;
  title: string;
  description?: string;
  eventDate: string;
  eventEndDate?: string;
  location?: string;
  city?: string;
  state?: string;
  modality?: string;
  maxParticipants?: number;
  price: number;
  currency: string;
  status: string;
  tags: string[];
  coverImageUrl?: string;
  latitude?: number;
  longitude?: number;
  meetingPoint?: string;
  registrationCount?: number;
  _count?: { registrations: number };
}

interface Attendee {
  id: string;
  status: string;
  checkinAt?: string;
  bibNumber?: string;
  user: { id: string; name: string; email: string; avatarUrl?: string; phone?: string };
}

interface AttendeesData {
  registrations: Attendee[];
  counts: { total: number; checkedIn: number; registered: number; absent: number };
}

interface EventForm {
  title: string;
  description: string;
  eventDate: string;
  location: string;
  city: string;
  modality: string;
  maxParticipants: string;
  price: string;
  meetingPoint: string;
  latitude?: number;
  longitude?: number;
}

const EMPTY_FORM: EventForm = {
  title: '', description: '', eventDate: '', location: '',
  city: '', modality: '', maxParticipants: '', price: '0',
  meetingPoint: '', latitude: undefined, longitude: undefined,
};

const MODALITIES = ['5K', '10K', '21K', '42K', 'Trail', 'Ultra', 'Ciclismo', 'Triátlon', 'CrossFit', 'Outro'];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho', PUBLISHED: 'Publicado', SOLD_OUT: 'Esgotado',
  COMPLETED: 'Encerrado', CANCELED: 'Cancelado',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-500',
  PUBLISHED: 'bg-emerald-50 text-emerald-700',
  SOLD_OUT: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-blue-50 text-blue-700',
  CANCELED: 'bg-red-50 text-red-500',
};

const ATTENDEE_STATUS_LABELS: Record<string, string> = {
  CHECKED_IN: 'Presente',
  CONFIRMED: 'Inscrito',
  PENDING: 'Inscrito',
  ABSENT: 'Ausente',
  WAITLIST: 'Lista de Espera',
};

const ATTENDEE_STATUS_ICONS: Record<string, string> = {
  CHECKED_IN: '✅',
  CONFIRMED: '⏳',
  PENDING: '⏳',
  ABSENT: '❌',
  WAITLIST: '🕐',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPrice(cents: number, currency: string) {
  if (cents === 0) return 'Gratuito';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

export default function EventsPage() {
  const { user } = useAuthStore();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [attendeesModal, setAttendeesModal] = useState<{ eventId: string; title: string } | null>(null);
  const [attendeesData, setAttendeesData] = useState<AttendeesData | null>(null);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [updatingReg, setUpdatingReg] = useState<string | null>(null);

  const isCoach = user?.role === 'COACH' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    api.get('/events')
      .then((r) => setEvents(r.data?.data || r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.eventDate) >= now && e.status !== 'CANCELED');
  const past = events.filter((e) => new Date(e.eventDate) < now || e.status === 'COMPLETED' || e.status === 'CANCELED');

  const handleSave = async () => {
    if (!form.title || !form.eventDate) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        eventDate: new Date(form.eventDate).toISOString(),
        location: form.location || undefined,
        city: form.city || undefined,
        modality: form.modality || undefined,
        maxParticipants: form.maxParticipants ? Number(form.maxParticipants) : undefined,
        price: form.price ? Math.round(Number(form.price) * 100) : 0,
        latitude: form.latitude,
        longitude: form.longitude,
        meetingPoint: form.meetingPoint || undefined,
      };
      const { data } = await api.post('/events', payload);
      setEvents((prev) => [data, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch {
      alert('Erro ao criar evento. Verifique os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const openAttendees = async (eventId: string, title: string) => {
    setAttendeesModal({ eventId, title });
    setAttendeesLoading(true);
    setAttendeesData(null);
    try {
      const { data } = await api.get(`/events/${eventId}/attendees`);
      setAttendeesData(data);
    } catch {
      alert('Erro ao carregar lista de presença');
      setAttendeesModal(null);
    } finally {
      setAttendeesLoading(false);
    }
  };

  const updateAttendeeStatus = async (regId: string, status: string) => {
    if (!attendeesModal) return;
    setUpdatingReg(regId);
    try {
      await api.put(`/events/${attendeesModal.eventId}/registrations/${regId}`, { status });
      // Refresh attendees list
      const { data } = await api.get(`/events/${attendeesModal.eventId}/attendees`);
      setAttendeesData(data);
    } catch {
      alert('Erro ao atualizar status');
    } finally {
      setUpdatingReg(null);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition';
  const labelClass = 'block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Eventos</h1>
          <p className="text-sm text-gray-400 mt-1">Corridas, competições e eventos dos seus atletas</p>
        </div>
        {isCoach && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Novo Evento
          </button>
        )}
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">Novo Evento</h3>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Título *</label>
                <input type="text" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Meia Maratona de SP" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Detalhes do evento..." className={inputClass + ' resize-none'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Data *</label>
                  <input type="datetime-local" value={form.eventDate} onChange={(e) => setForm(p => ({ ...p, eventDate: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Modalidade</label>
                  <select value={form.modality} onChange={(e) => setForm(p => ({ ...p, modality: e.target.value }))} className={inputClass}>
                    <option value="">Selecionar</option>
                    {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Local</label>
                  <AddressPicker
                    value={form.location}
                    onChange={(val) => setForm(p => ({ ...p, location: val }))}
                    onPlaceSelected={(place) => setForm(p => ({
                      ...p,
                      location: place.address,
                      city: place.city || p.city,
                      latitude: place.lat,
                      longitude: place.lng,
                    }))}
                    placeholder="Parque Ibirapuera"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Cidade</label>
                  <input type="text" value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} placeholder="São Paulo" className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Ponto de encontro</label>
                <input
                  type="text"
                  value={form.meetingPoint}
                  onChange={(e) => setForm(p => ({ ...p, meetingPoint: e.target.value }))}
                  placeholder="Ex: Portão 3 do Parque Ibirapuera"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Vagas (0 = ilimitado)</label>
                  <input type="number" min={0} value={form.maxParticipants} onChange={(e) => setForm(p => ({ ...p, maxParticipants: e.target.value }))} placeholder="0" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Valor (R$)</label>
                  <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0.00" className={inputClass} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition cursor-pointer">Cancelar</button>
              <button onClick={handleSave} disabled={saving || !form.title || !form.eventDate} className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer">
                {saving ? 'Criando...' : 'Criar Evento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendees Modal */}
      {attendeesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setAttendeesModal(null)}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-gray-900">Lista de Presença</h3>
                <p className="text-xs text-gray-400 mt-0.5">{attendeesModal.title}</p>
              </div>
              <button onClick={() => setAttendeesModal(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {attendeesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
              </div>
            ) : attendeesData ? (
              <>
                {/* Counts */}
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Total', value: attendeesData.counts.total, color: 'text-gray-900' },
                    { label: 'Presentes', value: attendeesData.counts.checkedIn, color: 'text-emerald-600' },
                    { label: 'Inscritos', value: attendeesData.counts.registered, color: 'text-amber-600' },
                    { label: 'Ausentes', value: attendeesData.counts.absent, color: 'text-red-500' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-gray-100 bg-white p-3 text-center">
                      <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-gray-400">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* List */}
                <div className="space-y-2">
                  {attendeesData.registrations.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Nenhum inscrito ainda</p>
                  ) : (
                    attendeesData.registrations.map((reg) => (
                      <div key={reg.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {reg.user.avatarUrl ? (
                            <img src={reg.user.avatarUrl} alt={reg.user.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-semibold text-primary">{reg.user.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{reg.user.name}</p>
                          <p className="text-xs text-gray-400 truncate">{reg.user.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm">{ATTENDEE_STATUS_ICONS[reg.status] ?? '❓'}</span>
                          <select
                            value={reg.status}
                            disabled={updatingReg === reg.id}
                            onChange={(e) => updateAttendeeStatus(reg.id, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 cursor-pointer disabled:opacity-50"
                          >
                            <option value="CONFIRMED">Inscrito</option>
                            <option value="CHECKED_IN">Presente</option>
                            <option value="ABSENT">Ausente</option>
                            <option value="WAITLIST">Lista de Espera</option>
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100/80 rounded-xl w-fit mb-6">
        {(['upcoming', 'past'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'upcoming' ? `Próximos (${upcoming.length})` : `Passados (${past.length})`}
          </button>
        ))}
      </div>

      {/* Events List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card p-5 animate-pulse h-24" />)}
        </div>
      ) : (tab === 'upcoming' ? upcoming : past).length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">Nenhum evento {tab === 'upcoming' ? 'próximo' : 'passado'}</p>
          {tab === 'upcoming' && isCoach && <p className="text-xs text-gray-400 mt-1">Crie um evento para seus atletas participarem</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {(tab === 'upcoming' ? upcoming : past).map((event) => {
            const regCount = event.registrationCount ?? event._count?.registrations ?? 0;
            return (
              <div key={event.id} className="glass-card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <Link href={`/dashboard/events/${event.id}`} className="flex items-start gap-4 flex-1 min-w-0">
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
                            {event.location && <span className="text-xs text-gray-400">{event.location}</span>}
                            <span className="text-xs text-gray-400">{formatDate(event.eventDate)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[event.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {STATUS_LABELS[event.status] ?? event.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <span className="text-xs text-gray-500">{formatPrice(event.price, event.currency)}</span>
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                          {regCount} {regCount === 1 ? 'inscrito' : 'inscritos'}
                          {event.maxParticipants ? ` / ${event.maxParticipants}` : ''}
                        </span>
                        {event.description && <p className="text-xs text-gray-400 truncate">{event.description}</p>}
                        {event.location && (
                          <a
                            href={`https://maps.google.com/maps?q=${encodeURIComponent([event.location, event.city].filter(Boolean).join(', '))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                            </svg>
                            Ver no Maps
                          </a>
                        )}
                      </div>
                    </div>
                  </Link>
                  {isCoach && (
                    <button
                      onClick={() => openAttendees(event.id, event.title)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Ver Presenças
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
