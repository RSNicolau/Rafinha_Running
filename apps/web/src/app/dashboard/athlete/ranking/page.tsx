'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, friendlyError } from '@/lib/api';
import { formatKm } from '@/lib/coach-format';

/**
 * Ranking da equipe na área do atleta.
 * GET /rankings/km|workouts exige login e já vem limitado à equipe do atleta,
 * com os nomes dos colegas abreviados ("Marcos B.") e `isMe` na linha do próprio atleta.
 */

interface RankingEntry {
  position: number;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  value: number;
  isMe?: boolean;
}

type Metric = 'km' | 'workouts';
type Period = 'week' | 'month' | 'year';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
  { key: 'year', label: 'Ano' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

function fmtValue(metric: Metric, v: number) {
  const n = Number(v ?? 0);
  if (metric === 'km') {
    return formatKm(n);
  }
  return `${n} ${n === 1 ? 'treino' : 'treinos'}`;
}

export default function AthleteRankingPage() {
  const [metric, setMetric] = useState<Metric>('km');
  const [period, setPeriod] = useState<Period>('month');
  const [rows, setRows] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .get<RankingEntry[]>(`/rankings/${metric}`, { params: { period, limit: 50 } })
      .then((r) => { if (!cancelled) setRows(Array.isArray(r.data) ? r.data : []); })
      .catch((e) => { if (!cancelled) { setRows([]); setError(friendlyError(e, 'Não foi possível carregar o ranking.')); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [metric, period]);

  const me = rows.find((r) => r.isMe);

  return (
    <div className="max-w-2xl">
      <Link href="/athlete?tab=mais" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4">
        ‹ Voltar
      </Link>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Ranking da equipe</h1>
        <p className="text-sm text-gray-400 mt-1">Sua posição entre os atletas da sua equipe</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {([
            { key: 'km', label: 'Quilômetros' },
            { key: 'workouts', label: 'Treinos' },
          ] as const).map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${metric === m.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${period === p.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {me && !loading && (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Sua posição</p>
            <p className="text-lg font-bold text-gray-900">{me.position}º de {rows.length}</p>
          </div>
          <p className="text-base font-bold text-gray-900">{fmtValue(metric, me.value)}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-white border border-gray-100 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">Ainda não há treinos registrados na sua equipe neste período.</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.userId}
              className={`flex items-center gap-3 rounded-2xl border p-3 ${r.isMe ? 'border-[#DC2626]/40 bg-red-50/60' : 'border-gray-100 bg-white'}`}
            >
              <span className="w-8 text-center text-sm font-bold text-gray-500 shrink-0">
                {r.position <= 3 ? MEDALS[r.position - 1] : `${r.position}º`}
              </span>
              <span className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                {(r.name || '?').charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                {r.name}{r.isMe && <span className="ml-1.5 text-xs font-semibold text-[#DC2626]">(você)</span>}
              </span>
              <span className="text-sm font-semibold text-gray-900 shrink-0">{fmtValue(metric, r.value)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-gray-400 mt-4">Os nomes dos colegas aparecem abreviados para preservar a privacidade.</p>
    </div>
  );
}
