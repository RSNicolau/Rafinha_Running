'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface GarminSnapshot {
  hrv?: number | null;
  sleepScore?: number | null;
  sleepHours?: number | null;
  stressScore?: number | null;
  restingHR?: number | null;
  steps?: number | null;
  spo2?: number | null;
  date?: string;
}

interface HealthData {
  snapshot: GarminSnapshot | null;
  avgHrv: number | null;
  semaforo: 'green' | 'yellow' | 'red';
  semaforo_label: string;
  hasData: boolean;
}

interface GarminRecoveryCardProps {
  athleteId: string;
  compact?: boolean;
}

const SEMAFORO_STYLES = {
  green: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: 'Pronto para treinar',
  },
  yellow: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    label: 'Treino moderado',
  },
  red: {
    dot: 'bg-red-500',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    label: 'Descanso recomendado',
  },
};

export default function GarminRecoveryCard({ athleteId, compact = false }: GarminRecoveryCardProps) {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/integrations/garmin/health/today/${athleteId}`)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [athleteId]);

  if (loading) {
    return (
      <div className={`glass-card p-4 animate-pulse ${compact ? '' : ''}`}>
        <div className="h-3 w-28 bg-gray-200 rounded mb-3" />
        <div className="h-8 w-20 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="glass-card p-4 border border-dashed border-gray-200">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Recuperação Garmin</p>
        </div>
        <p className="text-xs text-gray-400 mt-1">Sem dados hoje — Garmin não sincronizado</p>
      </div>
    );
  }

  const s = SEMAFORO_STYLES[data.semaforo];
  const snap = data.snapshot!;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${s.bg} ${s.border}`}>
        <div className={`w-2.5 h-2.5 rounded-full ${s.dot} shrink-0`} />
        <span className={`text-xs font-semibold ${s.text}`}>{data.semaforo_label}</span>
        {snap.hrv && (
          <span className="text-xs text-gray-500 ml-auto">HRV {snap.hrv}ms</span>
        )}
      </div>
    );
  }

  return (
    <div className={`glass-card p-4 border ${s.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Recuperação Garmin</p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${s.bg}`}>
          <div className={`w-2 h-2 rounded-full ${s.dot}`} />
          <span className={`text-xs font-semibold ${s.text}`}>{data.semaforo_label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {snap.hrv !== null && snap.hrv !== undefined && (
          <MetricItem
            label="HRV"
            value={`${snap.hrv}ms`}
            sub={data.avgHrv ? `média 7d: ${data.avgHrv}ms` : undefined}
            warn={data.semaforo === 'red' && !!data.avgHrv && snap.hrv < data.avgHrv * 0.7}
          />
        )}
        {snap.sleepHours !== null && snap.sleepHours !== undefined && (
          <MetricItem
            label="Sono"
            value={`${snap.sleepHours.toFixed(1)}h`}
            sub={snap.sleepScore ? `score: ${snap.sleepScore}` : undefined}
            warn={snap.sleepHours < 5}
          />
        )}
        {snap.stressScore !== null && snap.stressScore !== undefined && (
          <MetricItem
            label="Estresse"
            value={`${snap.stressScore}/100`}
            warn={snap.stressScore > 75}
          />
        )}
        {snap.restingHR !== null && snap.restingHR !== undefined && (
          <MetricItem
            label="FC Repouso"
            value={`${snap.restingHR}bpm`}
          />
        )}
        {snap.steps !== null && snap.steps !== undefined && (
          <MetricItem
            label="Passos"
            value={snap.steps.toLocaleString('pt-BR')}
          />
        )}
        {snap.spo2 !== null && snap.spo2 !== undefined && (
          <MetricItem
            label="SpO2"
            value={`${snap.spo2.toFixed(1)}%`}
            warn={snap.spo2 < 95}
          />
        )}
      </div>
    </div>
  );
}

function MetricItem({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${warn ? 'text-red-500' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
