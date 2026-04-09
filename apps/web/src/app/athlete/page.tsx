'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkoutResult {
  rpe?: number | null;
  sensationScore?: number | null;
  athleteFeedback?: string | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
}

interface Workout {
  id: string;
  title: string;
  date: string;
  scheduledDate?: string;
  type: string;
  distanceMeters: number | null;
  durationMinutes: number | null;
  description?: string | null;
  status: string;
  result?: WorkoutResult | null;
}

interface WeeklyData {
  workouts: Workout[];
  totalDistanceMeters: number;
  completedCount: number;
  totalCount: number;
}

interface Stats {
  totalKm: number;
  weeklyKm: number;
  totalWorkouts: number;
  avgPace?: string | null;
}

interface Plan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  weeklyFrequency: number;
  status: string;
}

interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface MealForm {
  mealName: string;
  calories: number | '';
  protein: number | '';
  carbs: number | '';
  fat: number | '';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SENSATIONS = [
  { score: 1, emoji: '😫', label: 'Péssimo' },
  { score: 2, emoji: '😕', label: 'Ruim' },
  { score: 3, emoji: '😐', label: 'Ok' },
  { score: 4, emoji: '🙂', label: 'Bom' },
  { score: 5, emoji: '💪', label: 'Ótimo' },
];

const WATER_STEPS = [250, 350, 500];
const EMPTY_MEAL: MealForm = { mealName: '', calories: '', protein: '', carbs: '', fat: '' };

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Agendado',
  COMPLETED: 'Concluído',
  SKIPPED: 'Pulado',
  IN_PROGRESS: 'Em andamento',
};

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'bg-red-50 text-[#DC2626]',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
};

const WORKOUT_TYPE_ICON: Record<string, string> = {
  EASY: '🟢',
  TEMPO: '🟡',
  INTERVAL: '🔴',
  LONG: '🔵',
  RACE: '🏆',
  RECOVERY: '💜',
  STRENGTH: '💪',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = {
  dist: (m: number | null | undefined) => m && m > 0 ? `${(m / 1000).toFixed(1)} km` : null,
  pace: (s: number | null | undefined) => {
    if (!s) return null;
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, '0');
    return `${m}:${sec}/km`;
  },
  dateShort: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  weekday: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long' }),
  isToday: (iso: string) => {
    const d = new Date(iso);
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  },
  isTomorrow: (iso: string) => {
    const d = new Date(iso);
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  },
  greet: (name?: string) => {
    const h = new Date().getHours();
    const first = name?.split(' ')[0] ?? '';
    if (h < 12) return `Bom dia, ${first}`;
    if (h < 18) return `Boa tarde, ${first}`;
    return `Boa noite, ${first}`;
  },
};

// ─── FeedbackModal ────────────────────────────────────────────────────────────

