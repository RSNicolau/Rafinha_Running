'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface GroupEntry {
  rank: number;
  isMe: boolean;
  label: string;
  weeklyKm: number;
  workouts: number;
  best5kPace: string | null;
}

interface GroupData {
  data: GroupEntry[];
  myRank: number | null;
  total: number;
  groupAvgKm: number;
}

function MotivationalCard({ myEntry, groupAvgKm, total }: { myEntry: GroupEntry | undefined; groupAvgKm: number; total: number }) {
  if (!myEntry) return null;

  const diff = myEntry.weeklyKm - groupAvgKm;
  const pct = groupAvgKm > 0 ? Math.abs(Math.round((diff / groupAvgKm) * 100)) : 0;

  if (myEntry.rank <= 3) {
    return (
      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-sm font-semibold text-yellow-800">
          Voce esta entre os melhores do grupo! Continue assim.
        </p>
      </div>
    );
  } else if (diff < 0) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-800">
          Voce esta {Math.abs(diff).toFixed(1)}km abaixo da media do grupo. Um treino a mais faz diferenca!
        </p>
      </div>
    );
  } else {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-semibold text-green-800">
          Voce esta {pct}% acima da media do grupo. Otimo trabalho!
        </p>
      </div>
    );
  }
}

export default function AthleteGroupPage() {
  const [data, setData] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/workouts/group-comparison')
      .then((r) => setData(r.data))
      .catch(() => setError('Erro ao carregar comparacao do grupo'))
      .finally(() => setLoading(false));
  }, []);

  const myEntry = data?.data.find((e) => e.isMe);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Voce no Grupo</h1>
        <p className="text-sm text-gray-400 mt-1">Comparacao anonima — semana atual</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 animate-pulse h-20" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
          <p className="text-sm font-medium text-gray-500">Nenhum dado de grupo disponivel</p>
          <p className="text-xs text-gray-400 mt-1">Complete treinos para aparecer no ranking</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* My position card */}
          {myEntry && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
              <h2 className="text-sm font-semibold text-indigo-700 mb-3">Sua posicao</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-2xl font-bold text-indigo-900">#{myEntry.rank}</p>
                  <p className="text-xs text-indigo-600">de {data.total} atletas</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-indigo-900">{myEntry.weeklyKm.toFixed(1)}</p>
                  <p className="text-xs text-indigo-600">km esta semana</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-indigo-900">{data.groupAvgKm.toFixed(1)}</p>
                  <p className="text-xs text-indigo-600">media do grupo</p>
                </div>
                <div>
                  {myEntry.weeklyKm > data.groupAvgKm ? (
                    <>
                      <p className="text-2xl font-bold text-emerald-700">
                        +{data.groupAvgKm > 0 ? Math.round(((myEntry.weeklyKm - data.groupAvgKm) / data.groupAvgKm) * 100) : 0}%
                      </p>
                      <p className="text-xs text-emerald-600">acima da media</p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-amber-700">
                        -{data.groupAvgKm > 0 ? Math.round(((data.groupAvgKm - myEntry.weeklyKm) / data.groupAvgKm) * 100) : 0}%
                      </p>
                      <p className="text-xs text-amber-600">abaixo da media</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ranking table */}
          <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Ranking da Semana</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">#</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Atleta</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">km/semana</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Treinos</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Melhor 5K</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((entry) => (
                    <tr
                      key={entry.rank}
                      className={`border-b border-gray-50 last:border-0 transition-colors ${
                        entry.isMe
                          ? 'bg-indigo-50 font-semibold'
                          : 'hover:bg-gray-50/50'
                      }`}
                    >
                      <td className="px-6 py-3.5 text-sm">
                        {entry.rank === 1 ? (
                          <span className="text-yellow-500 font-bold">1</span>
                        ) : entry.rank === 2 ? (
                          <span className="text-gray-400 font-bold">2</span>
                        ) : entry.rank === 3 ? (
                          <span className="text-amber-600 font-bold">3</span>
                        ) : (
                          <span className="text-gray-500">{entry.rank}</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        {entry.isMe ? (
                          <span className="text-indigo-700 font-bold">→ Voce ←</span>
                        ) : (
                          <span className="text-gray-700">{entry.label}</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <span className={entry.isMe ? 'text-indigo-700' : 'text-gray-700'}>
                          {entry.weeklyKm.toFixed(1)} km
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <span className={entry.isMe ? 'text-indigo-700' : 'text-gray-500'}>
                          {entry.workouts}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <span className={entry.isMe ? 'text-indigo-700' : 'text-gray-500'}>
                          {entry.best5kPace ? `${entry.best5kPace}/km` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Motivational card */}
          <MotivationalCard myEntry={myEntry} groupAvgKm={data.groupAvgKm} total={data.total} />
        </div>
      )}
    </div>
  );
}
