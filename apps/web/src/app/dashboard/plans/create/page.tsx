'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const AI_GOALS = [
  { value: 'BASE_BUILDING', label: 'Base aeróbica' },
  { value: 'RACE_PREP_5K', label: 'Preparação 5K' },
  { value: 'RACE_PREP_10K', label: 'Preparação 10K' },
  { value: 'RACE_PREP_HALF', label: 'Meia maratona' },
  { value: 'RACE_PREP_MARATHON', label: 'Maratona' },
  { value: 'IMPROVE_PACE', label: 'Melhora de pace' },
  { value: 'WEIGHT_LOSS', label: 'Emagrecimento' },
  { value: 'RECOVERY', label: 'Recuperação' },
];

export default function CreatePlanPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [athletes, setAthletes] = useState<{ id: string; user: { id: string; name: string } }[]>([]);

  useEffect(() => {
    api.get('/users/athletes').then(({ data }) => setAthletes(data)).catch(() => {});
  }, []);

  const [form, setForm] = useState({
    athleteId: '',
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    weeklyFrequency: '4',
  });

  const [aiForm, setAiForm] = useState({
    athleteId: '',
    weeks: '8',
    goal: 'RACE_PREP_10K',
    startDate: '',
  });

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/training-plans', {
        ...form,
        weeklyFrequency: parseInt(form.weeklyFrequency),
      });
      router.push('/dashboard/plans');
    } catch {
      alert('Erro ao criar plano');
    } finally {
      setLoading(false);
    }
  };

  const handleAiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAiResult(null);
    try {
      const { data } = await api.post('/ai-training/generate', {
        athleteId: aiForm.athleteId,
        weeks: parseInt(aiForm.weeks),
        goal: aiForm.goal,
        startDate: aiForm.startDate || undefined,
      });
      setAiResult(data);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao gerar plano com IA');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50/80 border border-gray-200/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition';
  const labelClass = 'block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider';

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Voltar
      </button>

      <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-6">Nova Planilha de Treino</h1>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-8 p-1 rounded-xl bg-gray-100 w-fit">
        {(['manual', 'ai'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
              mode === m
                ? m === 'ai'
                  ? 'bg-white text-primary shadow-sm'
                  : 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {m === 'ai' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
            )}
            {m === 'ai' ? 'Gerar com IA' : 'Manual'}
          </button>
        ))}
      </div>

      {mode === 'ai' ? (
        <div className="max-w-2xl">
          {/* AI generation */}
          <div className="glass-card p-6 border border-primary/20 bg-primary/5 mb-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">IA de Treinos</h3>
                <p className="text-sm text-gray-500">Plano personalizado baseado no perfil e histórico do atleta</p>
              </div>
            </div>

            <form onSubmit={handleAiGenerate} className="space-y-5">
              <div>
                <label className={labelClass}>Atleta</label>
                <select
                  value={aiForm.athleteId}
                  onChange={(e) => setAiForm((p) => ({ ...p, athleteId: e.target.value }))}
                  required
                  className={inputClass}
                >
                  <option value="">Selecione um atleta</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.user.id}>{a.user.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Objetivo do treino</label>
                <div className="flex flex-wrap gap-2">
                  {AI_GOALS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setAiForm((p) => ({ ...p, goal: g.value }))}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition cursor-pointer ${
                        aiForm.goal === g.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Semanas</label>
                  <input
                    type="number"
                    value={aiForm.weeks}
                    onChange={(e) => setAiForm((p) => ({ ...p, weeks: e.target.value }))}
                    min="4"
                    max="52"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Início (opcional)</label>
                  <input
                    type="date"
                    value={aiForm.startDate}
                    onChange={(e) => setAiForm((p) => ({ ...p, startDate: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-medium tracking-wide transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Gerando plano...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Gerar Plano com IA
                  </>
                )}
              </button>
            </form>
          </div>

          {/* AI Result */}
          {aiResult && (
            <div className="glass-card p-6 border border-emerald-200/60 bg-emerald-50/30">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="text-sm font-bold text-emerald-800">Plano gerado com sucesso!</h4>
              </div>
              <p className="text-base font-semibold text-gray-900 mb-1">{aiResult.planName}</p>
              <p className="text-sm text-gray-500 mb-4">{aiResult.generatedWorkouts} treinos · {aiResult.weeks} semanas</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Nível', value: aiResult.level },
                  { label: 'Pace médio', value: aiResult.analysis?.avgPace + ' /km' },
                  { label: 'km/sem atual', value: aiResult.analysis?.recentWeeklyKm + ' km' },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-xl p-3 border border-gray-100 text-center">
                    <p className="text-lg font-bold text-gray-900">{s.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 italic">{aiResult.analysis?.recommendation}</p>
              <button
                onClick={() => router.push('/dashboard/plans')}
                className="mt-4 w-full py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition cursor-pointer"
              >
                Ver Planilhas →
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Manual form */
        <div className="glass-card p-8 max-w-2xl">
          <form onSubmit={handleManualSubmit} className="space-y-5">
            <div>
              <label className={labelClass}>Atleta</label>
              <select
                value={form.athleteId}
                onChange={(e) => setForm((p) => ({ ...p, athleteId: e.target.value }))}
                required
                className={inputClass}
              >
                <option value="">Selecione um atleta</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.user.id}>{a.user.name}</option>
                ))}
              </select>
            </div>
            {[
              { key: 'name', label: 'Nome do Plano', placeholder: 'Ex: Preparação 10km' },
              { key: 'description', label: 'Descrição', placeholder: 'Descrição do plano (opcional)' },
            ].map((field) => (
              <div key={field.key}>
                <label className={labelClass}>{field.label}</label>
                <input
                  type="text"
                  value={(form as any)[field.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className={inputClass}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Data Início</label>
                <input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Data Fim</label>
                <input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Frequência Semanal</label>
              <input type="number" value={form.weeklyFrequency} onChange={(e) => setForm((p) => ({ ...p, weeklyFrequency: e.target.value }))} min="1" max="7" className={inputClass} />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-medium tracking-wide transition disabled:opacity-50 mt-2 cursor-pointer"
            >
              {loading ? 'Criando...' : 'Criar Planilha'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