function FeedbackModal({ workout, onClose, onSaved }: {
  workout: Workout;
  onClose: () => void;
  onSaved: (id: string, fb: WorkoutResult) => void;
}) {
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
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

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Esforço percebido (RPE)</p>
            <span className={`text-xl font-bold ${rpe <= 4 ? 'text-emerald-500' : rpe <= 7 ? 'text-amber-500' : 'text-red-500'}`}>{rpe}</span>
          </div>
          <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: rpe <= 4 ? '#16A34A' : rpe <= 7 ? '#D97706' : '#DC2626' }} />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">Fácil</span>
            <span className="text-xs text-gray-400">Máximo</span>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Como você se sentiu?</p>
          <div className="flex gap-2">
            {SENSATIONS.map((s) => (
              <button key={s.score} onClick={() => setSensation(s.score)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition cursor-pointer ${sensation === s.score ? 'border-[#DC2626] bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}>
                <span className="text-xl">{s.emoji}</span>
                <span className="text-[10px] text-gray-500">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">Observações (opcional)</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={2}
            placeholder="Dores, sensações, condições do treino..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#DC2626]/40 resize-none" />
        </div>

        <button onClick={handleSubmit} disabled={saving || sensation === null}
          className="w-full py-3 rounded-xl bg-[#DC2626] hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer">
          {saving ? 'Salvando...' : 'Enviar feedback'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Home ────────────────────────────────────────────────────────────────

function HomeTab({
  user, weekly, stats, plan, loading,
  onFeedback,
}: {
  user: any;
  weekly: WeeklyData | null;
  stats: Stats | null;
  plan: Plan | null;
  loading: boolean;
  onFeedback: (w: Workout) => void;
}) {
  const todayWorkout = weekly?.workouts.find(w => fmt.isToday(w.scheduledDate ?? w.date));
  const tomorrowWorkout = weekly?.workouts.find(w => fmt.isTomorrow(w.scheduledDate ?? w.date));
  const weekProgress = weekly ? (weekly.completedCount / Math.max(weekly.totalCount, 1)) * 100 : 0;
  const weeklyKm = stats?.weeklyKm ?? 0;

  return (
    <div className="space-y-4">
      {/* Hero greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{fmt.greet(user?.name)} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-[#DC2626] flex items-center justify-center shadow-md">
          <span className="text-white text-lg font-bold">{user?.name?.[0]?.toUpperCase() ?? '?'}</span>
        </div>
      </div>

      {/* Stats row */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="glass-card p-4 h-20 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card p-4 text-center">
            <p className="text-xl font-bold text-[#DC2626]">{weeklyKm.toFixed(1)}</p>
            <p className="text-xs text-gray-400 mt-0.5">km esta semana</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-xl font-bold text-gray-900">{weekly?.completedCount ?? 0}/{weekly?.totalCount ?? 0}</p>
            <p className="text-xs text-gray-400 mt-0.5">treinos feitos</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-xl font-bold text-gray-900">{stats?.totalKm?.toFixed(0) ?? '0'}</p>
            <p className="text-xs text-gray-400 mt-0.5">km no total</p>
          </div>
        </div>
      )}

      {/* Weekly progress bar */}
      {!loading && weekly && weekly.totalCount > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Semana atual</p>
            <span className="text-xs font-bold text-[#DC2626]">{Math.round(weekProgress)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${weekProgress}%`, backgroundColor: weekProgress >= 100 ? '#16A34A' : '#DC2626' }} />
          </div>
          <div className="flex gap-1.5 mt-3">
            {weekly.workouts.map((w, i) => {
              const isCompleted = w.status === 'COMPLETED';
              const isToday = fmt.isToday(w.scheduledDate ?? w.date);
              const isSkipped = w.status === 'SKIPPED';
              return (
                <div key={w.id} className={`flex-1 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition
                  ${isCompleted ? 'bg-emerald-100 text-emerald-700' : isSkipped ? 'bg-gray-100 text-gray-400' : isToday ? 'bg-red-100 text-[#DC2626] ring-2 ring-[#DC2626]/30' : 'bg-gray-50 text-gray-400'}`}>
                  {isCompleted ? '✓' : isSkipped ? '✕' : isToday ? '●' : `D${i + 1}`}
                </div>
              );
            })}
          </div>
          {weekProgress >= 100 && (
            <p className="text-xs text-emerald-600 font-semibold text-center mt-2">🏆 Semana completa! Incrível!</p>
          )}
        </div>
      )}

      {/* Today's workout */}
      {loading ? (
        <div className="glass-card p-5 h-32 animate-pulse" />
      ) : todayWorkout ? (
        <div className={`rounded-2xl overflow-hidden shadow-sm border ${todayWorkout.status === 'COMPLETED' ? 'border-emerald-200' : 'border-[#DC2626]/20'}`}>
          <div className={`px-5 py-3 flex items-center gap-2 ${todayWorkout.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-[#DC2626]'}`}>
            <span className="text-white text-xs font-bold uppercase tracking-wider">
              {todayWorkout.status === 'COMPLETED' ? '✓ Treino concluído!' : '⚡ Treino de hoje'}
            </span>
          </div>
          <div className="bg-white p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{WORKOUT_TYPE_ICON[todayWorkout.type] ?? '🏃'}</span>
                  <h2 className="text-base font-bold text-gray-900">{todayWorkout.title}</h2>
                </div>
                {todayWorkout.description && (
                  <p className="text-xs text-gray-500 leading-relaxed">{todayWorkout.description}</p>
                )}
              </div>
              {todayWorkout.distanceMeters && (
                <div className="text-right ml-3 shrink-0">
                  <p className="text-lg font-bold text-[#DC2626]">{fmt.dist(todayWorkout.distanceMeters)}</p>
                </div>
              )}
            </div>
            {(todayWorkout.status === 'COMPLETED' || todayWorkout.status === 'SKIPPED') && (
              <button onClick={() => onFeedback(todayWorkout)}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer
                  ${todayWorkout.result?.rpe ? 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100' : 'bg-[#DC2626] text-white hover:bg-red-700'}`}>
                {todayWorkout.result?.rpe ? `Feedback enviado · RPE ${todayWorkout.result.rpe} · Editar` : '+ Registrar como foi'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-card p-5 text-center">
          <div className="text-3xl mb-2">🌴</div>
          <p className="text-sm font-semibold text-gray-700">Hoje é dia de descanso</p>
          {tomorrowWorkout && (
            <p className="text-xs text-gray-400 mt-1">Amanhã: {tomorrowWorkout.title}</p>
          )}
        </div>
      )}

      {/* Active plan */}
      {!loading && plan && (
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#DC2626] uppercase tracking-wider">Planilha ativa</p>
            <p className="text-sm font-semibold text-gray-900 truncate">{plan.name}</p>
            <p className="text-xs text-gray-400">{fmt.dateShort(plan.startDate)} → {fmt.dateShort(plan.endDate)} · {plan.weeklyFrequency}x/sem</p>
          </div>
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">Ativa</span>
        </div>
      )}

      {!loading && !plan && (
        <div className="glass-card p-5 text-center border border-dashed border-gray-200">
          <p className="text-sm text-gray-400">Aguardando planilha do seu coach</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Treinos ─────────────────────────────────────────────────────────────

function TreinosTab({ weekly, loading, onFeedback }: {
  weekly: WeeklyData | null;
  loading: boolean;
  onFeedback: (w: Workout) => void;
}) {
  if (loading) return (
    <div className="space-y-3">
      {[1,2,3,4].map(i => <div key={i} className="glass-card p-4 h-20 animate-pulse" />)}
    </div>
  );

  if (!weekly || weekly.workouts.length === 0) return (
    <div className="glass-card p-10 text-center">
      <div className="text-4xl mb-3">🏃</div>
      <p className="text-sm font-semibold text-gray-700">Nenhum treino esta semana</p>
      <p className="text-xs text-gray-400 mt-1">Seu coach ainda não atribuiu treinos para esta semana</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Esta semana</p>
      {weekly.workouts.map((w) => {
        const isToday = fmt.isToday(w.scheduledDate ?? w.date);
        const hasFeedback = w.result?.rpe != null;
        const sensationEmoji = w.result?.sensationScore ? SENSATIONS.find(s => s.score === w.result?.sensationScore)?.emoji : null;
        const canFeedback = w.status === 'COMPLETED' || w.status === 'SKIPPED';

        return (
          <div key={w.id} className={`glass-card p-4 ${isToday ? 'ring-2 ring-[#DC2626]/20' : ''}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg
                ${w.status === 'COMPLETED' ? 'bg-emerald-50' : w.status === 'SKIPPED' ? 'bg-gray-100' : isToday ? 'bg-red-50' : 'bg-gray-50'}`}>
                {w.status === 'COMPLETED' ? '✅' : w.status === 'SKIPPED' ? '⏭️' : WORKOUT_TYPE_ICON[w.type] ?? '🏃'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{w.title}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[w.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {isToday && w.status === 'SCHEDULED' ? 'Hoje' : STATUS_LABEL[w.status] ?? w.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">
                  {fmt.weekday(w.scheduledDate ?? w.date)}
                  {w.distanceMeters ? ` · ${fmt.dist(w.distanceMeters)}` : ''}
                  {w.durationMinutes ? ` · ${w.durationMinutes} min` : ''}
                </p>

                {/* Feedback row */}
                {canFeedback && (
                  <div className="mt-2 flex items-center justify-between">
                    {hasFeedback ? (
                      <div className="flex items-center gap-1.5">
                        {sensationEmoji && <span className="text-sm">{sensationEmoji}</span>}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                          ${(w.result?.rpe ?? 0) >= 8 ? 'bg-red-50 text-red-600' : (w.result?.rpe ?? 0) >= 5 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          RPE {w.result?.rpe}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Sem feedback ainda</span>
                    )}
                    <button onClick={() => onFeedback(w)}
                      className="text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer ml-2">
                      {hasFeedback ? 'Editar' : '+ Feedback'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Nutrição ────────────────────────────────────────────────────────────

function NutricaoTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [totals, setTotals] = useState<NutritionTotals | null>(null);
  const [water, setWater] = useState(0);
  const [waterGoal, setWaterGoal] = useState(3000);
  const [savingMeal, setSavingMeal] = useState(false);
  const [savingWater, setSavingWater] = useState(false);
  const [showMealForm, setShowMealForm] = useState(false);
  const [meal, setMeal] = useState<MealForm>(EMPTY_MEAL);

  useEffect(() => {
    api.get(`/nutrition/day?date=${today}`).then(r => {
      const d = r.data;
      if (d?.totals) setTotals(d.totals);
      if (d?.water?.amount != null) setWater(d.water.amount);
      if (d?.water?.goal != null) setWaterGoal(d.water.goal);
    }).catch(() => {});
  }, [today]);

  const handleAddWater = async (ml: number) => {
    setSavingWater(true);
    const newAmount = water + ml;
    try {
      await api.post('/nutrition/water', { amount: newAmount, date: today });
      setWater(newAmount);
    } catch { /* silent */ } finally { setSavingWater(false); }
  };

  const handleSaveMeal = async () => {
    if (!meal.mealName.trim()) return;
    setSavingMeal(true);
    try {
      await api.post('/nutrition/meal', {
        date: today,
        mealName: meal.mealName.trim(),
        calories: Number(meal.calories) || 0,
        protein: Number(meal.protein) || 0,
        carbs: Number(meal.carbs) || 0,
        fat: Number(meal.fat) || 0,
      });
      const r = await api.get(`/nutrition/day?date=${today}`);
      if (r.data?.totals) setTotals(r.data.totals);
      setMeal(EMPTY_MEAL);
      setShowMealForm(false);
    } catch { alert('Erro ao salvar. Tente novamente.'); } finally { setSavingMeal(false); }
  };

  const waterPercent = Math.min(100, Math.round((water / waterGoal) * 100));

  return (
    <div className="space-y-4">
      {/* Water */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-gray-800">💧 Hidratação</h2>
            <p className="text-xs text-gray-400 mt-0.5">Meta: {(waterGoal / 1000).toFixed(1)}L por dia</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#DC2626]">{water >= 1000 ? `${(water / 1000).toFixed(1)}L` : `${water}ml`}</p>
            <p className="text-xs text-gray-400">{waterPercent}%</p>
          </div>
        </div>

        <div className="h-3 rounded-full bg-gray-100 overflow-hidden mb-4">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${waterPercent}%`, backgroundColor: waterPercent >= 100 ? '#16A34A' : '#3B82F6' }} />
        </div>

        <div className="flex gap-2">
          {WATER_STEPS.map(ml => (
            <button key={ml} onClick={() => handleAddWater(ml)} disabled={savingWater}
              className="flex-1 py-2.5 rounded-xl border border-blue-100 bg-blue-50 text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer disabled:opacity-50">
              +{ml}ml
            </button>
          ))}
        </div>
        {waterPercent >= 100 && (
          <p className="text-xs text-emerald-600 font-semibold text-center mt-3">🎉 Meta atingida! Ótimo trabalho!</p>
        )}
      </div>

      {/* Nutrition */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-800">🥗 Nutrição de hoje</h2>
          <button onClick={() => setShowMealForm(v => !v)}
            className="text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer">
            {showMealForm ? 'Cancelar' : '+ Refeição'}
          </button>
        </div>

        {totals && totals.calories > 0 ? (
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              { label: 'Calorias', value: `${totals.calories} kcal`, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Proteína', value: `${totals.protein.toFixed(0)}g`, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Carboidratos', value: `${totals.carbs.toFixed(0)}g`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Gordura', value: `${totals.fat.toFixed(0)}g`, color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map(item => (
              <div key={item.label} className={`${item.bg} rounded-xl p-3 text-center`}>
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        ) : !showMealForm ? (
          <div className="text-center py-6">
            <p className="text-2xl mb-2">🍽️</p>
            <p className="text-sm text-gray-400">Nenhuma refeição registrada hoje</p>
            <button onClick={() => setShowMealForm(true)}
              className="mt-3 text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer">
              Registrar refeição
            </button>
          </div>
        ) : null}

        {showMealForm && (
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome da refeição *</label>
              <input type="text" placeholder="Ex: Café da manhã, Almoço..."
                value={meal.mealName} onChange={e => setMeal(p => ({ ...p, mealName: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#DC2626]/40" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'calories', label: 'Calorias (kcal)', placeholder: '600' },
                { key: 'protein', label: 'Proteína (g)', placeholder: '40' },
                { key: 'carbs', label: 'Carboidratos (g)', placeholder: '80' },
                { key: 'fat', label: 'Gordura (g)', placeholder: '20' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{field.label}</label>
                  <input type="number" min={0} placeholder={field.placeholder}
                    value={(meal as any)[field.key]}
                    onChange={e => setMeal(p => ({ ...p, [field.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#DC2626]/40" />
                </div>
              ))}
            </div>
            <button onClick={handleSaveMeal} disabled={savingMeal || !meal.mealName.trim()}
              className="w-full py-3 rounded-xl bg-[#DC2626] hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer">
              {savingMeal ? 'Salvando...' : 'Salvar refeição'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Perfil ──────────────────────────────────────────────────────────────

function PerfilTab({ user, stats, plan, onLogout }: {
  user: any;
  stats: Stats | null;
  plan: Plan | null;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Avatar + name */}
      <div className="glass-card p-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-[#DC2626] flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-white text-3xl font-bold">{user?.name?.[0]?.toUpperCase() ?? '?'}</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">{user?.name}</h2>
        <p className="text-sm text-gray-400 mt-0.5">{user?.email}</p>
        <span className="inline-block mt-2 px-3 py-1 rounded-full bg-red-50 text-[#DC2626] text-xs font-semibold">Atleta</span>
      </div>

      {/* Stats */}
      <div className="glass-card p-5">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Meu desempenho</h3>
        <div className="space-y-3">
          {[
            { label: 'Total de km percorridos', value: `${stats?.totalKm?.toFixed(1) ?? '0'} km` },
            { label: 'Treinos concluídos', value: `${stats?.totalWorkouts ?? 0}` },
            { label: 'Pace médio', value: stats?.avgPace ?? '—' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-600">{item.label}</span>
              <span className="text-sm font-bold text-gray-900">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Plan */}
      {plan && (
        <div className="glass-card p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Planilha atual</h3>
          <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
          <p className="text-xs text-gray-400 mt-1">{fmt.dateShort(plan.startDate)} até {fmt.dateShort(plan.endDate)}</p>
          <p className="text-xs text-gray-400">{plan.weeklyFrequency} treinos por semana</p>
        </div>
      )}

      {/* App info */}
      <div className="glass-card p-4 text-center">
        <p className="text-xs text-gray-400 leading-relaxed">
          Para live tracking, mapa de corrida e notificações push, baixe o app mobile da Rafinha Running.
        </p>
      </div>

      {/* Logout */}
      <button onClick={onLogout}
        className="w-full py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer">
        Sair da conta
      </button>
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

type Tab = 'home' | 'treinos' | 'nutricao' | 'perfil';

function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'home', label: 'Início',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
    },
    {
      id: 'treinos', label: 'Treinos',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    },
    {
      id: 'nutricao', label: 'Nutrição',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
    },
    {
      id: 'perfil', label: 'Perfil',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-lg z-40">
      <div className="max-w-2xl mx-auto flex">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => onChange(tab.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition cursor-pointer
              ${active === tab.id ? 'text-[#DC2626]' : 'text-gray-400 hover:text-gray-600'}`}>
            {tab.icon}
            <span className="text-[10px] font-semibold">{tab.label}</span>
            {active === tab.id && <span className="absolute bottom-0 w-10 h-0.5 bg-[#DC2626] rounded-t-full" />}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AthletePortalPage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackWorkout, setFeedbackWorkout] = useState<Workout | null>(null);

  useEffect(() => { loadUser(); }, []);
  useEffect(() => { if (!isAuthenticated) router.replace('/athlete-login'); }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    Promise.all([
      api.get('/workouts/weekly').catch(() => null),
      api.get('/workouts/stats').catch(() => null),
      api.get('/training-plans?status=ACTIVE&limit=1').catch(() => null),
    ]).then(([weeklyRes, statsRes, plansRes]) => {
      if (weeklyRes?.data) setWeekly(weeklyRes.data);
      if (statsRes?.data) setStats(statsRes.data);
      const plans = plansRes?.data;
      if (Array.isArray(plans) && plans.length > 0) setPlan(plans[0]);
    }).finally(() => setLoading(false));
  }, [isAuthenticated]);

  const handleFeedbackSaved = useCallback((workoutId: string, fb: WorkoutResult) => {
    setWeekly(prev => prev ? {
      ...prev,
      workouts: prev.workouts.map(w => w.id === workoutId ? { ...w, result: { ...(w.result ?? {}), ...fb } } : w),
    } : prev);
    setFeedbackWorkout(null);
  }, []);

  const handleLogout = () => {
    logout();
    router.replace('/athlete-login');
  };

  const tabTitles: Record<Tab, string> = {
    home: 'Portal do Atleta',
    treinos: 'Meus Treinos',
    nutricao: 'Nutrição',
    perfil: 'Perfil',
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: 'linear-gradient(160deg, #FEE2E2 0%, #F9FAFB 35%)' }}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between max-w-2xl mx-auto w-full">
        <img src="/logo.png" alt="RR" className="h-7" />
        <span className="text-sm font-semibold text-gray-700">{tabTitles[activeTab]}</span>
        <div className="w-16" />
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5">
        {activeTab === 'home' && (
          <HomeTab
            user={user}
            weekly={weekly}
            stats={stats}
            plan={plan}
            loading={loading}
            onFeedback={setFeedbackWorkout}
          />
        )}
        {activeTab === 'treinos' && (
          <TreinosTab weekly={weekly} loading={loading} onFeedback={setFeedbackWorkout} />
        )}
        {activeTab === 'nutricao' && <NutricaoTab />}
        {activeTab === 'perfil' && (
          <PerfilTab user={user} stats={stats} plan={plan} onLogout={handleLogout} />
        )}
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />

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
