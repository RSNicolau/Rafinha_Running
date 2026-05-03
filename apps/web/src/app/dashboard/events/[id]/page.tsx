'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import CouponManager from './CouponManager';
import DistanceManager from './DistanceManager';

const EventMap = dynamic(() => import('@/components/maps/EventMap'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventDetail {
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
  tags: string[];
  coverImageUrl?: string;
  latitude?: number;
  longitude?: number;
  meetingPoint?: string;
  meetingPointLat?: number;
  meetingPointLng?: number;
  createdById?: string;
  _count?: { registrations: number };
}

interface EventDistance {
  id: string;
  name: string;
  distanceKm?: number | null;
  price: number;
  maxParticipants?: number | null;
  registeredCount: number;
  ageGroup?: string | null;
  description?: string | null;
  isActive: boolean;
  _count?: { registrations: number };
}

interface Registration {
  id: string;
  status: string;
  paymentStatus?: string;
  bibNumber?: string;
  distanceId?: string | null;
  registeredAt: string;
  user: { id: string; name: string; email: string; avatarUrl?: string; phone?: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const REG_STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  PENDING: 'bg-amber-50 text-amber-700',
  CHECKED_IN: 'bg-blue-50 text-blue-700',
  WAITLIST: 'bg-gray-100 text-gray-500',
  CANCELED: 'bg-red-50 text-red-400',
  ABSENT: 'bg-red-50 text-red-500',
};
const REG_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmado', PENDING: 'Pendente', CHECKED_IN: 'Presente',
  WAITLIST: 'Lista de Espera', CANCELED: 'Cancelado', ABSENT: 'Ausente',
};

function formatPrice(cents: number) {
  if (cents === 0) return 'Gratuito';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [distances, setDistances] = useState<EventDistance[]>([]);

  // Registrations
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [regsLoading, setRegsLoading] = useState(false);
  const [showRegs, setShowRegs] = useState(false);

  // Cover upload
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Notify modal
  const [showNotify, setShowNotify] = useState(false);
  const [notifyText, setNotifyText] = useState('');
  const [notifySending, setNotifySending] = useState(false);

  const isCoach = user?.role === 'COACH' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isCreator = isCoach && event?.createdById === user?.id;

  const loadEvent = () => {
    api.get(`/events/${id}`)
      .then((r) => setEvent(r.data))
      .catch(() => router.push('/dashboard/events'));
  };

  const loadDistances = () => {
    api.get<EventDistance[]>(`/events/${id}/distances`)
      .then((r) => setDistances(r.data || []))
      .catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      api.get(`/events/${id}`),
      api.get<EventDistance[]>(`/events/${id}/distances`),
    ])
      .then(([evRes, distRes]) => {
        setEvent(evRes.data);
        setDistances(distRes.data || []);
      })
      .catch(() => router.push('/dashboard/events'))
      .finally(() => setLoading(false));
  }, [id, router]);

  // Load registrations (coach only)
  const openRegistrations = async () => {
    setShowRegs(true);
    if (registrations.length > 0) return;
    setRegsLoading(true);
    try {
      const { data } = await api.get(`/events/${id}/registrations`);
      setRegistrations(data.data || data || []);
    } catch {
      alert('Erro ao carregar inscritos');
    } finally {
      setRegsLoading(false);
    }
  };

  // Cover image upload
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !event) return;
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/events/${event.id}/cover-image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setEvent((prev) => prev ? { ...prev, coverImageUrl: data.coverImageUrl } : prev);
    } catch {
      alert('Erro ao fazer upload da capa');
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  // Send notification
  const handleSendNotification = async () => {
    if (!notifyText.trim() || !event) return;
    setNotifySending(true);
    try {
      await api.post(`/events/${event.id}/notify`, { message: notifyText.trim() });
      setShowNotify(false);
      setNotifyText('');
      alert('Notificação enviada para os inscritos!');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao enviar notificação');
    } finally {
      setNotifySending(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!event) return null;

  const locationStr = [event.location, event.city, event.state].filter(Boolean).join(', ');
  const regCount = event._count?.registrations ?? 0;

  // Group registrations by distance
  const regsByDistance: Record<string, Registration[]> = {};
  const noDistanceRegs: Registration[] = [];
  for (const reg of registrations) {
    if (reg.distanceId) {
      if (!regsByDistance[reg.distanceId]) regsByDistance[reg.distanceId] = [];
      regsByDistance[reg.distanceId].push(reg);
    } else {
      noDistanceRegs.push(reg);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/dashboard/events" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          ← Voltar para Eventos
        </Link>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[event.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABELS[event.status] ?? event.status}
          </span>
          {isCoach && (
            <button
              onClick={() => setShowNotify(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              title="Notificar inscritos"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              Notificar
            </button>
          )}
        </div>
      </div>

      {/* Banner / Cover */}
      <div className="w-full rounded-2xl overflow-hidden mb-6 relative group">
        {event.coverImageUrl ? (
          <>
            <img
              src={event.coverImageUrl}
              alt={event.title}
              className="w-full h-56 object-cover"
            />
            {isCreator && (
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition cursor-pointer disabled:opacity-50"
              >
                {uploadingCover ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                )}
                Trocar capa
              </button>
            )}
          </>
        ) : isCreator ? (
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="w-full h-40 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary/40 hover:text-primary hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
          >
            {uploadingCover ? (
              <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                <span className="text-sm font-medium">Adicionar banner do evento</span>
                <span className="text-xs">JPG, PNG ou WEBP</span>
              </>
            )}
          </button>
        ) : null}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverUpload}
        />
      </div>

      {/* Header card */}
      <div className="glass-card p-6 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
          {event.modality && (
            <span className="shrink-0 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {event.modality}
            </span>
          )}
        </div>
        {event.description && <p className="text-sm text-gray-600 mb-4">{event.description}</p>}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Data</p>
            <p className="font-medium text-gray-800">
              {new Date(event.eventDate).toLocaleDateString('pt-BR', { dateStyle: 'full' })}
            </p>
          </div>
          {locationStr && (
            <div>
              <p className="text-xs text-gray-400">Local</p>
              <p className="font-medium text-gray-800">{locationStr}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">Inscrição base</p>
            <p className="font-medium text-gray-800">{formatPrice(event.price)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Inscritos</p>
            <p className="font-medium text-gray-800">
              {regCount}{event.maxParticipants ? ` / ${event.maxParticipants}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* ── DISTANCES — prominent section ──────────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
            </span>
            Percursos
            {distances.length > 0 && (
              <span className="text-sm font-normal text-gray-400">({distances.length})</span>
            )}
          </h2>
        </div>

        {distances.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center bg-gray-50/50">
            <p className="text-sm text-gray-400">Nenhum percurso cadastrado</p>
            <p className="text-xs text-gray-300 mt-1">Use o painel abaixo para adicionar percursos</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {distances.map((d) => {
              const count = d._count?.registrations ?? d.registeredCount ?? 0;
              const effectivePrice = d.price > 0 ? d.price : event.price;
              const isFull = d.maxParticipants !== null && d.maxParticipants !== undefined && count >= d.maxParticipants;
              return (
                <div
                  key={d.id}
                  className={`rounded-2xl border p-4 bg-white ${isFull ? 'border-red-100 bg-red-50/30' : 'border-gray-100'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-bold text-gray-900">{d.name}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {d.distanceKm != null && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                          {d.distanceKm}km
                        </span>
                      )}
                      {isFull && (
                        <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full font-medium">
                          Esgotado
                        </span>
                      )}
                    </div>
                  </div>
                  {d.ageGroup && (
                    <span className="inline-block text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium mb-2">
                      {d.ageGroup}
                    </span>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-semibold text-gray-800">
                      {formatPrice(effectivePrice)}
                      {d.price === 0 && event.price > 0 && (
                        <span className="text-gray-400 font-normal ml-1">(padrão)</span>
                      )}
                    </span>
                    {d.maxParticipants != null ? (
                      <span className={isFull ? 'text-red-500 font-semibold' : 'text-gray-500'}>
                        {count} / {d.maxParticipants} vagas
                      </span>
                    ) : (
                      count > 0 && <span>{count} inscritos</span>
                    )}
                  </div>
                  {d.description && (
                    <p className="text-xs text-gray-400 mt-1.5 truncate">{d.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Distance Manager (add/edit/delete) */}
      <DistanceManager eventId={event.id} eventPrice={event.price} onDistancesChange={loadDistances} />

      {/* Registrations by distance (coach) */}
      {isCoach && (
        <div className="glass-card p-5 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Lista de Inscritos</h2>
            <button
              onClick={openRegistrations}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
            >
              {showRegs ? 'Recolher' : `Ver Inscritos (${regCount})`}
            </button>
          </div>

          {showRegs && (
            regsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}
              </div>
            ) : registrations.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Nenhum inscrito ainda</p>
            ) : (
              <div className="space-y-4">
                {/* By distance */}
                {distances.map((d) => {
                  const regs = regsByDistance[d.id] || [];
                  if (regs.length === 0) return null;
                  return (
                    <div key={d.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-xs font-semibold text-gray-600">{d.name}</p>
                        {d.distanceKm != null && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                            {d.distanceKm}km
                          </span>
                        )}
                        {d.ageGroup && (
                          <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full">
                            {d.ageGroup}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">{regs.length} inscrito{regs.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-1.5">
                        {regs.map((reg) => (
                          <RegistrationRow key={reg.id} reg={reg} />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Without distance */}
                {noDistanceRegs.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold text-gray-600">Sem percurso definido</p>
                      <span className="text-xs text-gray-400 ml-auto">{noDistanceRegs.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {noDistanceRegs.map((reg) => (
                        <RegistrationRow key={reg.id} reg={reg} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* Map */}
      {locationStr && (
        <div className="mt-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <span>📍</span> Localização do Evento
          </h2>
          <EventMap
            address={locationStr}
            latitude={event.latitude}
            longitude={event.longitude}
            height="260px"
          />
          <a
            href={`https://maps.google.com/maps?q=${encodeURIComponent(locationStr)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-600 hover:underline"
          >
            Abrir no Google Maps →
          </a>
        </div>
      )}

      {/* Meeting point */}
      {event.meetingPoint && (
        <div className="glass-card p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <span>🚩</span> Ponto de Encontro
          </h2>
          <p className="text-sm text-gray-600 mb-3">{event.meetingPoint}</p>
          {(event.meetingPointLat && event.meetingPointLng) && (
            <EventMap
              address={event.meetingPoint}
              latitude={event.meetingPointLat}
              longitude={event.meetingPointLng}
              height="200px"
              zoom={17}
            />
          )}
        </div>
      )}

      {/* Coupon Manager */}
      <div className="mt-4">
        <CouponManager eventId={event.id} eventPrice={event.price} />
      </div>

      {/* ── Notify modal ────────────────────────────────────────────────────── */}
      {showNotify && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowNotify(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Notificar Inscritos</h3>
              <button
                onClick={() => setShowNotify(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Envie uma notificação push para todos os atletas inscritos em <strong>{event.title}</strong>.
            </p>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Mensagem</label>
            <textarea
              value={notifyText}
              onChange={(e) => setNotifyText(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Ex: Lembrete: o evento começa amanhã às 7h. Pontualidade é fundamental!"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{notifyText.length}/500</p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowNotify(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendNotification}
                disabled={notifySending || !notifyText.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                {notifySending ? 'Enviando...' : `Enviar para ${regCount} inscrito${regCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RegistrationRow({ reg }: { reg: Registration }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
        {reg.user.avatarUrl ? (
          <img src={reg.user.avatarUrl} alt={reg.user.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-semibold text-primary">{reg.user.name.charAt(0)}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 truncate">{reg.user.name}</p>
        <p className="text-xs text-gray-400 truncate">{reg.user.email}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {reg.bibNumber && (
          <span className="text-xs font-mono bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
            #{reg.bibNumber}
          </span>
        )}
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${REG_STATUS_COLORS[reg.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {REG_STATUS_LABELS[reg.status] ?? reg.status}
        </span>
      </div>
    </div>
  );
}
