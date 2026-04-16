'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AthleteUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  athleteProfile?: {
    level: string;
    weight?: number;
    vo2max?: number;
    restingHR?: number;
    maxHR?: number;
    weeklyGoalKm?: number;
  };
}

interface WorkoutResult {
  distanceMeters: number;
  durationSeconds: number;
  avgPace?: string;
  avgHeartRate?: number;
  calories?: number;
  elevationGain?: number;
  rpe?: number;
}

interface Workout {
  id: string;
  scheduledDate: string;
  type: string;
  title: string;
  status: string;
  completedAt?: string;
  result?: WorkoutResult | null;
}

interface Assessment {
  assessedAt: string;
  weightKg?: number;
  vo2max?: number;
  vdot?: number;
  restingHR?: number;
  best5kTime?: number;
  best10kTime?: number;
  aiAnalysis?: string;
}

interface TrainingLoadPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function fmtDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`;
  return `${m}min`;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtDateFull(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function levelLabel(l?: string) {
  return ({ beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado', elite: 'Elite' })[l?.toLowerCase() ?? ''] ?? l ?? '—';
}

function typeLabel(t: string) {
  return ({
    EASY_RUN: 'Fácil', TEMPO: 'Tempo', INTERVAL: 'Intervalado',
    LONG_RUN: 'Longo', RECOVERY: 'Recuperação', RACE: 'Prova',
    CROSS_TRAINING: 'Cross', REST: 'Descanso',
  })[t] ?? t;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AthleteReportPage() {
  const { id } = useParams<{ id: string }>();
  const [athlete, setAthlete] = useState<AthleteUser | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [trainingLoad, setTrainingLoad] = useState<TrainingLoadPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get(`/users/${id}/profile`).catch(() => api.get(`/users/athletes`).then(r => ({ data: r.data.find((a: any) => a.id === id) }))),
      api.get(`/workouts/history?athleteId=${id}&limit=100`).catch(() => ({ data: { workouts: [] } })),
      api.get(`/physical-assessments/athlete/${id}`).catch(() => ({ data: [] })),
      api.get(`/workouts/training-load/${id}?days=7`).catch(() => ({ data: [] })),
    ]).then(([athleteRes, workoutsRes, assessmentsRes, tlRes]) => {
      setAthlete(athleteRes.data);
      // Filter workouts to current month
      const monthWorkouts = (workoutsRes.data?.workouts ?? workoutsRes.data ?? []).filter((w: Workout) => {
        const d = new Date(w.scheduledDate);
        return d >= monthStart && d <= monthEnd;
      });
      setWorkouts(monthWorkouts);
      const assessments: Assessment[] = assessmentsRes.data ?? [];
      setAssessment(assessments[0] ?? null);
      const tl: TrainingLoadPoint[] = tlRes.data ?? [];
      setTrainingLoad(tl[tl.length - 1] ?? null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const completedWorkouts = workouts.filter(w => w.status === 'COMPLETED');
  const totalDistanceM = completedWorkouts.reduce((s, w) => s + (w.result?.distanceMeters ?? 0), 0);
  const totalDurationS = completedWorkouts.reduce((s, w) => s + (w.result?.durationSeconds ?? 0), 0);
  const totalCalories = completedWorkouts.reduce((s, w) => s + (w.result?.calories ?? 0), 0);
  const adherence = workouts.length > 0
    ? Math.round((completedWorkouts.length / workouts.filter(w => w.type !== 'REST').length) * 100)
    : 0;

  const avgPaces = completedWorkouts
    .filter(w => w.result?.avgPace)
    .map(w => {
      const parts = w.result!.avgPace!.split(':');
      return parseInt(parts[0]) * 60 + parseInt(parts[1] ?? '0');
    });
  const avgPaceSec = avgPaces.length > 0 ? Math.round(avgPaces.reduce((s, p) => s + p, 0) / avgPaces.length) : 0;
  const avgPaceStr = avgPaceSec > 0 ? `${Math.floor(avgPaceSec / 60)}:${String(avgPaceSec % 60).padStart(2, '0')}/km` : '—';

  const tsbStatus = !trainingLoad ? null
    : trainingLoad.tsb > 5 ? '🟢 Fresco'
    : trainingLoad.tsb > -10 ? '🟡 Moderado'
    : '🔴 Fatigado';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Carregando relatório...</p>
      </div>
    );
  }

  return (
    <>
      {/* Print button — hidden on print */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl shadow-lg hover:bg-primary/90 transition"
        >
          🖨️ Imprimir / Salvar PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
        >
          ✕ Fechar
        </button>
      </div>

      {/* Report content */}
      <div
        ref={reportRef}
        className="max-w-[900px] mx-auto px-8 py-10 print:px-10 print:py-8 bg-white min-h-screen"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-red-600">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">RR</span>
              </div>
              <span className="text-sm font-medium text-gray-500">Rafinha Running</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">
              Relatório Mensal de Evolução
            </h1>
            <p className="text-sm text-gray-500 capitalize mt-0.5">{monthLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">{athlete?.name ?? '—'}</p>
            <p className="text-sm text-gray-500">{levelLabel(athlete?.athleteProfile?.level)}</p>
            <p className="text-xs text-gray-400 mt-1">Gerado em {fmtDateFull(new Date().toISOString())}</p>
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Treinos realizados', value: completedWorkouts.length.toString(), sub: `de ${workouts.filter(w => w.type !== 'REST').length} programados` },
            { label: 'Distância total', value: fmtDistance(totalDistanceM), sub: 'no mês' },
            { label: 'Pace médio', value: avgPaceStr, sub: 'nos treinos completados' },
            { label: 'Adesão', value: `${adherence}%`, sub: 'do plano cumprido' },
          ].map((s, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{s.label}</p>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Two columns: Athlete profile + Training Load */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Athlete profile */}
          <div className="border border-gray-200 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Perfil do Atleta</h2>
            <div className="space-y-2 text-sm">
              {[
                ['Nível', levelLabel(athlete?.athleteProfile?.level)],
                ['Peso', athlete?.athleteProfile?.weight ? `${athlete.athleteProfile.weight} kg` : '—'],
                ['VO2max', athlete?.athleteProfile?.vo2max ? `${athlete.athleteProfile.vo2max} mL/kg/min` : '—'],
                ['FC Repouso', athlete?.athleteProfile?.restingHR ? `${athlete.athleteProfile.restingHR} bpm` : '—'],
                ['FC Máxima', athlete?.athleteProfile?.maxHR ? `${athlete.athleteProfile.maxHR} bpm` : '—'],
                ['Meta semanal', athlete?.athleteProfile?.weeklyGoalKm ? `${athlete.athleteProfile.weeklyGoalKm} km` : '—'],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between">
                  <span className="text-gray-500">{l}</span>
                  <span className="font-medium text-gray-800">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Training load */}
          <div className="border border-gray-200 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Carga de Treino</h2>
            {trainingLoad ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Fitness (CTL)</span>
                  <span className="font-bold text-blue-600">{trainingLoad.ctl.toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Fadiga (ATL)</span>
                  <span className="font-bold text-red-500">{trainingLoad.atl.toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Forma (TSB)</span>
                  <span className={`font-bold ${trainingLoad.tsb > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {trainingLoad.tsb > 0 ? '+' : ''}{trainingLoad.tsb.toFixed(1)}
                  </span>
                </div>
                {tsbStatus && (
                  <div className="pt-2 border-t border-gray-100">
                    <span className="text-sm font-semibold">{tsbStatus}</span>
                  </div>
                )}
                {totalCalories > 0 && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-sm text-gray-500">Calorias queimadas</span>
                    <span className="font-medium text-gray-700">{totalCalories.toLocaleString('pt-BR')} kcal</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Tempo total</span>
                  <span className="font-medium text-gray-700">{fmtDuration(totalDurationS)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Dados insuficientes para calcular carga.</p>
            )}
          </div>
        </div>

        {/* Latest assessment */}
        {assessment && (
          <div className="border border-gray-200 rounded-xl p-5 mb-8">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Última Avaliação Física — {fmtDateFull(assessment.assessedAt)}
            </h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {[
                ['Peso', assessment.weightKg ? `${assessment.weightKg} kg` : '—'],
                ['VO2max', assessment.vo2max ? `${assessment.vo2max}` : '—'],
                ['VDOT', assessment.vdot ? assessment.vdot.toFixed(1) : '—'],
                ['FC Repouso', assessment.restingHR ? `${assessment.restingHR} bpm` : '—'],
                ['Melhor 5K', assessment.best5kTime ? fmtTime(assessment.best5kTime) : '—'],
                ['Melhor 10K', assessment.best10kTime ? fmtTime(assessment.best10kTime) : '—'],
              ].map(([l, v]) => (
                <div key={l} className="flex flex-col">
                  <span className="text-xs text-gray-400">{l}</span>
                  <span className="font-semibold text-gray-800">{v}</span>
                </div>
              ))}
            </div>
            {assessment.aiAnalysis && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Análise IA</p>
                <p className="text-sm text-gray-600 leading-relaxed">{assessment.aiAnalysis}</p>
              </div>
            )}
          </div>
        )}

        {/* Workout list */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Treinos do Mês</h2>
          {workouts.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum treino programado neste mês.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  {['Data', 'Tipo', 'Título', 'Distância', 'Duração', 'Pace', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workouts.map((w, i) => (
                  <tr key={w.id} className={i % 2 === 0 ? 'bg-gray-50' : ''}>
                    <td className="py-1.5 pr-3 text-gray-600">{fmtDate(w.scheduledDate)}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{typeLabel(w.type)}</td>
                    <td className="py-1.5 pr-3 text-gray-800 font-medium max-w-[140px] truncate">{w.title}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{w.result?.distanceMeters ? fmtDistance(w.result.distanceMeters) : '—'}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{w.result?.durationSeconds ? fmtDuration(w.result.durationSeconds) : '—'}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{w.result?.avgPace ? `${w.result.avgPace}/km` : '—'}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        w.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700'
                        : w.status === 'SKIPPED' ? 'bg-amber-100 text-amber-700'
                        : w.status === 'MISSED' ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>
                        {w.status === 'COMPLETED' ? 'Feito' : w.status === 'SKIPPED' ? 'Pulado' : w.status === 'MISSED' ? 'Faltou' : 'Agendado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Rafinha Running — Relatório gerado automaticamente pela plataforma
          </p>
          <p className="text-xs text-gray-400">
            {athlete?.email}
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 15mm 12mm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </>
  );
}
