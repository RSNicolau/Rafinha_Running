'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

interface Workout {
  id: string;
  title: string;
  date: string;
  type: string;
  distanceMeters: number | null;
  durationMinutes: number | null;
  status: string;
}

interface Plan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  weeklyFrequency: number;
  status: string;
}

export default function AthletePortalPage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated } = useAuthStore();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/athlete-login');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoadError(false);
    Promise.all([
      api.get('/workouts/history?limit=5').catch(() => null),
      api.get('/training-plans?status=ACTIVE&limit=1').catch(() => null),
    ]).then(([workoutsRes, plansRes]) => {
      if (workoutsRes === null && plansRes === null) {
        setLoadError(true);
        return;
      }
      setWorkouts(workoutsRes?.data?.workouts ?? workoutsRes?.data ?? []);
      const plans = plansRes?.data;
      if (Array.isArray(plans) && plans.length > 0) setPlan(plans[0]);
    }).finally(() => setLoading(false));
  }, [isAuthenticated]);

  const handleLogout = () => {
    logout();
    router.replace('/athlete-login');
  };

  const formatDist = (m: number | null) => m ? `${(m / 1000).toFixed(1)} km` : '—';
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  const statusLabel: Record<string, string> = {
    SCHEDULED: 'Agendado',
    COMPLETED: 'Concluído',
    SKIPPED: 'Pulado',
    IN_PROGRESS: 'Em andamento',
  };
  const statusColor: Record<string, string> = {
    SCHEDULED: 'bg-red-50 text-[#DC2626]',
    COMPLETED: 'bg-emerald-50 text-emerald-700',
    SKIPPED: 'bg-gray-100 text-gray-500',
    IN_PROGRESS: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom, #FEE2E2 0%, #F2F2F7 30%)' }}>
      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              <filter id="logo-red-fix2" colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values="1.062 0 0 0 -0.062  0 1.107 0 0 -0.107  0 0 1.038 0 -0.038  0 0 0 1 0" />
              </filter>
            </defs>
          </svg>
          <img src="/logo.png" alt="RR" className="h-8" style={{ filter: 'url(#logo-red-fix2)' }} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 font-medium">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-700 transition px-3 py-1.5 rounded-lg hover:bg-white/60"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-12">
        {/* Welcome */}
        <div className="mb-6 mt-2">
          <h1 className="text-2xl font-bold text-gray-900">Olá, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5">Aqui estão seus treinos e planilha atual</p>
        </div>

        {/* API error banner */}
        {loadError && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 mb-4 text-sm text-amber-800">
            <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
            Erro ao carregar dados. Verifique sua conexão e tente novamente.
          </div>
        )}

        {/* Active Plan */}
        {loading ? (
          <div className="glass-card p-6 mb-4">
            <div className="w-6 h-6 border-2 border-red-100 border-t-[#DC2626] rounded-full animate-spin mx-auto" />
          </div>
        ) : plan ? (
          <div className="glass-card p-5 mb-4 border-l-4 border-[#DC2626]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-[#DC2626] uppercase tracking-wider mb-1">Planilha Ativa</p>
                <h2 className="text-base font-bold text-gray-900">{plan.name}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {formatDate(plan.startDate)} → {formatDate(plan.endDate)} · {plan.weeklyFrequency}x/semana
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                Ativa
              </span>
            </div>
          </div>
        ) : !loading && (
          <div className="glass-card p-5 mb-4 text-center">
            <p className="text-sm text-gray-500">Nenhuma planilha ativa. Aguarde seu coach atribuir uma.</p>
          </div>
        )}

        {/* Workouts */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Últimos Treinos</h2>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
          ) : workouts.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🏃</div>
              <p className="text-sm text-gray-500">Nenhum treino registrado ainda</p>
              <p className="text-xs text-gray-400 mt-1">Seus treinos aparecerão aqui após sincronizar com Garmin ou Strava</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workouts.map((w) => (
                <div key={w.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{w.title}</p>
                      <p className="text-xs text-gray-400">{formatDate(w.date)} · {formatDist(w.distanceMeters)}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[w.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {statusLabel[w.status] ?? w.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* App download hint */}
        <div className="mt-4 p-4 rounded-2xl bg-white/60 border border-gray-200/60 text-center">
          <p className="text-xs text-gray-500">
            Para a experiência completa com live tracking, mapa de corrida e notificações, baixe o app mobile da Rafinha Running.
          </p>
        </div>
      </main>
    </div>
  );
}
