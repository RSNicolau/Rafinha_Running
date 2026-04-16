'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { useDemo, MOCK_ATHLETES, MOCK_STATS, MOCK_ALERTS } from '@/contexts/demo-mode';
import { getNiche } from '@/lib/niches';
import NicheSetupBanner from '@/components/NicheSetupBanner';

interface Athlete {
  id: string;
  level: string;
  weeklyGoalKm: number;
  user: { id: string; name: string; email: string };
}

const LEVEL_STYLES: Record<string, { label: string; className: string }> = {
  BEGINNER:     { label: 'Iniciante',      className: 'bg-gray-100 text-gray-600' },
  INTERMEDIATE: { label: 'Intermediário',  className: 'bg-blue-50 text-blue-600' },
  ADVANCED:     { label: 'Avançado',       className: 'bg-emerald-50 text-emerald-600' },
  ELITE:        { label: 'Elite',          className: 'bg-amber-50 text-amber-600' },
};

function avatarColor(name: string): string {
  const colors = ['#DC2626','#EA580C','#D97706','#16A34A','#2563EB','#7C3AED','#DB2777','#0D9488'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function StatSkeleton() {
  return <div className="glass-card p-5 animate-pulse"><div className="h-3 w-20 bg-gray-200 rounded mb-3" /><div className="h-9 w-16 bg-gray-200 rounded" /></div>;
}

function AthleteSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-gray-200" />
      <div className="flex-1"><div className="h-3 w-32 bg-gray-200 rounded mb-2" /><div className="h-2 w-24 bg-gray-200 rounded" /></div>
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { isDemoMode } = useDemo();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [coachStats, setCoachStats] = useState<{ alertCount: number; adherencePercent: number; totalAthletes: number } | null>(null);
  const [alerts, setAlerts] = useState<Array<{ athleteId: string; name: string; missedCount: number; lastMissedDate: string }>>([]);

  const niche = getNiche(user?.branding?.niche);

  const loadData = () => {
    if (isDemoMode) {
      setAthletes(MOCK_ATHLETES.map((a) => ({
        id: a.id,
        level: 'INTERMEDIATE',
        weeklyGoalKm: a.athleteProfile.weeklyDistance,
        user: { id: a.id, name: a.name, email: a.email },
      })));
      setCoachStats({ totalAthletes: MOCK_STATS.totalAthletes, alertCount: MOCK_ALERTS.length, adherencePercent: MOCK_STATS.completionRate });
      setAlerts(MOCK_ALERTS.map((a) => ({ athleteId: a.id, name: a.athlete.name, missedCount: 1, lastMissedDate: new Date().toISOString() })));
      setLoading(false);
      return;
    }
    setLoadError(false);
    setLoading(true);
    Promise.all([
      api.get('/users/athletes'),
      api.get('/users/athletes/stats'),
      api.get('/users/athletes/alerts'),
    ])
      .then(([athletesRes, statsRes, alertsRes]) => {
        // API returns paginated { data: [...], total, page } — extract the array
        const athletesList = Array.isArray(athletesRes.data)
          ? athletesRes.data
          : (athletesRes.data?.data ?? []);
        setAthletes(athletesList);
        setCoachStats(statsRes.data);
        setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [isDemoMode]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = user?.name?.split(' ')[0] ?? '';

  const stats = [
    {
      label: 'Atletas Ativos',
      value: loading ? null : String(coachStats?.totalAthletes ?? athletes.length),
      href: '/dashboard/athletes',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
      colorClass: 'bg-primary/8 text-primary',
    },
    {
      label: 'Alertas',
      value: loading ? null : coachStats ? String(coachStats.alertCount) : '--',
      href: '/dashboard/athletes',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
        </svg>
      ),
      colorClass: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Adesão Média',
      value: loading ? null : coachStats ? `${coachStats.adherencePercent}%` : '--',
      href: '/dashboard/athletes',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      colorClass: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: `Sem ${niche.workoutLabel}`,
      value: loading ? null : coachStats ? String(coachStats.alertCount) : '--',
      href: '/dashboard/athletes',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
        </svg>
      ),
      colorClass: 'bg-red-50 text-red-500',
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">{niche.icon}</span>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {greeting}, {firstName}
          </h1>
        </div>
        <p className="text-sm text-gray-400 ml-10">
          {user?.branding?.tenantName
            ? `Painel de ${user.branding.tenantName}`
            : `Painel do treinador de ${niche.label.toLowerCase()}`}
        </p>
      </div>

      {/* Niche setup banner — coaches only */}
      {(user?.role === 'COACH' || user?.role === 'ADMIN') && <NicheSetupBanner />}

      {/* API Error banner */}
      {loadError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 mb-6">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <span className="text-sm text-amber-800 flex-1">Não foi possível carregar os dados. Verifique sua conexão.</span>
          <button onClick={loadData} className="text-xs font-medium text-amber-700 hover:text-amber-900 underline cursor-pointer">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : stats.map((stat) => (
            <Link key={stat.label} href={stat.href} className="glass-card p-5 hover:shadow-md transition-shadow cursor-pointer block">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-tight">{stat.label}</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.colorClass}`}>
                  {stat.icon}
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight text-gray-900">{stat.value}</p>
            </Link>
          ))
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts */}
        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Alertas</h2>
            {alerts.length > 5 && (
              <Link href="/dashboard/athletes" className="text-xs font-medium text-primary">Ver todos</Link>
            )}
          </div>
          <div className="glass-card p-0 divide-y divide-gray-100 overflow-hidden">
            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-600">Tudo em dia!</p>
                <p className="text-xs text-gray-400 mt-1">Nenhum atleta sem {niche.workoutLabel}</p>
              </div>
            ) : alerts.slice(0, 5).map((alert) => (
              <Link
                key={alert.athleteId}
                href={`/dashboard/athletes/${alert.athleteId}`}
                className="flex items-start gap-3 p-4 hover:bg-gray-50/50 transition"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${alert.missedCount >= 3 ? 'bg-red-50' : 'bg-amber-50'}`}>
                  <svg className={`w-4 h-4 ${alert.missedCount >= 3 ? 'text-red-500' : 'text-amber-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 font-medium truncate">{alert.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {alert.missedCount} {niche.workoutLabel}{alert.missedCount > 1 ? 's' : ''} perdido{alert.missedCount > 1 ? 's' : ''}
                    {' · '}{new Date(alert.lastMissedDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
                <svg className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>
        </div>

        {/* Athletes */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Atletas</h2>
            <Link href="/dashboard/athletes" className="text-xs font-medium text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="glass-card p-0 divide-y divide-gray-100 overflow-hidden">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <AthleteSkeleton key={i} />)
            ) : athletes.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-600">Nenhum atleta ainda</p>
                <p className="text-xs text-gray-400 mt-1">Convide atletas pela aba Atletas</p>
              </div>
            ) : (
              athletes.slice(0, 6).map((athlete) => {
                const levelInfo = LEVEL_STYLES[athlete.level] ?? LEVEL_STYLES.BEGINNER;
                const color = avatarColor(athlete.user.name || 'A');
                return (
                  <Link
                    key={athlete.id}
                    href={`/dashboard/athletes/${athlete.user.id}`}
                    className="flex items-center gap-3 p-3 sm:p-4 hover:bg-gray-50/50 transition"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold" style={{ backgroundColor: color }}>
                      {athlete.user.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{athlete.user.name}</p>
                      <p className="text-xs text-gray-400 truncate">{athlete.user.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${levelInfo.className}`}>
                        {levelInfo.label}
                      </span>
                      {athlete.weeklyGoalKm > 0 && (
                        <span className="hidden sm:inline text-xs text-gray-400">
                          {athlete.weeklyGoalKm}{niche.unit}/sem
                        </span>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
