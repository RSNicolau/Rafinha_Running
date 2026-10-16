'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, inputCls } from './shared';

type Session = { id: string; label: string; token: string; expiresAt: string; createdAt: string };

/** Links de voluntário para a entrega de kits (/kit-entrega?token=...). */
export default function KitSessionsPanel({ eventId }: { eventId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [label, setLabel] = useState('');
  const [hours, setHours] = useState('8');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => api.get(`/events/${eventId}/kit-sessions`).then((r) => setSessions(r.data || [])).catch(() => undefined), [eventId]);
  useEffect(() => {
    load();
  }, [load]);

  const linkFor = (t: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/kit-entrega?token=${t}`;

  const create = async () => {
    if (!label.trim()) return;
    try {
      await api.post(`/events/${eventId}/kit-session`, { label: label.trim(), hours: Number(hours) || 8 });
      setLabel('');
      await load();
    } catch (e) {
      alert(errMsg(e, 'Erro ao criar link'));
    }
  };

  const revoke = async (s: Session) => {
    if (!window.confirm(`Revogar o link de ${s.label}?`)) return;
    await api.delete(`/events/kit-sessions/${s.id}`).catch(() => undefined);
    await load();
  };

  const copy = async (s: Session) => {
    try {
      await navigator.clipboard.writeText(linkFor(s.token));
      setCopied(s.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt('Copie o link:', linkFor(s.token));
    }
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-800">📦 Entrega de kits — links de voluntário</p>
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Nome do voluntário" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select className={`${inputCls} w-28`} value={hours} onChange={(e) => setHours(e.target.value)}>
          {['4', '8', '12', '24', '48', '72'].map((h) => <option key={h} value={h}>{h}h</option>)}
        </select>
        <button onClick={create} className="px-4 rounded-xl bg-primary text-white text-sm font-semibold">Gerar</button>
      </div>
      {sessions.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhum link criado.</p>
      ) : (
        <div className="space-y-1.5">
          {sessions.map((s) => {
            const expired = new Date(s.expiresAt) < new Date();
            return (
              <div key={s.id} className={`flex items-center gap-2 text-xs rounded-lg border border-gray-100 p-2 ${expired ? 'opacity-50' : ''}`}>
                <span className="font-semibold text-gray-800">{s.label}</span>
                <span className="text-gray-400">{expired ? 'expirado' : `até ${new Date(s.expiresAt).toLocaleString('pt-BR')}`}</span>
                {!expired && (
                  <>
                    <button onClick={() => copy(s)} className="ml-auto px-2 py-1 rounded border border-gray-200">{copied === s.id ? 'Copiado ✓' : 'Copiar link'}</button>
                    <a href={linkFor(s.token)} target="_blank" rel="noreferrer" className="px-2 py-1 rounded border border-gray-200">Abrir</a>
                    <button onClick={() => revoke(s)} className="px-2 py-1 rounded border border-red-200 text-red-600">Revogar</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
