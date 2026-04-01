'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

interface Athlete {
  id: string;
  level: string;
  weeklyGoalKm: number;
  user: { id: string; name: string; email: string };
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [coachStats, setCoachStats] = useState<{ alertCount: number; adherencePercent: number; totalAthletes: number } | null>(null);
  const [alerts, setAlerts] = useState<Array<{ athleteId: string; name: string; missedCount: number; lastMissedDate: string }>>([]);

  const loadData = () => {
    setLoadError(false);
    setLoading(true);
    Promise.all([
      api.get('/users/athletes'),
      api.get('/users/athletes/stats'),
      api.get('/users/athletes/alerts'),
    ])
      .then(([athletesRes, statsRes, alertsRes]) => {
        setAthletes(athletesRes.data);
        setCoachStats(statsRes.data);
        setAlerts(alertsRes.data);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {greeting}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Painel do treinador</p>
      </div>

      {/* API Error banner */}
      {loadError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 mb-6">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <span className="text-sm text-amber-800 flex-1">Não foi possível carregar os dados. Verifique sua conexão.</span>
          <button onClick={loadData} className="text-xs font-medium text-amber-700 hover:text-amber-900 underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Atletas', value: String(coachStats?.totalAthletes ?? athletes.length), icon: '👥', color: 'bg-primary/8 text-primary' },
          { label: 'Alertas', value: coachStats ? String(coachStats.alertCount) : '--', icon: '⚠️', color: 'bg-amber-50 text-amber-600' },
          { label: 'Adesão Média', value: coachStats ? `${coachStats.adherencePercent}%` : '--', icon: '✅', color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Sem Treino', value: coachStats ? String(coachStats.alertCount) : '--', icon: '🏃', color: 'bg-red-50 text-red-600' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{stat.label}</span>
              <span className="text-lg">{stat.icon}</span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts */}
        <div className="lg:col-span-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Alertas</h2>
          <div className="glass-card p-0 divide-y divide-gray-100">
            {alerts.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-400">Nenhum alerta no momento</p>
              </div>
            ) : alerts.slice(0, 5).map((alert) => (
              <Link
                key={alert.athleteId}
                href={`/dashboard/athletes/${alert.athleteId}`}
                className="flex items-start gap-3 p-4 hover:bg-gray-50/50 transition cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 text-sm">
                  ⚠️
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 font-medium">
                    {alert.name} perdeu {alert.missedCount} treino{alert.missedCount > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Último em {new Date(alert.lastMissedDate).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Athletes */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Atletas</h2>
            <Link href="/dashboard/athletes" className="text-xs font-medium text-primary hover:text-primary-dark">
              Ver todos
            </Link>
          </div>
          <div className="glass-card p-0 divide-y divide-gray-100">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
              </div>
            ) : athletes.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-400">Nenhum atleta cadastrado</p>
              </div>
            ) : (
              athletes.slice(0, 6).map((athlete) => (
                <Link
                  key={athlete.id}
                  href={`/dashboard/athletes/${athlete.user.id}`}
                  className="flex items-center gap-3 p-3 sm:p-4 hover:bg-gray-50/50 transition"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {athlete.user.name?.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{athlete.user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{athlete.user.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/8 text-primary">
                      {athlete.level}
                    </span>
                    {athlete.weeklyGoalKm && (
                      <span className="hidden sm:inline text-xs text-gray-400">
                        {athlete.weeklyGoalKm}km/sem
                      </span>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
