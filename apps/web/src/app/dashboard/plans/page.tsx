'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  startDate: string;
  endDate: string;
  weeklyFrequency: number;
  athlete: { id: string; name: string; avatarUrl: string | null };
  _count: { workouts: number };
}

const STATUS_LABELS: Record<Plan['status'], string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  COMPLETED: 'Concluído',
  ARCHIVED: 'Arquivado',
};

const STATUS_CLASSES: Record<Plan['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-blue-50 text-blue-700',
  ARCHIVED: 'bg-gray-50 text-gray-400',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysLeft(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return 'Encerrado';
  if (days === 0) return 'Encerra hoje';
  return `${days}d restantes`;
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Plan['status'] | 'ALL'>('ALL');
  const [garminPushing, setGarminPushing] = useState<Record<string, boolean>>({});
  const [garminResult, setGarminResult] = useState<Record<string, 'ok' | 'err'>>({});

  const pushToGarmin = async (planId: string) => {
    setGarminPushing((p) => ({ ...p, [planId]: true }));
    setGarminResult((p) => { const n = { ...p }; delete n[planId]; return n; });
    try {
      await api.post(`/integrations/garmin/push-plan/${planId}`);
      setGarminResult((p) => ({ ...p, [planId]: 'ok' }));
    } catch {
      setGarminResult((p) => ({ ...p, [planId]: 'err' }));
    } finally {
      setGarminPushing((p) => ({ ...p, [planId]: false }));
    }
  };

  const load = () => {
    setLoadError(false);
    api.get('/training-plans')
      .then(({ data }) => setPlans(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = plans.filter((p) => {
    const matchSearch = (p.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.athlete?.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activePlans = plans.filter((p) => p.status === 'ACTIVE').length;
  const draftPlans = plans.filter((p) => p.status === 'DRAFT').length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Planilhas de Treino</h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? 'Carregando...' : `${plans.length} planilha${plans.length !== 1 ? 's' : ''} · ${activePlans} ativa${activePlans !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          href="/dashboard/plans/create"
          className="px-5 py-2.5 bg-primary hover:bg-red-700 text-white text-sm font-medium rounded-xl transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nova Planilha
        </Link>
      </div>

      {/* API Error banner */}
      {loadError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 mb-6">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <span className="text-sm text-amber-800 flex-1">Erro ao carregar planilhas. Verifique sua conexão.</span>
          <button onClick={load} className="text-xs font-medium text-amber-700 hover:text-amber-900 underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Stats row */}
      {!loading && plans.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: plans.length, color: 'text-gray-900' },
            { label: 'Ativas', value: activePlans, color: 'text-emerald-600' },
            { label: 'Rascunhos', value: draftPlans, color: 'text-gray-500' },
            { label: 'Concluídas', value: plans.filter((p) => p.status === 'COMPLETED').length, color: 'text-blue-600' },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou atleta..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-gray-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
          />
        </div>

        <div className="flex gap-2">
          {(['ALL', 'ACTIVE', 'DRAFT', 'COMPLETED', 'ARCHIVED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                statusFilter === s
                  ? 'bg-primary text-white'
                  : 'bg-white border border-gray-200/60 text-gray-500 hover:text-gray-900'
              }`}
            >
              {s === 'ALL' ? 'Todos' : STATUS_LABELS[s as Plan['status']]}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass-card p-12 text-center">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Carregando planilhas...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-sm font-medium">
            {plans.length === 0 ? 'Nenhuma planilha criada ainda' : 'Nenhuma planilha encontrada'}
          </p>
          <p className="text-gray-400 text-xs mt-1">
            {plans.length === 0
              ? 'Crie uma planilha para começar a gerenciar os treinos dos seus atletas'
              : 'Tente ajustar os filtros de busca'
            }
          </p>
          {plans.length === 0 && (
            <Link
              href="/dashboard/plans/create"
              className="inline-block mt-5 px-6 py-2.5 bg-primary hover:bg-red-700 text-white text-sm font-medium rounded-xl transition"
            >
              Criar primeira planilha
            </Link>
          )}
        </div>
      )}

      {/* Plans grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4">
          {filtered.map((plan) => (
            <div key={plan.id} className="glass-card p-0 overflow-hidden hover:shadow-md transition-shadow">
              {/* Status accent */}
              <div className={`h-1 ${plan.status === 'ACTIVE' ? 'bg-emerald-500' : plan.status === 'DRAFT' ? 'bg-gray-300' : plan.status === 'COMPLETED' ? 'bg-blue-400' : 'bg-gray-200'}`} />

              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-bold text-gray-900 truncate">{plan.name}</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_CLASSES[plan.status]}`}>
                        {STATUS_LABELS[plan.status]}
                      </span>
                    </div>

                    {plan.description && (
                      <p className="text-sm text-gray-500 mb-3 line-clamp-1">{plan.description}</p>
                    )}

                    <div className="flex items-center gap-5 text-xs text-gray-400">
                      {/* Athlete */}
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-primary">
                            {plan.athlete?.name?.charAt(0).toUpperCase() ?? '?'}
                          </span>
                        </div>
                        <span className="font-medium text-gray-600">{plan.athlete?.name ?? 'Sem atleta'}</span>
                      </div>

                      {/* Dates */}
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
                        </svg>
                        {formatDate(plan.startDate)} → {formatDate(plan.endDate)}
                      </div>

                      {/* Frequency */}
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        {plan.weeklyFrequency}x/semana
                      </div>

                      {/* Workouts count */}
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                        </svg>
                        {plan._count?.workouts ?? 0} treinos
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 flex-shrink-0">
                    {plan.status === 'ACTIVE' && (
                      <span className="text-xs text-emerald-600 font-medium">
                        {daysLeft(plan.endDate)}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      {/* Garmin push button */}
                      <button
                        onClick={() => pushToGarmin(plan.id)}
                        disabled={garminPushing[plan.id]}
                        title="Enviar planilha para o Garmin Connect do atleta"
                        className={`px-3 py-2 rounded-xl text-xs font-medium transition border flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                          garminResult[plan.id] === 'ok'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : garminResult[plan.id] === 'err'
                            ? 'bg-red-50 text-red-600 border-red-200'
                            : 'bg-white hover:bg-gray-50 text-gray-600 border-gray-200/60'
                        }`}
                      >
                        {garminPushing[plan.id] ? (
                          <div className="w-3.5 h-3.5 border border-gray-400/40 border-t-gray-600 rounded-full animate-spin" />
                        ) : garminResult[plan.id] === 'ok' ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : garminResult[plan.id] === 'err' ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                          </svg>
                        )}
                        {garminResult[plan.id] === 'ok' ? 'Enviado!' : garminResult[plan.id] === 'err' ? 'Erro' : 'Garmin'}
                      </button>
                      <Link
                        href={`/dashboard/plans/${plan.id}`}
                        className="px-4 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium transition border border-gray-200/60"
                      >
                        Ver detalhes →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
