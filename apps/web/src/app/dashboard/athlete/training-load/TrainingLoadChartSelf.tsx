'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';

interface TLPoint {
  date: string;
  load: number;
  atl: number;
  ctl: number;
  tsb: number;
}

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return d;
  }
}

export default function TrainingLoadChartSelf() {
  const [data, setData] = useState<TLPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(60);

  useEffect(() => {
    setLoading(true);
    api.get(`/workouts/training-load?days=${days}`)
      .then(({ data: d }) => setData(d))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [days]);

  const latest = data[data.length - 1];

  if (loading) {
    return <div className="glass-card p-6 animate-pulse h-64 bg-gray-50 rounded-2xl" />;
  }

  const tsbStatus = !latest ? null
    : latest.tsb > 5 ? { label: '🟢 Fresco', color: 'text-emerald-600 bg-emerald-50' }
    : latest.tsb > -10 ? { label: '🟡 Moderado', color: 'text-amber-600 bg-amber-50' }
    : { label: '🔴 Fatigado', color: 'text-red-600 bg-red-50' };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Fitness (CTL)</p>
          <p className="text-2xl font-bold text-blue-600">{latest?.ctl.toFixed(1) ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">km/dia avg 42d</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Fadiga (ATL)</p>
          <p className="text-2xl font-bold text-red-500">{latest?.atl.toFixed(1) ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">km/dia avg 7d</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Forma (TSB)</p>
          <p className={`text-2xl font-bold ${latest?.tsb > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {latest ? (latest.tsb > 0 ? '+' : '') + latest.tsb.toFixed(1) : '—'}
          </p>
          {tsbStatus && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${tsbStatus.color}`}>
              {tsbStatus.label}
            </span>
          )}
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {[30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
              days === d ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {d} dias
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="glass-card p-4">
        {data.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            Sem dados de treino suficientes para calcular a carga.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                interval={Math.ceil(data.length / 8)}
              />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = { ctl: 'Fitness (CTL)', atl: 'Fadiga (ATL)', tsb: 'Forma (TSB)', load: 'Carga do dia' };
                  return [`${(value as number).toFixed(1)} km`, labels[name] ?? name];
                }}
                labelFormatter={(l) => `Data: ${formatDate(l as string)}`}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend
                formatter={(v: string) => ({ ctl: 'Fitness (CTL)', atl: 'Fadiga (ATL)', tsb: 'Forma (TSB)', load: 'Carga' }[v] ?? v)}
                wrapperStyle={{ fontSize: 11 }}
              />
              <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="ctl" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="ctl" />
              <Line type="monotone" dataKey="atl" stroke="#ef4444" strokeWidth={2} dot={false} name="atl" />
              <Line type="monotone" dataKey="tsb" stroke="#10b981" strokeWidth={1.5} dot={false} name="tsb" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="load" stroke="#d1d5db" strokeWidth={1} dot={false} name="load" />
            </LineChart>
          </ResponsiveContainer>
        )}

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
          <span><span className="inline-block w-4 h-0.5 bg-blue-500 mr-1.5 align-middle" />CTL = Fitness (42 dias)</span>
          <span><span className="inline-block w-4 h-0.5 bg-red-500 mr-1.5 align-middle" />ATL = Fadiga (7 dias)</span>
          <span><span className="inline-block w-4 h-0.5 bg-emerald-500 mr-1.5 align-middle" />TSB = Forma (CTL − ATL)</span>
        </div>
      </div>
    </div>
  );
}
