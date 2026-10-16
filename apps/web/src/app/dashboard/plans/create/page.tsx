'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, friendlyError } from '@/lib/api';
import AthletePicker from '@/components/coach/AthletePicker';
import { levelLabel, todayInSaoPaulo } from '@/lib/coach-format';

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

function CreatePlanInner() {
  const router = useRouter();
  const params = useSearchParams();
  const presetAthleteId = params.get('athleteId') ?? '';
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);
  const [presetName, setPresetName] = useState('');

  const [form, setForm] = useState({
    athleteId: presetAthleteId,
    name: '',
    description: '',
    startDate: todayInSaoPaulo(),
    endDate: '',
    weeklyFrequency: '4',
  });

  const [aiForm, setAiForm] = useState({
    athleteId: presetAthleteId,
    weeks: '8',
    goal: 'RACE_PREP_10K',
    startDate: '',
  });

  // "Criar Planilha" a partir do detalhe do atleta: pré-seleciona o atleta
  useEffect(() => {
    if (!presetAthleteId) return;
    api.get(`/users/athletes/${presetAthleteId}`)
      .then(({ data }) => setPresetName(data?.name ?? ''))
      .catch(() => {});
  }, [presetAthleteId]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.athleteId) { setError('Selecione um atleta.'); return; }
    if (!form.name.trim()) { setError('Informe o nome da planilha.'); return; }
    if (!form.startDate || !form.endDate) { setError('Informe as datas de início e fim.'); return; }
    if (form.endDate < form.startDate) { setError('A data de fim deve ser igual ou posterior à data de início.'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/training-plans', {
        athleteId: form.athleteId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        weeklyFrequency: parseInt(form.weeklyFrequency, 10) || 3,
      });
      // Vai direto para o detalhe para adicionar os treinos
      router.push(data?.id ? `/dashboard/plans/${data.id}` : '/dashboard/plans');
    } catch (err) {
      setError(friendlyError(err, 'Erro ao criar a planilha.'));
    } finally {
      setLoading(false);
    }
  };

  const handleAutoGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!aiForm.athleteId) { setError('Selecione um atleta.'); return; }
    setLoading(true);
    setAiResult(null);
    try {
      const { data } = await api.post('/ai-training/generate', {
        athleteId: aiForm.athleteId,
        weeks: parseInt(aiForm.weeks, 10),
        goal: aiForm.goal,
        startDate: aiForm.startDate || undefined,
      });
      setAiResult(data);
    } catch (err) {
      setError(friendlyError(err, 'Erro ao gerar a planilha.'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50/80 border border-gray-200/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition';
  const labelClass = 'block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider';
  const usedAi = aiResult?.generator === 'ai' || aiResult?.humanized === true;

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
      <div className="flex flex-wrap gap-2 mb-8 p-1 rounded-xl bg-gray-100 w-fit">
        {(['manual', 'auto'] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(''); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
              mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {m === 'auto' ? 'Gerar automaticamente' : 'Manual'}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="max-w-2xl mb-4 p-3.5 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>
      )}

      {mode === 'auto' ? (
        <div className="max-w-2xl">
          <div className="glass-card p-6 border border-primary/20 bg-primary/5 mb-4">
            <div className="mb-6">
              <h3 className="text-base font-bold text-gray-900">Gerador de planilhas</h3>
              <p className="text-sm text-gray-500">
                Monta a periodização (base, construção e pico) a partir do perfil e do histórico do atleta. Com IA configurada,
                a descrição e as notas semanais são personalizadas pela IA.
              </p>
            </div>

            <form onSubmit={handleAutoGenerate} className="space-y-5">
              <div>
                <label className={labelClass}>Atleta</label>
                <AthletePicker
                  value={aiForm.athleteId}
                  initialLabel={presetName}
                  onChange={(a) => setAiForm((p) => ({ ...p, athleteId: a?.id ?? '' }))}
                  required
                />
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    Gerando planilha...
                  </>
                ) : 'Gerar planilha'}
              </button>
            </form>
          </div>

          {aiResult && (
            <div className="glass-card p-6 border border-emerald-200/60 bg-emerald-50/30">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <h4 className="text-sm font-bold text-emerald-800">Planilha gerada (rascunho)</h4>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${usedAi ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-600'}`}>
                  {usedAi ? 'Narrativa por IA' : 'Gerada por periodização (sem IA)'}
                </span>
              </div>
              <p className="text-base font-semibold text-gray-900 mb-1">{aiResult.planName}</p>
              <p className="text-sm text-gray-500 mb-3">{aiResult.generatedWorkouts} treinos · {aiResult.weeks} semanas</p>

              {aiResult.planDescription && (
                <div className="mb-4 p-4 rounded-xl bg-white border-l-4 border-primary">
                  <p className="text-sm text-gray-700 leading-relaxed">{aiResult.planDescription}</p>
                </div>
              )}

              {!usedAi && (
                <p className="mb-4 text-xs text-gray-500">
                  Para descrições e notas personalizadas por IA, configure sua chave em{' '}
                  <Link href="/dashboard/settings/ai" className="text-primary underline">Configurações &gt; IA</Link>.
                </p>
              )}

              {aiResult.weeklyNarratives && aiResult.weeklyNarratives.length > 0 && (
                <details className="mb-4">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-500 hover:text-gray-700 mb-2">
                    Narrativa semana a semana ({aiResult.weeklyNarratives.length} semanas)
                  </summary>
                  <div className="mt-2 space-y-2">
                    {aiResult.weeklyNarratives.map((narrative: string, i: number) => (
                      <div key={i} className="flex gap-3 p-3 rounded-lg bg-white border border-gray-100">
                        <span className="text-xs font-bold text-primary shrink-0 w-12">Sem {i + 1}</span>
                        <p className="text-xs text-gray-600 leading-relaxed">{narrative}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Nível', value: levelLabel(aiResult.level) },
                  { label: 'Pace médio', value: aiResult.analysis?.avgPace ? `${aiResult.analysis.avgPace} /km` : '—' },
                  { label: 'km/sem atual', value: aiResult.analysis?.recentWeeklyKm != null ? `${aiResult.analysis.recentWeeklyKm} km` : '—' },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-xl p-3 border border-gray-100 text-center">
                    <p className="text-lg font-bold text-gray-900">{s.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 italic">{aiResult.analysis?.recommendation}</p>
              <button
                onClick={() => router.push(aiResult.planId ? `/dashboard/plans/${aiResult.planId}` : '/dashboard/plans')}
                className="mt-4 w-full py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition cursor-pointer"
              >
                Revisar e ativar a planilha →
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card p-6 sm:p-8 max-w-2xl">
          <form onSubmit={handleManualSubmit} className="space-y-5" noValidate>
            <div>
              <label className={labelClass}>Atleta</label>
              <AthletePicker
                value={form.athleteId}
                initialLabel={presetName}
                onChange={(a) => setForm((p) => ({ ...p, athleteId: a?.id ?? '' }))}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="plan-name">Nome da planilha</label>
              <input id="plan-name" type="text" value={form.name} maxLength={150}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex.: Preparação 10 km" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="plan-desc">Descrição</label>
              <textarea id="plan-desc" value={form.description} rows={2}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Opcional" className={inputClass} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="plan-start">Data de início</label>
                <input id="plan-start" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="plan-end">Data de fim</label>
                <input id="plan-end" type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="plan-freq">Treinos por semana</label>
              <input id="plan-freq" type="number" value={form.weeklyFrequency} onChange={(e) => setForm((p) => ({ ...p, weeklyFrequency: e.target.value }))} min="1" max="7" className={inputClass} />
            </div>
            <p className="text-xs text-gray-400">A planilha nasce como rascunho. Na próxima tela você adiciona os treinos e a ativa.</p>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-medium tracking-wide transition disabled:opacity-50 mt-2 cursor-pointer"
            >
              {loading ? 'Criando...' : 'Criar e adicionar treinos'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function CreatePlanPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse bg-gray-50 rounded-2xl" />}>
      <CreatePlanInner />
    </Suspense>
  );
}
