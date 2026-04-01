'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AthleteUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt?: string;
  athleteProfile?: {
    level: string;
    weight?: number;
    vo2max?: number;
    restingHR?: number;
    maxHR?: number;
    weeklyGoalKm?: number;
  };
}

interface Workout {
  id: string;
  date: string;
  type?: string;
  distance?: number; // meters
  duration?: number; // seconds
  pace?: number;     // sec/km
  source?: 'GPS' | 'Manual' | string;
  completed?: boolean;
}

interface WorkoutStats {
  totalWorkouts?: number;
  monthlyKm?: number;
  avgPace?: number;
  streak?: number;
  weeklyKm?: { week: string; km: number }[];
}

interface TrainingPlan {
  id: string;
  name: string;
  totalWorkouts: number;
  completedWorkouts: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPace(secPerKm: number | undefined): string {
  if (!secPerKm || !isFinite(secPerKm)) return '--:--';
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatDistance(meters: number | undefined): string {
  if (!meters) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(secs: number | undefined): string {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function levelLabel(level: string | undefined): string {
  const map: Record<string, string> = {
    beginner: 'Iniciante',
    intermediate: 'Intermediário',
    advanced: 'Avançado',
    elite: 'Elite',
  };
  return level ? (map[level.toLowerCase()] ?? level) : 'N/D';
}

function levelColor(level: string | undefined): string {
  const map: Record<string, string> = {
    beginner: 'bg-emerald-50 text-emerald-700',
    intermediate: 'bg-blue-50 text-blue-700',
    advanced: 'bg-violet-50 text-violet-700',
    elite: 'bg-amber-50 text-amber-700',
  };
  return level ? (map[level.toLowerCase()] ?? 'bg-gray-50 text-gray-600') : 'bg-gray-50 text-gray-600';
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return <div className="glass-card p-5 animate-pulse h-24 bg-gray-50" />;
}

// ─── Evolution SVG Chart ─────────────────────────────────────────────────────

function EvolutionChart({ weeks }: { weeks: { week: string; km: number }[] }) {
  if (!weeks || weeks.length === 0) return null;

  const WIDTH = 560;
  const HEIGHT = 120;
  const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };

  const maxKm = Math.max(...weeks.map((w) => w.km), 1);
  const chartW = WIDTH - PADDING.left - PADDING.right;
  const chartH = HEIGHT - PADDING.top - PADDING.bottom;

  const pts = weeks.map((w, i) => {
    const x = PADDING.left + (i / Math.max(weeks.length - 1, 1)) * chartW;
    const y = PADDING.top + chartH - (w.km / maxKm) * chartH;
    return { x, y, km: w.km, week: w.week };
  });

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');

  // Gradient fill path
  const fillPath =
    `M ${pts[0].x},${PADDING.top + chartH} ` +
    pts.map((p) => `L ${p.x},${p.y}`).join(' ') +
    ` L ${pts[pts.length - 1].x},${PADDING.top + chartH} Z`;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ minWidth: 280 }}
        aria-label="Evolução semanal de km"
      >
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#DC2626" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#DC2626" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal guide lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PADDING.top + chartH - t * chartH;
          return (
            <g key={t}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + chartW}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text x={PADDING.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                {Math.round(maxKm * t)}
              </text>
            </g>
          );
        })}

        {/* Fill area */}
        <path d={fillPath} fill="url(#chartGrad)" />

        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke="#DC2626"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#DC2626" stroke="white" strokeWidth={1.5} />
        ))}

        {/* X-axis labels */}
        {pts.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={9}
            fill="#9ca3af"
          >
            {p.week}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AthleteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [athlete, setAthlete] = useState<AthleteUser | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchAll = async () => {
      setLoading(true);

      // Athlete profile — try /users/athletes/:id first, fall back to /users/:id
      let athleteData: AthleteUser | null = null;
      try {
        const { data } = await api.get<AthleteUser>(`/users/athletes/${id}`);
        athleteData = data;
      } catch {
        try {
          const { data } = await api.get<AthleteUser>(`/users/${id}`);
          athleteData = data;
        } catch {
          setNotFound(true);
          setLoading(false);
          return;
        }
      }
      setAthlete(athleteData);

      // Workouts
      try {
        const { data } = await api.get<Workout[] | { data: Workout[] }>(
          `/workouts/athlete/${id}?limit=10`
        );
        setWorkouts(Array.isArray(data) ? data : data.data ?? []);
      } catch {
        // silently ignore
      }

      // Stats — try two possible endpoints
      try {
        const { data } = await api.get<WorkoutStats>(`/workouts/athlete/${id}/stats`);
        setStats(data);
      } catch {
        try {
          const { data } = await api.get<WorkoutStats>(`/workouts/stats?athleteId=${id}`);
          setStats(data);
        } catch {
          // silently ignore
        }
      }

      // Active training plan
      try {
        const { data } = await api.get<TrainingPlan | TrainingPlan[]>(`/plans/athlete/${id}/active`);
        const planData = Array.isArray(data) ? data[0] : data;
        if (planData) setPlan(planData);
      } catch {
        // silently ignore
      }

      setLoading(false);
    };

    fetchAll();
  }, [id]);

  // ── Render: loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        {/* Back */}
        <div className="w-16 h-4 bg-gray-100 rounded mb-6 animate-pulse" />

        {/* Header skeleton */}
        <div className="flex items-center gap-5 mb-8 animate-pulse">
          <div className="w-16 h-16 rounded-2xl bg-gray-100" />
          <div className="space-y-2">
            <div className="h-5 w-40 bg-gray-100 rounded" />
            <div className="h-3 w-56 bg-gray-100 rounded" />
          </div>
        </div>

        {/* Stats row skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  // ── Render: not found ────────────────────────────────────────────────────

  if (notFound || !athlete) {
    return (
      <div className="text-center py-24">
        <p className="text-gray-400 mb-4">Atleta não encontrado</p>
        <Link
          href="/dashboard/athletes"
          className="text-sm text-primary hover:underline"
        >
          Voltar para atletas
        </Link>
      </div>
    );
  }

  const p = athlete.athleteProfile;
  const planProgress =
    plan && plan.totalWorkouts > 0
      ? Math.round((plan.completedWorkouts / plan.totalWorkouts) * 100)
      : 0;

  // Build weekly km data for the chart — from stats if available, otherwise from workouts
  let weeklyData: { week: string; km: number }[] = [];
  if (stats?.weeklyKm && stats.weeklyKm.length > 0) {
    weeklyData = stats.weeklyKm.slice(-8);
  } else if (workouts.length > 0) {
    // Build from workouts data manually — group by ISO week
    const byWeek: Record<string, number> = {};
    workouts.forEach((w) => {
      if (!w.date || !w.distance) return;
      const d = new Date(w.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
      byWeek[key] = (byWeek[key] ?? 0) + (w.distance / 1000);
    });
    weeklyData = Object.entries(byWeek)
      .slice(-8)
      .map(([week, km]) => ({ week, km: parseFloat(km.toFixed(1)) }));
  }

  // ── Render: full page ────────────────────────────────────────────────────

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => router.push('/dashboard/athletes')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Atletas
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-5 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-2xl font-bold text-primary">{athlete.name?.charAt(0)?.toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{athlete.name}</h1>
            {p?.level && (
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${levelColor(p.level)}`}>
                {levelLabel(p.level)}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{athlete.email}</p>
          {athlete.createdAt && (
            <p className="text-xs text-gray-400 mt-0.5">
              Membro desde {formatDate(athlete.createdAt)}
            </p>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Estatísticas</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'Total de treinos',
            value: stats?.totalWorkouts != null ? String(stats.totalWorkouts) : (workouts.length > 0 ? `${workouts.length}+` : '—'),
            sub: 'registrados',
          },
          {
            label: 'Km este mês',
            value: stats?.monthlyKm != null ? `${stats.monthlyKm.toFixed(1)} km` : '—',
            sub: 'no mês atual',
          },
          {
            label: 'Pace médio',
            value: stats?.avgPace ? formatPace(stats.avgPace) : '—',
            sub: 'min/km',
          },
          {
            label: 'Sequência',
            value: stats?.streak != null ? `${stats.streak} dias` : '—',
            sub: 'consecutivos',
          },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-5">
            <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Athlete Profile Data (if available) */}
      {p && (
        <>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dados do Atleta</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Peso', value: p.weight ? `${p.weight} kg` : '—' },
              { label: 'VO2max', value: p.vo2max ? `${p.vo2max}` : '—' },
              { label: 'FC Repouso', value: p.restingHR ? `${p.restingHR} bpm` : '—' },
              { label: 'FC Máxima', value: p.maxHR ? `${p.maxHR} bpm` : '—' },
            ].map((stat) => (
              <div key={stat.label} className="glass-card p-5">
                <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Training Plan */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Planilha de Treino</h2>
          {plan ? (
            <>
              <p className="text-sm font-semibold text-gray-900 mb-1">{plan.name}</p>
              <p className="text-xs text-gray-400 mb-3">
                {plan.completedWorkouts} de {plan.totalWorkouts} treinos concluídos
              </p>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${planProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mb-4">{planProgress}% concluído</p>
              <Link
                href="/dashboard/plans"
                className="text-xs text-primary font-medium hover:underline"
              >
                Ver todas as planilhas →
              </Link>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <svg className="w-8 h-8 text-gray-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <p className="text-xs text-gray-400">Nenhuma planilha ativa</p>
              <Link href="/dashboard/plans" className="text-xs text-primary font-medium hover:underline mt-2">
                Criar planilha →
              </Link>
            </div>
          )}
        </div>

        {/* Contact */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Contato</h2>
          <div className="space-y-3">
            <a
              href={`mailto:${athlete.email}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">E-mail</p>
                <p className="text-sm font-medium text-gray-700 group-hover:text-primary transition truncate">
                  {athlete.email}
                </p>
              </div>
            </a>

            {athlete.phone ? (
              <a
                href={`https://wa.me/${athlete.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400">WhatsApp</p>
                  <p className="text-sm font-medium text-emerald-700 group-hover:text-emerald-800 transition">
                    {athlete.phone}
                  </p>
                </div>
              </a>
            ) : (
              <div className="p-3 rounded-xl bg-gray-50 text-center">
                <p className="text-xs text-gray-400">Telefone não cadastrado</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Ações</h2>
          <div className="space-y-2">
            <Link
              href="/dashboard/plans/create"
              className="flex items-center gap-2 w-full px-4 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-xl transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Criar Planilha
            </Link>
            <button className="flex items-center gap-2 w-full px-4 py-2.5 border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-medium rounded-xl transition cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              Enviar Feedback
            </button>
            <button className="flex items-center gap-2 w-full px-4 py-2.5 border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-medium rounded-xl transition cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Exportar Relatório
            </button>
          </div>
        </div>
      </div>

      {/* Recent Workouts */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Treinos Recentes</h2>
          <span className="text-xs text-gray-400">últimos {Math.min(workouts.length, 10)}</span>
        </div>

        {workouts.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-400">Nenhum treino registrado ainda</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr>
                  {['Data', 'Tipo', 'Distância', 'Duração', 'Pace', 'Fonte'].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-3 px-2"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {workouts.slice(0, 10).map((w) => (
                  <tr key={w.id} className="group hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-2 text-gray-700">{formatDate(w.date)}</td>
                    <td className="py-3 px-2 text-gray-700 capitalize">{w.type ?? 'Corrida'}</td>
                    <td className="py-3 px-2 text-gray-700">{formatDistance(w.distance)}</td>
                    <td className="py-3 px-2 text-gray-700">{formatDuration(w.duration)}</td>
                    <td className="py-3 px-2 text-gray-700 font-mono text-xs">{formatPace(w.pace)}</td>
                    <td className="py-3 px-2">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          w.source === 'GPS'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {w.source ?? 'Manual'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Evolution Chart */}
      {weeklyData.length > 1 && (
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">
            Evolução — Km por Semana
          </h2>
          <EvolutionChart weeks={weeklyData} />
        </div>
      )}
    </div>
  );
}
