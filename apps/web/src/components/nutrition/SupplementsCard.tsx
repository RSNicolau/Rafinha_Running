'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, friendlyError } from '@/lib/api';

/**
 * Suplementos do atleta: GET/POST/DELETE /nutrition/supplements e
 * POST /nutrition/supplements/:id/toggle {date} (marca/desmarca a ingestão do dia).
 */
interface Supplement {
  id: string;
  name: string;
  dose?: string | null;
  timeOfDay?: string | null;
  taken: boolean;
}

const SUPPLEMENT_TIMES = ['Manhã', 'Pré-treino', 'Pós-treino', 'Almoço', 'Noite'];

export default function SupplementsCard({ date, compact = false }: { date: string; compact?: boolean }) {
  const [items, setItems] = useState<Supplement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<Supplement[]>('/nutrition/supplements', { params: { date } });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível carregar seus suplementos.'));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (s: Supplement) => {
    setBusy(s.id);
    setError('');
    try {
      const { data } = await api.post<{ taken: boolean }>(`/nutrition/supplements/${s.id}/toggle`, { date });
      setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, taken: !!data?.taken } : x)));
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível atualizar o suplemento.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (s: Supplement) => {
    if (!window.confirm(`Remover "${s.name}" da sua lista de suplementos?`)) return;
    setBusy(s.id);
    setError('');
    try {
      await api.delete(`/nutrition/supplements/${s.id}`);
      setItems((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível remover o suplemento.'));
    } finally {
      setBusy(null);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/nutrition/supplements', {
        name: name.trim(),
        ...(dose.trim() ? { dose: dose.trim() } : {}),
        ...(timeOfDay ? { timeOfDay } : {}),
      });
      setName(''); setDose(''); setTimeOfDay(''); setShowForm(false);
      await load();
    } catch (e2) {
      setError(friendlyError(e2, 'Não foi possível adicionar o suplemento.'));
    } finally {
      setSaving(false);
    }
  };

  const takenCount = items.filter((i) => i.taken).length;

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white ${compact ? 'p-4' : 'p-6'}`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Suplementos</h2>
          {items.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">{takenCount} de {items.length} tomados no dia</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition"
        >
          {showForm ? 'Cancelar' : '+ Adicionar'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={add} className="mb-4 space-y-2 rounded-xl bg-gray-50 p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex.: Creatina)"
            maxLength={100}
            required
            aria-label="Nome do suplemento"
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="Dose (ex.: 5 g)"
              maxLength={100}
              aria-label="Dose"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <select
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              aria-label="Horário"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="">Horário (opcional)</option>
              {SUPPLEMENT_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar suplemento'}
          </button>
        </form>
      )}

      {error && <p className="text-xs text-red-600 mb-3" role="alert">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-11 rounded-xl bg-gray-50 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Nenhum suplemento cadastrado. Adicione os que você usa para marcar a ingestão diária.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggle(s)}
                disabled={busy === s.id}
                aria-pressed={s.taken}
                aria-label={s.taken ? `Desmarcar ${s.name}` : `Marcar ${s.name} como tomado`}
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition disabled:opacity-50 ${
                  s.taken ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 text-transparent hover:border-emerald-400'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${s.taken ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{s.name}</p>
                {(s.dose || s.timeOfDay) && (
                  <p className="text-xs text-gray-400 truncate">{[s.dose, s.timeOfDay].filter(Boolean).join(' · ')}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(s)}
                disabled={busy === s.id}
                className="text-gray-300 hover:text-red-500 text-xs shrink-0 disabled:opacity-50"
                aria-label={`Remover ${s.name}`}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

