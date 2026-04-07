'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

interface OnboardingProfile {
  id: string;
  status: string;
  completedAt: string | null;
  aiSummary: string | null;
  answers: Record<string, any>;
  parsedProfile: Record<string, any> | null;
  athlete: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  };
}

interface FormQuestion {
  id: string;
  order: number;
  question: string;
}

const STATUS_STYLES: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  PENDING_REVIEW: { label: 'Aguardando revisão', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  IN_PROGRESS:    { label: 'Em progresso',       dot: 'bg-blue-500',  bg: 'bg-blue-50',  text: 'text-blue-700' },
  APPROVED:       { label: 'Aprovado',            dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  PLAN_GENERATED: { label: 'Plano gerado',        dot: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
};

export default function OnboardingDashboardPage() {
  const [profiles, setProfiles] = useState<OnboardingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OnboardingProfile | null>(null);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [approving, setApproving] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await api.get('/onboarding/pending');
      setProfiles(res.data);
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
    // Load form questions for mapping
    api.get('/onboarding/form').then(res => {
      setQuestions(res.data?.questions ?? []);
    }).catch(() => {});
  }, [fetchProfiles]);

  const handleApprove = async (profileId: string) => {
    setApproving(profileId);
    try {
      await api.put(`/onboarding/${profileId}/approve`);
      setProfiles(prev => prev.filter(p => p.id !== profileId));
      if (selected?.id === profileId) setSelected(null);
    } finally {
      setApproving(null);
    }
  };

  const getAnswerText = (profile: OnboardingProfile, questionId: string): string => {
    const val = profile.answers[questionId];
    if (val === undefined || val === null || val === '') return '—';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Novos Alunos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Questionários aguardando sua revisão</p>
        </div>
        {profiles.length > 0 && (
          <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-semibold">
            {profiles.length} pendente{profiles.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-48 bg-gray-100 rounded mb-4" />
              <div className="h-8 w-full bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">Nenhum questionário pendente</p>
          <p className="text-sm text-gray-400 mt-1">Todos os alunos foram revisados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="lg:col-span-1 space-y-3">
            {profiles.map(profile => {
              const s = STATUS_STYLES[profile.status] ?? STATUS_STYLES.PENDING_REVIEW;
              const isActive = selected?.id === profile.id;
              return (
                <div
                  key={profile.id}
                  onClick={() => setSelected(isActive ? null : profile)}
                  className={`glass-card p-4 cursor-pointer transition-all ${isActive ? 'ring-2 ring-red-500' : 'hover:shadow-md'}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{profile.athlete.name}</p>
                      <p className="text-xs text-gray-400">{profile.athlete.email}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${s.bg}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      <span className={`text-[10px] font-semibold ${s.text}`}>{s.label}</span>
                    </div>
                  </div>
                  {profile.completedAt && (
                    <p className="text-xs text-gray-400 mb-3">
                      Enviado em {new Date(profile.completedAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setSelected(profile); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition"
                    >
                      Ver respostas
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleApprove(profile.id); }}
                      disabled={approving === profile.id}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition disabled:opacity-50"
                    >
                      {approving === profile.id ? 'Aprovando...' : 'Aprovar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="glass-card p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selected.athlete.name}</h2>
                    <p className="text-sm text-gray-500">{selected.athlete.email}</p>
                    {selected.athlete.phone && (
                      <p className="text-sm text-gray-500">{selected.athlete.phone}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleApprove(selected.id)}
                    disabled={approving === selected.id}
                    className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition disabled:opacity-50"
                  >
                    {approving === selected.id ? 'Aprovando...' : 'Aprovar aluno'}
                  </button>
                </div>

                {/* AI Summary */}
                {selected.aiSummary && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Análise da IA</p>
                    <p className="text-sm text-blue-900 leading-relaxed">{selected.aiSummary}</p>
                    {selected.parsedProfile && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selected.parsedProfile.level && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                            Nível: {selected.parsedProfile.level}
                          </span>
                        )}
                        {Array.isArray(selected.parsedProfile.alerts) && selected.parsedProfile.alerts.map((alert: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                            ⚠ {alert}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Answers */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Respostas do questionário</p>
                  <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                    {questions.length > 0 ? questions.map(q => (
                      <div key={q.id} className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
                        <span className="text-xs text-gray-400 w-6 shrink-0 pt-0.5">{q.order}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 mb-0.5">{q.question}</p>
                          <p className="text-sm font-medium text-gray-900 break-words">{getAnswerText(selected, q.id)}</p>
                        </div>
                      </div>
                    )) : (
                      Object.entries(selected.answers).map(([key, val]) => (
                        <div key={key} className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 mb-0.5">{key}</p>
                            <p className="text-sm font-medium text-gray-900">{String(val)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-card p-6 flex flex-col items-center justify-center text-center h-64">
                <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-gray-400 text-sm">Selecione um aluno para ver as respostas</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
