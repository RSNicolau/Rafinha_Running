'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import CouponManager from './CouponManager';
import DistanceManager from './DistanceManager';

const EventMap = dynamic(() => import('@/components/maps/EventMap'), { ssr: false });

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
  _count?: { registrations: number };
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/events/${id}`)
      .then((r) => setEvent(r.data))
      .catch(() => router.push('/dashboard/events'))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!event) return null;

  const locationStr = [event.location, event.city, event.state].filter(Boolean).join(', ');

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back */}
      <Link href="/dashboard/events" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6">
        ← Voltar para Eventos
      </Link>

      {/* Cover */}
      {event.coverImageUrl && (
        <div className="w-full h-48 rounded-2xl overflow-hidden mb-6">
          <img src={event.coverImageUrl} alt={event.title} className="w-full h-full object-cover" />
        </div>
      )}

      {/* Header */}
      <div className="glass-card p-6 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
          {event.modality && (
            <span className="shrink-0 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">{event.modality}</span>
          )}
        </div>
        {event.description && <p className="text-sm text-gray-600 mb-4">{event.description}</p>}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Data</p>
            <p className="font-medium text-gray-800">{new Date(event.eventDate).toLocaleDateString('pt-BR', { dateStyle: 'full' })}</p>
          </div>
          {locationStr && (
            <div>
              <p className="text-xs text-gray-400">Local</p>
              <p className="font-medium text-gray-800">{locationStr}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">Inscrição</p>
            <p className="font-medium text-gray-800">{event.price === 0 ? 'Gratuito' : `R$ ${(event.price / 100).toFixed(2)}`}</p>
          </div>
          {event.maxParticipants && (
            <div>
              <p className="text-xs text-gray-400">Vagas</p>
              <p className="font-medium text-gray-800">{event._count?.registrations ?? 0} / {event.maxParticipants}</p>
            </div>
          )}
        </div>
      </div>

      {/* Map — event location */}
      {locationStr && (
        <div className="mb-4">
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

      {/* Distance Manager */}
      <DistanceManager eventId={event.id} eventPrice={event.price} />

      {/* Coupon Manager + Kit Delivery */}
      <div className="mt-4">
        <CouponManager eventId={event.id} eventPrice={event.price} />
      </div>
    </div>
  );
}
