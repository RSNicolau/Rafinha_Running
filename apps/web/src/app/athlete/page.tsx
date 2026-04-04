'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

interface WorkoutResult {
  rpe?: number | null;
  sensationScore?: number | null;
  athleteFeedback?: string | null;
}

interface Workout {
  id: string;
  title: string;
  date: string;
  type: string;
  distanceMeters: number | null;
  durationMinutes: number | null;
  status: string;
  result?: WorkoutResult | null;
}

interface Plan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  weeklyFrequency: number;
  status: string;
}

interface NutritionLog {
  id?: string;
  date: string;
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  notes?: string | null;
}

interface WaterLog {
  id?: string;
  date: string;
  amountMl: number;
}

const SENSATIONS = [
  { score: 1, emoji: '😫', label: 'Péssimo' },
  { score: 2, emoji: '😕', label: 'Ruim' },
  { score: 3, emoji: '😐', label: 'Ok' },
  { score: 4, emoji: '🙂', label: 'Bom' },
  { score: 5, emoji: '💪', label: 'Ótimo' },
];

function FeedbackModal({ workout, onClose, onSaved }: { workout: Workout; onClose: () => void; onSaved: (id: string, fb: WorkoutResult) => void }) {
  const [rpe, setRpe] = useState<number>(workout.result?.rpe ?? 5);
  const [sensation, setSensation] = useState<number | null>(workout.result?.sensationScore ?? null);
  const [text, setText] = useState(workout.result?.athleteFeedback ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.patch(`/workouts/${workout.id}/feedback`, {
        rpe,
        sensationScore: sensation ?? undefined,
        athleteFeedback: text.trim() || undefined,
      });
      onSaved(workout.id, { rpe, sensationScore: sensation, athleteFeedback: text.trim() || null });
      onClose();
    } catch {
      alert('Erro ao salvar feedback. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-gray-900">Como foi o treino?</h3>
            <p className="text-xs text-gray-400 mt-0.5">{workout.title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* RPE Slider */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Esforço percebido (RPE)</p>
            <span className={`text-lg font-bold ${rpe <= 4 ? 'text-emerald-500' : rpe <= 7 ? 'text-amber-500' : 'text-red-500'}`}>{rpe}</span>
          </div>
          <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ accentColor: rpe <= 4 ? '#16A34A' : rpe <= 7 ? '#D97706' : '#DC2626' }} />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">Fácil</span>
            <span className="text-xs text-gray-400">Máximo</span>
          </div>
        </div>

        {/* Sensation */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Como você se sentiu?</p>
          <div className="flex gap-2 justify-between">
            {SENSATIONS.map((s) => (
              <button key={s.score} onClick={() => setSensation(s.score)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border-2 transition cursor-pointer ${sensation === s.score ? 'border-[#DC2626] bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <span className="text-xl">{s.emoji}</span>
                <span className="text-xs text-gray-500">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Text */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">Observações (opcional)</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Dores, sensações, condições do treino..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#DC2626]/40 resize-none"
          />
        </div>

        <button onClick={handleSubmit} disabled={saving} className="w-full py-3 rounded-xl bg-[#DC2626] hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer">
          {saving ? 'Salvando...' : 'Enviar feedback'}
        </button>
      </div>
    </div>
  );
}

const WATER_STEPS = [250, 350, 500];

function NutritionSection({ userId }: { userId?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [log, setLog] = useState<NutritionLog>({ date: today });
  const [water, setWater] = useState(0);
  const [savingNutrition, setSavingNutrition] = useState(false);
  const [savingWater, setSavingWater] = useState(false);
  const [showNutritionForm, setShowNutritionForm] = useState(false);
  const waterGoalMl = 2500;

  useEffect(() => {
    api.get(`/nutrition?date=${today}`).then(r => {
      const d = r.data;
      if (d?.nutrition) setLog(d.nutrition);
      if (d?.waterTotal != null) setWater(d.waterTotal);
    }).catch(() => {});
  }, [today]);

  const handleAddWater = async (ml: number) => {
    setSavingWater(true);
    try {
      const { data } = await api.post('/nutrition/water', { amountMl: ml, date: today });
      setWater(prev => prev + ml);
    } catch {
      // silent
    } finally {
      setSavingWater(false);
    }
  };

  const handleSaveNutrition = async () => {
    setSavingNutrition(true);
    try {
      await api.post('/nutrition', { ...log, date: today });
      setShowNutritionForm(false);
    } catch {
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setSavingNutrition(false);
    }
  };

  const waterPercent = Math.min(100, Math.round((water / waterGoalMl) * 100));
  const hasNutrition = log.calories != null;

  return (
    <div className="space-y-3 mt-4">
      {/* Water tracker */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Hidratação</h2>
            <p className="text-xs text-gray-400">Meta: {(waterGoalMl / 1000).toFixed(1)}L por dia</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-[#DC2626]">{water >= 1000 ? `${(water/1000).toFixed(1)}L` : `${water}ml`}</p>
            <p className="text-xs text-gray-400">{waterPercent}%</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden mb-4">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${waterPercent}%`, backgroundColor: waterPercent >= 100 ? '#16A34A' : '#DC2626' }}
          />
        </div>

        {/* Quick add buttons */}
        <div className="flex gap-2">
          {WATER_STEPS.map(ml => (
            <button
              key={ml}
              onClick={() => handleAddWater(ml)}
              disabled={savingWater}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition cursor-pointer disabled:opacity-50"
            >
              +{ml}ml
            </button>
          ))}
        </div>
        {waterPercent >= 100 && (
          <p className="text-xs text-emerald-600 font-medium text-center mt-2">Meta atingida! 🎉</p>
        )}
      </div>

      {/* Nutrition log */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Nutrição de Hoje</h2>
          <button
            onClick={() => setShowNutritionForm(v => !v)}
            className="text-xs font-medium text-[#DC2626] hover:underline cursor-pointer"
          >
            {showNutritionForm ? 'Cancelar' : hasNutrition ? 'Editar' : '+ Registrar'}
          </button>
        </div>

        {!showNutritionForm && hasNutrition ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Calorias', value: log.calories ? `${log.calories} kcal` : '—', color: 'text-amber-600' },
              { label: 'Proteína', value: log.proteinGrams ? `${log.proteinGrams}g` : '—', color: 'text-blue-600' },
              { label: 'Carboidratos', value: log.carbsGrams ? `${log.carbsGrams}g` : '—', color: 'text-emerald-600' },
              { label: 'Gordura', value: log.fatGrams ? `${log.fatGrams}g` : '—', color: 'text-purple-600' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50/80 rounded-xl p-3 text-center">
                <p className={`text-base font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
              </div>
            ))}
            {log.notes && <p className="col-span-2 text-xs text-gray-400 italic">{log.notes}</p>}
          </div>
        ) : !showNutritionForm ? (
          <p className="text-sm text-gray-400 text-center py-3">Nenhum registro para hoje. Clique em "+ Registrar" para adicionar.</p>
        ) : null}

        {showNutritionForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'calories', label: 'Calorias (kcal)', placeholder: '2000' },
                { key: 'proteinGrams', label: 'Proteína (g)', placeholder: '150' },
                { key: 'carbsGrams', label: 'Carboidratos (g)', placeholder: '250' },
                { key: 'fatGrams', label: 'Gordura (g)', placeholder: '70' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                  <input
                    type="number"
                    min={0}
                    placeholder={field.placeholder}
                    value={(log as any)[field.key] ?? ''}
                    onChange={e => setLog(p => ({ ...p, [field.key]: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#DC2626]/40"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Observações</label>
              <input
                type="text"
                placeholder="Ex: dia de dieta, pré-treino..."
                value={log.notes ?? ''}
                onChange={e => setLog(p => ({ ...p, notes: e.target.value || null }))}
                className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#DC2626]/40"
              />
            </div>
            <button
              onClick={handleSaveNutrition}
              disabled={savingNutrition}
              className="w-full py-2.5 rounded-xl bg-[#DC2626] hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
            >
              {savingNutrition ? 'Salvando...' : 'Salvar nutrição'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AthletePortalPage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated } = useAuthStore();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [feedbackWorkout, setFeedbackWorkout] = useState<Workout | null>(null);

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

  const handleFeedbackSaved = (workoutId: string, fb: WorkoutResult) => {
    setWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, result: { ...(w.result ?? {}), ...fb } } : w));
  };

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
        <img src="/logo.png" alt="RR" className="h-8" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 font-medium">{user?.name}</span>
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-700 transition px-3 py-1.5 rounded-lg hover:bg-white/60 cursor-pointer">
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-12">
        <div className="mb-6 mt-2">
          <h1 className="text-2xl font-bold text-gray-900">Olá, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5">Aqui estão seus treinos e planilha atual</p>
        </div>

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
          <div className="glass-card p-6 mb-4 animate-pulse"><div className="h-4 w-48 bg-gray-200 rounded" /></div>
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
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Ativa</span>
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
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : workouts.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🏃</div>
              <p className="text-sm text-gray-500">Nenhum treino registrado ainda</p>
              <p className="text-xs text-gray-400 mt-1">Seus treinos aparecerão aqui após sincronizar com Garmin ou Strava</p>
            </div>
          ) : (
            <div className="space-y-2">
              {workouts.map((w) => {
                const hasFeedback = w.result?.rpe != null || w.result?.sensationScore != null;
                const sensationEmoji = w.result?.sensationScore ? SENSATIONS.find(s => s.score === w.result?.sensationScore)?.emoji : null;
                return (
                  <div key={w.id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                    <div className="flex items-center justify-between">
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

                    {/* Feedback row */}
                    {(w.status === 'COMPLETED' || w.status === 'SKIPPED') && (
                      <div className="mt-2 flex items-center justify-between">
                        {hasFeedback ? (
                          <div className="flex items-center gap-2">
                            {sensationEmoji && <span className="text-base">{sensationEmoji}</span>}
                            {w.result?.rpe != null && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${w.result.rpe >= 8 ? 'bg-red-50 text-red-600' : w.result.rpe >= 6 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                RPE {w.result.rpe}
                              </span>
                            )}
                            {w.result?.athleteFeedback && (
                              <span className="text-xs text-gray-400 truncate max-w-[120px]">{w.result.athleteFeedback}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Sem feedback</span>
                        )}
                        <button
                          onClick={() => setFeedbackWorkout(w)}
                          className="text-xs font-medium text-[#DC2626] hover:underline cursor-pointer ml-2"
                        >
                          {hasFeedback ? 'Editar' : '+ Feedback'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Nutrition & Hydration */}
        {isAuthenticated && <NutritionSection userId={user?.id} />}

        <div className="mt-4 p-4 rounded-2xl bg-white/60 border border-gray-200/60 text-center">
          <p className="text-xs text-gray-500">
            Para a experiência completa com live tracking, mapa de corrida e notificações, baixe o app mobile da Rafinha Running.
          </p>
        </div>
      </main>

      {feedbackWorkout && (
        <FeedbackModal
          workout={feedbackWorkout}
          onClose={() => setFeedbackWorkout(null)}
          onSaved={handleFeedbackSaved}
        />
      )}
    </div>
  );
}
