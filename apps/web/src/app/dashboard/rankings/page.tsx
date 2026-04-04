'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface RankingEntry {
  rank: number;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  value: number;
  level?: string;
}

const PERIODS = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
  { key: 'year', label: 'Ano' },
] as const;

const LEVEL_COLORS: Record<string, string> = {
  BEGINNER: 'bg-gray-100 text-gray-500',
  INTERMEDIATE: 'bg-blue-50 text-blue-600',
  ADVANCED: 'bg-emerald-50 text-emerald-600',
  ELITE: 'bg-amber-50 text-amber-600',
};
const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Iniciante', INTERMEDIATE: 'Intermediário', ADVANCED: 'Avançado', ELITE: 'Elite',
};

function avatarColor(name: string) {
  const colors = ['#DC2626','#EA580C','#D97706','#16A34A','#2563EB','#7C3AED','#DB2777','#0D9488'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function medalColor(rank: number) {
  if (rank === 1) return 'text-amber-400';
  if (rank === 2) return 'text-gray-400';
  if (rank === 3) return 'text-amber-700';
  return 'text-gray-300';
}

function RankSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 animate-pulse">
      <div className="w-6 h-4 bg-gray-200 rounded" />
      <div className="w-10 h-10 rounded-full bg-gray-200" />
      <div className="flex-1"><div className="h-3 w-32 bg-gray-200 rounded mb-2" /><div className="h-2 w-20 bg-gray-200 rounded" /></div>
      <div className="w-14 h-5 bg-gray-200 rounded" />
    </div>
  );
}

export default function RankingsPage() {
  const [tab, setTab] = useState<'km' | 'workouts'>('km');
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [kmRanking, setKmRanking] = useState<RankingEntry[]>([]);
  const [workoutsRanking, setWorkoutsRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/rankings/km?period=${period}&limit=20`),
      api.get(`/rankings/workouts?period=${period}&limit=20`),
    ])
      .then(([kmRes, workoutsRes]) => {
        setKmRanking(kmRes.data || []);
        setWorkoutsRanking(workoutsRes.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const data = tab === 'km' ? kmRanking : workoutsRanking;
  const unit = tab === 'km' ? 'km' : 'treinos';

  const top3 = data.slice(0, 3);
  const rest = data.slice(3);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Rankings</h1>
        <p className="text-sm text-gray-400 mt-1">Desempenho dos seus atletas</p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        {/* Tab */}
        <div className="flex gap-1 p-1 bg-gray-100/80 rounded-xl">
          <button onClick={() => setTab('km')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${tab === 'km' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Quilômetros
          </button>
          <button onClick={() => setTab('workouts')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${tab === 'workouts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Treinos
          </button>
        </div>
        {/* Period */}
        <div className="flex gap-1 p-1 bg-gray-100/80 rounded-xl">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${period === p.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass-card divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => <RankSkeleton key={i} />)}
        </div>
      ) : data.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">Sem dados para este período</p>
          <p className="text-xs text-gray-400 mt-1">Os atletas precisam completar treinos para aparecer no ranking</p>
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length >= 2 && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {/* 2nd */}
              <div className="glass-card p-4 text-center flex flex-col items-center gap-2 order-1">
                <svg className={`w-6 h-6 ${medalColor(2)}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a5 5 0 100 10A5 5 0 0012 2zM7.5 14.5l-2 7 6.5-3 6.5 3-2-7H7.5z" />
                </svg>
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: avatarColor(top3[1]?.name || 'A') }}>
                  {top3[1]?.name?.charAt(0)}
                </div>
                <p className="text-xs font-semibold text-gray-800 truncate w-full text-center">{top3[1]?.name}</p>
                <p className="text-sm font-bold text-gray-900">{tab === 'km' ? `${(top3[1]?.value / 1000).toFixed(1)} km` : `${top3[1]?.value} treinos`}</p>
              </div>
              {/* 1st */}
              <div className="glass-card p-4 text-center flex flex-col items-center gap-2 order-0 -mt-3 border-2 border-amber-200">
                <svg className={`w-7 h-7 ${medalColor(1)}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a5 5 0 100 10A5 5 0 0012 2zM7.5 14.5l-2 7 6.5-3 6.5 3-2-7H7.5z" />
                </svg>
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: avatarColor(top3[0]?.name || 'A') }}>
                  {top3[0]?.name?.charAt(0)}
                </div>
                <p className="text-xs font-semibold text-gray-800 truncate w-full text-center">{top3[0]?.name}</p>
                <p className="text-base font-bold text-gray-900">{tab === 'km' ? `${(top3[0]?.value / 1000).toFixed(1)} km` : `${top3[0]?.value} treinos`}</p>
              </div>
              {/* 3rd */}
              {top3[2] ? (
                <div className="glass-card p-4 text-center flex flex-col items-center gap-2 order-2">
                  <svg className={`w-5 h-5 ${medalColor(3)}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a5 5 0 100 10A5 5 0 0012 2zM7.5 14.5l-2 7 6.5-3 6.5 3-2-7H7.5z" />
                  </svg>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: avatarColor(top3[2]?.name || 'A') }}>
                    {top3[2]?.name?.charAt(0)}
                  </div>
                  <p className="text-xs font-semibold text-gray-800 truncate w-full text-center">{top3[2]?.name}</p>
                  <p className="text-sm font-bold text-gray-900">{tab === 'km' ? `${(top3[2]?.value / 1000).toFixed(1)} km` : `${top3[2]?.value} treinos`}</p>
                </div>
              ) : <div className="order-2" />}
            </div>
          )}

          {/* Full list */}
          {rest.length > 0 && (
            <div className="glass-card divide-y divide-gray-100 overflow-hidden">
              {rest.map((entry) => (
                <div key={entry.userId} className="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition">
                  <span className="w-6 text-center text-sm font-bold text-gray-400">{entry.rank}</span>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: avatarColor(entry.name) }}>
                    {entry.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{entry.name}</p>
                    {entry.level && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${LEVEL_COLORS[entry.level] ?? 'bg-gray-100 text-gray-500'}`}>
                        {LEVEL_LABELS[entry.level] ?? entry.level}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">
                      {tab === 'km' ? `${(entry.value / 1000).toFixed(1)}` : entry.value}
                    </p>
                    <p className="text-xs text-gray-400">{unit}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
