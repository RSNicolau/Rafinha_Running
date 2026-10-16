'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmtBRL } from './shared';

type Stats = {
  maxParticipants: number | null;
  occupying: number;
  confirmed: number;
  pendingPayment: number;
  waitlist: number;
  checkedIn: number;
  absent: number;
  canceled: number;
  kitsDelivered: number;
  paidCount: number;
  revenueInCents: number;
  refundPending: number;
  byDistance: Array<{ id: string; name: string; isActive: boolean; maxParticipants: number | null; registeredCount: number; confirmed: number }>;
  byShirtSize: Record<string, number>;
  byKit: Record<string, number>;
};

const SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

export default function EventStats({ eventId, refreshKey }: { eventId: string; refreshKey: number }) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    api.get(`/events/${eventId}/stats`).then((r) => setS(r.data)).catch(() => setS(null));
  }, [eventId, refreshKey]);

  if (!s) return <div className="h-28 rounded-2xl bg-gray-100 animate-pulse" />;

  const pct = s.maxParticipants ? Math.min(100, Math.round((s.occupying / s.maxParticipants) * 100)) : null;
  const cards: Array<[string, string, string?]> = [
    ['Vagas ocupadas', s.maxParticipants ? `${s.occupying} / ${s.maxParticipants}` : String(s.occupying)],
    ['Confirmados', String(s.confirmed)],
    ['Aguardando pagamento', String(s.pendingPayment), 'text-amber-700'],
    ['Lista de espera', String(s.waitlist)],
    ['Presentes (check-in)', String(s.checkedIn), 'text-blue-700'],
    ['Kits entregues', `${s.kitsDelivered} / ${s.confirmed}`],
    ['Arrecadado', fmtBRL(s.revenueInCents), 'text-emerald-700'],
    ['Estornos pendentes', String(s.refundPending), s.refundPending ? 'text-red-600' : undefined],
  ];
  const sizes = Object.entries(s.byShirtSize).sort((a, b) => SIZE_ORDER.indexOf(a[0]) - SIZE_ORDER.indexOf(b[0]));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {cards.map(([k, v, cls]) => (
          <div key={k} className="glass-card p-3">
            <p className="text-[11px] text-gray-400">{k}</p>
            <p className={`text-lg font-bold ${cls ?? 'text-gray-900'}`}>{v}</p>
          </div>
        ))}
      </div>
      {pct !== null && (
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-2">
        <div className="glass-card p-3">
          <p className="text-xs font-semibold text-gray-600 mb-1">Por percurso (confirmados)</p>
          {s.byDistance.length === 0 ? <p className="text-xs text-gray-400">Sem percursos</p> : s.byDistance.map((d) => (
            <p key={d.id} className={`text-xs flex justify-between ${d.isActive ? 'text-gray-700' : 'text-gray-400 line-through'}`}>
              <span>{d.name}</span><span className="font-semibold">{d.confirmed}{d.maxParticipants ? ` / ${d.maxParticipants}` : ''}</span>
            </p>
          ))}
        </div>
        <div className="glass-card p-3">
          <p className="text-xs font-semibold text-gray-600 mb-1">Camisetas (confirmados)</p>
          {sizes.length === 0 ? <p className="text-xs text-gray-400">—</p> : sizes.map(([k, v]) => (
            <p key={k} className="text-xs flex justify-between text-gray-700"><span>{k}</span><span className="font-semibold">{v}</span></p>
          ))}
        </div>
        <div className="glass-card p-3">
          <p className="text-xs font-semibold text-gray-600 mb-1">Kits (confirmados)</p>
          {Object.keys(s.byKit).length === 0 ? <p className="text-xs text-gray-400">—</p> : Object.entries(s.byKit).map(([k, v]) => (
            <p key={k} className="text-xs flex justify-between text-gray-700"><span>{k === 'PREMIUM' ? 'Premium' : 'Completo'}</span><span className="font-semibold">{v}</span></p>
          ))}
        </div>
      </div>
    </div>
  );
}
