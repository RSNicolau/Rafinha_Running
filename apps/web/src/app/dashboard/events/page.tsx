'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

const AddressPicker = dynamic(() => import('@/components/maps/AddressPicker'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

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

// Step 1 form
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
  status: string;
  latitude?: number;
  longitude?: number;
  coverImage?: File | null;
}

// Distance (step 2)
interface DistanceForm {
  name: string;
  distanceKm: string;
  price: string;
  maxParticipants: string;
  ageGroup: string;
  description: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_EVENT_FORM: EventForm = {
  title: '', description: '', eventDate: '', location: '',
  city: '', modality: '', maxParticipants: '', price: '0',
  meetingPoint: '', status: 'DRAFT', latitude: undefined, longitude: undefined,
  coverImage: null,
};

const EMPTY_DISTANCE_FORM: DistanceForm = {
  name: '', distanceKm: '', price: '', maxParticipants: '', ageGroup: '', description: '',
};

const MODALITIES = ['5K', '10K', '21K', '42K', 'Trail', 'Ultra', 'Ciclismo', 'Triátlon', 'CrossFit', 'Outro'];

const AGE_GROUP_OPTIONS = [
  '', '5-6 anos', '7-8 anos', '9-11 anos', '12-15 anos',
  'Adulto geral', 'Sub-20', 'Master 40+', 'Master 50+',
];

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

const ATTENDEE_STATUS_ICONS: Record<string, string> = {
  CHECKED_IN: '✅', CONFIRMED: '⏳', PENDING: '⏳', ABSENT: '❌', WAITLIST: '🕐',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPrice(cents: number, currency: string) {
  if (cents === 0) return 'Gratuito';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const { user } = useAuthStore();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  // Create event modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [eventForm, setEventForm] = useState<EventForm>(EMPTY_EVENT_FORM);
  const [distances, setDistances] = useState<DistanceForm[]>([]);
  const [showDistanceModal, setShowDistanceModal] = useState(false);
  const [editingDistanceIdx, setEditingDistanceIdx] = useState<number | null>(null);
  const [distanceForm, setDistanceForm] = useState<DistanceForm>(EMPTY_DISTANCE_FORM);
  const [saving, setSaving] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Attendees modal
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

  // ── Cover image ─────────────────────────────────────────────────────────────
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEventForm((p) => ({ ...p, coverImage: file }));
    const reader = new FileReader();
    reader.onload = (ev) => setCoverPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Distance modal ──────────────────────────────────────────────────────────
  const openAddDistance = () => {
    setEditingDistanceIdx(null);
    setDistanceForm(EMPTY_DISTANCE_FORM);
    setShowDistanceModal(true);
  };

  const openEditDistance = (idx: number) => {
    setEditingDistanceIdx(idx);
    setDistanceForm(distances[idx]);
    setShowDistanceModal(true);
  };

  const handleSaveDistance = () => {
    if (!distanceForm.name.trim()) return;
    if (editingDistanceIdx !== null) {
      setDistances((prev) => prev.map((d, i) => i === editingDistanceIdx ? distanceForm : d));
    } else {
      setDistances((prev) => [...prev, distanceForm]);
    }
    setShowDistanceModal(false);
  };

  const removeDistance = (idx: number) => {
    setDistances((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Create event (2-step) ───────────────────────────────────────────────────
  const resetCreate = () => {
    setShowCreate(false);
    setCreateStep(1);
    setEventForm(EMPTY_EVENT_FORM);
    setDistances([]);
    setCoverPreview(null);
    setSaving(false);
  };

  const canProceedStep1 = eventForm.title.trim() && eventForm.eventDate;

  const handleCreateEvent = async () => {
    if (!canProceedStep1) return;
    if (createStep === 1) {
      setCreateStep(2);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: eventForm.title.trim(),
        description: eventForm.description || undefined,
        eventDate: new Date(eventForm.eventDate).toISOString(),
        location: eventForm.location || undefined,
        city: eventForm.city || undefined,
        modality: eventForm.modality || undefined,
        maxParticipants: eventForm.maxParticipants ? Number(eventForm.maxParticipants) : undefined,
        price: eventForm.price ? Math.round(Number(eventForm.price) * 100) : 0,
        latitude: eventForm.latitude,
        longitude: eventForm.longitude,
        meetingPoint: eventForm.meetingPoint || undefined,
        status: eventForm.status,
      };

      const { data: createdEvent } = await api.post('/events', payload);
      const eventId: string = createdEvent.id;

      // Upload cover if selected
      if (eventForm.coverImage) {
        const fd = new FormData();
        fd.append('file', eventForm.coverImage);
        await api.post(`/events/${eventId}/cover-image`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      // Create distances
      for (let i = 0; i < distances.length; i++) {
        const d = distances[i];
        await api.post(`/events/${eventId}/distances`, {
          name: d.name.trim(),
          distanceKm: d.distanceKm ? Number(d.distanceKm) : undefined,
          price: d.price ? Math.round(Number(d.price) * 100) : 0,
          maxParticipants: d.maxParticipants ? Number(d.maxParticipants) : undefined,
          ageGroup: d.ageGroup || undefined,
          description: d.description || undefined,
          sortOrder: i,
        });
      }

      // Refresh event list
      const fresh = await api.get('/events');
      setEvents(fresh.data?.data || fresh.data || []);
      resetCreate();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao criar evento. Verifique os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // ── Attendees ───────────────────────────────────────────────────────────────
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

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Eventos</h1>
          <p className="text-sm text-gray-400 mt-1">Corridas, competições e eventos dos seus atletas</p>
        </div>
        {isCoach && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Novo Evento
          </button>
        )}
      </div>

      {/* ── Create Event Modal (2 steps) ─────────────────────────────────────── */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={resetCreate}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {createStep === 1 ? 'Novo Evento' : 'Percursos e Distâncias'}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Etapa {createStep} de 2 — {createStep === 1 ? 'Dados gerais' : 'Defina os percursos disponíveis'}
                  </p>
                </div>
                <button
                  onClick={resetCreate}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Step indicator */}
              <div className="flex gap-1.5 mt-3">
                {[1, 2].map((s) => (
                  <div
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-all ${s <= createStep ? 'bg-primary' : 'bg-gray-200'}`}
                  />
                ))}
              </div>
            </div>

            <div className="p-6">
              {/* ── STEP 1 ──────────────────────────────────────────────────── */}
              {createStep === 1 && (
                <div className="space-y-4">
                  {/* Banner upload */}
                  <div>
                    <label className={labelClass}>Banner / Capa</label>
                    <div
                      className="w-full h-32 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 hover:bg-gray-50 transition overflow-hidden relative"
                      onClick={() => coverInputRef.current?.click()}
                    >
                      {coverPreview ? (
                        <>
                          <img src={coverPreview} alt="preview" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                            <span className="text-white text-xs font-medium">Trocar imagem</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                          <p className="text-xs text-gray-400">Clique para adicionar banner</p>
                          <p className="text-xs text-gray-300 mt-0.5">JPG, PNG ou WEBP • Máx 10MB</p>
                        </>
                      )}
                    </div>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverChange}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Título *</label>
                    <input
                      type="text"
                      value={eventForm.title}
                      onChange={(e) => setEventForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Ex: Corrida São Garrafa 2025"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Descrição</label>
                    <textarea
                      value={eventForm.description}
                      onChange={(e) => setEventForm((p) => ({ ...p, description: e.target.value }))}
                      rows={2}
                      placeholder="Detalhes do evento..."
                      className={inputClass + ' resize-none'}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Data e Horário *</label>
                      <input
                        type="datetime-local"
                        value={eventForm.eventDate}
                        onChange={(e) => setEventForm((p) => ({ ...p, eventDate: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Modalidade</label>
                      <select
                        value={eventForm.modality}
                        onChange={(e) => setEventForm((p) => ({ ...p, modality: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="">Selecionar</option>
                        {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Local</label>
                      <AddressPicker
                        value={eventForm.location}
                        onChange={(val) => setEventForm((p) => ({ ...p, location: val }))}
                        onPlaceSelected={(place) => setEventForm((p) => ({
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
                      <input
                        type="text"
                        value={eventForm.city}
                        onChange={(e) => setEventForm((p) => ({ ...p, city: e.target.value }))}
                        placeholder="São Paulo"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Preço Base (R$)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={eventForm.price}
                        onChange={(e) => setEventForm((p) => ({ ...p, price: e.target.value }))}
                        placeholder="0 = gratuito"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Status</label>
                      <select
                        value={eventForm.status}
                        onChange={(e) => setEventForm((p) => ({ ...p, status: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="DRAFT">Rascunho</option>
                        <option value="PUBLISHED">Publicado</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 2 ──────────────────────────────────────────────────── */}
              {createStep === 2 && (
                <div>
                  <p className="text-xs text-gray-500 mb-4">
                    Adicione os percursos disponíveis neste evento. Cada percurso pode ter preço, vagas e faixa etária próprios.
                  </p>

                  {/* Distance list */}
                  {distances.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {distances.map((d, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-gray-800">{d.name}</p>
                              {d.distanceKm && (
                                <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                                  {d.distanceKm}km
                                </span>
                              )}
                              {d.ageGroup && (
                                <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">
                                  {d.ageGroup}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                              {d.price ? (
                                <span>R$ {Number(d.price).toFixed(2)}</span>
                              ) : (
                                <span className="text-gray-400">Preço do evento</span>
                              )}
                              {d.maxParticipants && <span>{d.maxParticipants} vagas</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEditDistance(idx)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => removeDistance(idx)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {distances.length === 0 && (
                    <div className="py-8 text-center rounded-xl border border-dashed border-gray-200 mb-4">
                      <p className="text-sm text-gray-400">Nenhum percurso adicionado</p>
                      <p className="text-xs text-gray-300 mt-1">Adicione pelo menos um percurso ou defina preço base no evento</p>
                    </div>
                  )}

                  <button
                    onClick={openAddDistance}
                    className="w-full py-2.5 rounded-xl border-2 border-dashed border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 transition flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Adicionar Percurso
                  </button>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl">
              <div className="flex gap-3">
                {createStep === 1 ? (
                  <button
                    onClick={resetCreate}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                ) : (
                  <button
                    onClick={() => setCreateStep(1)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition cursor-pointer"
                  >
                    ← Voltar
                  </button>
                )}

                {createStep === 1 ? (
                  <button
                    onClick={() => setCreateStep(2)}
                    disabled={!canProceedStep1}
                    className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
                  >
                    Próximo: Percursos →
                  </button>
                ) : (
                  <button
                    onClick={handleCreateEvent}
                    disabled={saving || (distances.length === 0 && Number(eventForm.price) === 0)}
                    className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? 'Criando evento...' : 'Criar Evento'}
                  </button>
                )}
              </div>
              {createStep === 2 && distances.length === 0 && Number(eventForm.price) === 0 && (
                <p className="text-xs text-amber-600 text-center mt-2">
                  Adicione pelo menos um percurso ou defina um preço base para o evento
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Distance sub-modal ────────────────────────────────────────────────── */}
      {showDistanceModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowDistanceModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">
                {editingDistanceIdx !== null ? 'Editar Percurso' : 'Novo Percurso'}
              </h3>
              <button
                onClick={() => setShowDistanceModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nome *</label>
                <input
                  type="text"
                  value={distanceForm.name}
                  onChange={(e) => setDistanceForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: 5K, 10K, Corrida Kids"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Distância (km)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={distanceForm.distanceKm}
                    onChange={(e) => setDistanceForm((p) => ({ ...p, distanceKm: e.target.value }))}
                    placeholder="Ex: 5"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Valor (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={distanceForm.price}
                    onChange={(e) => setDistanceForm((p) => ({ ...p, price: e.target.value }))}
                    placeholder="0 = preço do evento"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Faixa Etária</label>
                <div className="flex gap-2">
                  <select
                    value={AGE_GROUP_OPTIONS.includes(distanceForm.ageGroup) ? distanceForm.ageGroup : '__custom__'}
                    onChange={(e) => {
                      if (e.target.value !== '__custom__') {
                        setDistanceForm((p) => ({ ...p, ageGroup: e.target.value }));
                      }
                    }}
                    className={inputClass + ' flex-1'}
                  >
                    <option value="">Sem faixa definida</option>
                    {AGE_GROUP_OPTIONS.filter(Boolean).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {distanceForm.ageGroup && !AGE_GROUP_OPTIONS.includes(distanceForm.ageGroup) && (
                      <option value="__custom__">{distanceForm.ageGroup}</option>
                    )}
                  </select>
                  <input
                    type="text"
                    value={distanceForm.ageGroup}
                    onChange={(e) => setDistanceForm((p) => ({ ...p, ageGroup: e.target.value }))}
                    placeholder="Personalizar..."
                    className={inputClass + ' w-32 shrink-0'}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Vagas máximas</label>
                <input
                  type="number"
                  min={0}
                  value={distanceForm.maxParticipants}
                  onChange={(e) => setDistanceForm((p) => ({ ...p, maxParticipants: e.target.value }))}
                  placeholder="0 = sem limite"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Descrição (opcional)</label>
                <input
                  type="text"
                  value={distanceForm.description}
                  onChange={(e) => setDistanceForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Ex: Para iniciantes e crianças"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDistanceModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveDistance}
                disabled={!distanceForm.name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                {editingDistanceIdx !== null ? 'Salvar Alterações' : 'Adicionar Percurso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Attendees Modal ──────────────────────────────────────────────────── */}
      {attendeesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setAttendeesModal(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-gray-900">Lista de Presença</h3>
                <p className="text-xs text-gray-400 mt-0.5">{attendeesModal.title}</p>
              </div>
              <button
                onClick={() => setAttendeesModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {attendeesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
              </div>
            ) : attendeesData ? (
              <>
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

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-gray-100/80 rounded-xl w-fit mb-6">
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'upcoming' ? `Próximos (${upcoming.length})` : `Passados (${past.length})`}
          </button>
        ))}
      </div>

      {/* ── Events List ──────────────────────────────────────────────────────── */}
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
          {tab === 'upcoming' && isCoach && (
            <p className="text-xs text-gray-400 mt-1">Crie um evento para seus atletas participarem</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {(tab === 'upcoming' ? upcoming : past).map((event) => {
            const regCount = event.registrationCount ?? event._count?.registrations ?? 0;
            return (
              <div key={event.id} className="glass-card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <Link href={`/dashboard/events/${event.id}`} className="flex items-start gap-4 flex-1 min-w-0">
                    {event.coverImageUrl ? (
                      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                        <img src={event.coverImageUrl} alt={event.title} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0 text-primary">
                        <span className="text-lg font-bold leading-none">{new Date(event.eventDate).getDate()}</span>
                        <span className="text-xs uppercase">{new Date(event.eventDate).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                      </div>
                    )}
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
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[event.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABELS[event.status] ?? event.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <span className="text-xs text-gray-500">{formatPrice(event.price, event.currency)}</span>
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                          {regCount} {regCount === 1 ? 'inscrito' : 'inscritos'}
                          {event.maxParticipants ? ` / ${event.maxParticipants}` : ''}
                        </span>
                        {event.location && (
                          <a
                            href={`https://maps.google.com/maps?q=${encodeURIComponent([event.location, event.city].filter(Boolean).join(', '))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
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
                      Presenças
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
