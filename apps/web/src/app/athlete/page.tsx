'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { AdminPreviewBanner } from '@/components/AdminPreviewBanner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkoutResult {
  rpe?: number | null;
  sensationScore?: number | null;
  athleteFeedback?: string | null;
  distanceMeters?: number | null;
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
}

interface NutritionTotals { calories: number; protein: number; carbs: number; fat: number; }
interface MealForm { mealName: string; calories: number | ''; protein: number | ''; carbs: number | ''; fat: number | ''; }

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
  SCHEDULED: 'Agendado', COMPLETED: 'Concluído', SKIPPED: 'Pulado', IN_PROGRESS: 'Em andamento',
};

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  EASY: 'Leve', TEMPO: 'Tempo', INTERVAL: 'Intervalado', LONG: 'Longo', RACE: 'Corrida', RECOVERY: 'Recuperação', STRENGTH: 'Força',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = {
  dist: (m: number | null | undefined) => m && m > 0 ? `${(m / 1000).toFixed(1)} km` : null,
  dateShort: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  weekday: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short' }),
  isToday: (iso: string) => {
    const d = new Date(iso), t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  },
  isTomorrow: (iso: string) => {
    const d = new Date(iso), t = new Date(); t.setDate(t.getDate() + 1);
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  },
  greet: () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  },
  firstName: (name?: string) => name?.split(' ')[0] ?? '',
  initials: (name?: string) => {
    const parts = (name ?? '').split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0]?.[0] ?? '?').toUpperCase();
  },
};

// ─── Logo Mark ────────────────────────────────────────────────────────────────

function LogoMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <div className={`flex items-center gap-${size === 'lg' ? '3' : '2'}`}>
      <div className={`${size === 'lg' ? 'w-9 h-9' : 'w-7 h-7'} rounded-lg bg-[#DC2626] flex items-center justify-center shrink-0`}>
        <svg viewBox="0 0 28 20" fill="none" className={size === 'lg' ? 'w-5 h-4' : 'w-4 h-3'}>
          <path d="M2 18 L8 2 L14 12 L20 2 L26 18" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <span className={`font-bold tracking-tight text-gray-900 ${size === 'lg' ? 'text-base' : 'text-sm'}`}>
          RAFINHA<span className="text-[#DC2626]"> RUNNING</span>
        </span>
        {size === 'lg' && <span className="text-[10px] text-gray-400 tracking-widest uppercase mt-0.5">Assessoria de Corrida</span>}
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'md' }: { name?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-16 h-16 text-xl' };
  return (
    <div className={`${sizes[size]} rounded-2xl bg-gray-900 flex items-center justify-center shrink-0 font-bold text-white`}>
      {fmt.initials(name)}
    </div>
  );
}

// ─── FeedbackModal ────────────────────────────────────────────────────────────

function FeedbackModal({ workout, onClose, onSaved }: {
  workout: Workout; onClose: () => void; onSaved: (id: string, fb: WorkoutResult) => void;
}) {
  const [rpe, setRpe] = useState<number>(workout.result?.rpe ?? 5);
  const [sensation, setSensation] = useState<number | null>(workout.result?.sensationScore ?? null);
  const [text, setText] = useState(workout.result?.athleteFeedback ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.patch(`/workouts/${workout.id}/feedback`, { rpe, sensationScore: sensation ?? undefined, athleteFeedback: text.trim() || undefined });
      onSaved(workout.id, { rpe, sensationScore: sensation, athleteFeedback: text.trim() || null });
      onClose();
    } catch { alert('Erro ao salvar. Tente novamente.'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Feedback do treino</p>
              <h3 className="text-base font-bold text-gray-900">{workout.title}</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">Esforço percebido (RPE)</p>
              <span className={`text-2xl font-black ${rpe <= 4 ? 'text-emerald-500' : rpe <= 7 ? 'text-amber-500' : 'text-red-500'}`}>{rpe}</span>
            </div>
            <input type="range" min={1} max={10} value={rpe} onChange={e => setRpe(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: rpe <= 4 ? '#16A34A' : rpe <= 7 ? '#D97706' : '#DC2626' }} />
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-gray-400">Muito fácil</span>
              <span className="text-xs text-gray-400">Máximo</span>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Como você se sentiu?</p>
            <div className="flex gap-2">
              {SENSATIONS.map(s => (
                <button key={s.score} onClick={() => setSensation(s.score)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition cursor-pointer
                    ${sensation === s.score ? 'border-[#DC2626] bg-red-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                  <span className="text-xl">{s.emoji}</span>
                  <span className="text-[10px] text-gray-500 font-medium">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Observações</p>
            <textarea value={text} onChange={e => setText(e.target.value)} maxLength={500} rows={2}
              placeholder="Dores, sensações, condições do treino..."
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#DC2626]/30 resize-none bg-gray-50" />
          </div>
        </div>

        <div className="px-6 pb-6">
          <button onClick={handleSubmit} disabled={saving || sensation === null}
            className="w-full py-4 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold tracking-wide transition disabled:opacity-40 cursor-pointer">
            {saving ? 'Salvando...' : 'Registrar feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Home ────────────────────────────────────────────────────────────────

function HomeTab({ user, weekly, stats, plan, loading, onFeedback }: {
  user: any; weekly: WeeklyData | null; stats: Stats | null; plan: Plan | null; loading: boolean; onFeedback: (w: Workout) => void;
}) {
  const todayWorkout = weekly?.workouts.find(w => fmt.isToday(w.scheduledDate ?? w.date));
  const tomorrowWorkout = weekly?.workouts.find(w => fmt.isTomorrow(w.scheduledDate ?? w.date));
  const weekProgress = weekly ? (weekly.completedCount / Math.max(weekly.totalCount, 1)) * 100 : 0;
  const weeklyKm = stats?.weeklyKm ?? 0;

  return (
    <div className="space-y-5 pb-2">

      {/* Hero */}
      <div className="rounded-3xl bg-gray-900 p-6 relative overflow-hidden">
        {/* subtle texture */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle at 80% 20%, #DC2626 0%, transparent 60%), radial-gradient(circle at 20% 80%, #DC2626 0%, transparent 50%)'
        }} />
        <div className="relative">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{fmt.greet()}</p>
          <h1 className="text-3xl font-black text-white mb-0.5 leading-tight">
            {fmt.firstName(user?.name)}
          </h1>
          <p className="text-sm text-gray-400 capitalize mb-5">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>

          <div className="grid grid-cols-3 gap-3">
            {loading ? (
              <>
                {[1,2,3].map(i => <div key={i} className="bg-white/10 rounded-2xl h-16 animate-pulse" />)}
              </>
            ) : (
              <>
                <div className="bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-xl font-black text-white">{weeklyKm.toFixed(1)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">km<br/>esta semana</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-xl font-black text-white">{weekly?.completedCount ?? 0}<span className="text-sm text-gray-400">/{weekly?.totalCount ?? 0}</span></p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">treinos<br/>feitos</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-xl font-black text-white">{stats?.totalKm?.toFixed(0) ?? '0'}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">km<br/>total</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Weekly progress dots */}
      {!loading && weekly && weekly.totalCount > 0 && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Semana atual</p>
            <span className="text-xs font-black text-[#DC2626]">{Math.round(weekProgress)}%</span>
          </div>
          <div className="flex gap-2 mb-3">
            {weekly.workouts.map((w, i) => {
              const isCompleted = w.status === 'COMPLETED';
              const isToday = fmt.isToday(w.scheduledDate ?? w.date);
              const isSkipped = w.status === 'SKIPPED';
              return (
                <div key={w.id} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className={`w-full h-1.5 rounded-full transition-all
                    ${isCompleted ? 'bg-emerald-500' : isSkipped ? 'bg-gray-200' : isToday ? 'bg-[#DC2626]' : 'bg-gray-100'}`} />
                  <span className="text-[10px] text-gray-400 capitalize">{fmt.weekday(w.scheduledDate ?? w.date)}</span>
                </div>
              );
            })}
          </div>
          {weekProgress >= 100 && (
            <p className="text-xs font-bold text-emerald-600 text-center">Semana 100% concluída — excelente!</p>
          )}
        </div>
      )}

      {/* Today's workout */}
      {loading ? (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-36 animate-pulse" />
      ) : todayWorkout ? (
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
          <div className={`px-5 pt-5 pb-4`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${todayWorkout.status === 'COMPLETED' ? 'text-emerald-600' : 'text-[#DC2626]'}`}>
                  {todayWorkout.status === 'COMPLETED' ? '✓ Treino concluído' : 'Treino de hoje'}
                </p>
                <h2 className="text-lg font-black text-gray-900 leading-tight">{todayWorkout.title}</h2>
                {todayWorkout.type && (
                  <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 text-xs text-gray-500 font-medium">
                    {WORKOUT_TYPE_LABEL[todayWorkout.type] ?? todayWorkout.type}
                  </span>
                )}
              </div>
              {todayWorkout.distanceMeters && (
                <div className="text-right ml-4">
                  <p className="text-2xl font-black text-gray-900">{fmt.dist(todayWorkout.distanceMeters)}</p>
                </div>
              )}
            </div>

            {todayWorkout.description && (
              <p className="text-sm text-gray-500 leading-relaxed border-t border-gray-50 pt-3 mt-1">
                {todayWorkout.description}
              </p>
            )}
          </div>

          {(todayWorkout.status === 'COMPLETED' || todayWorkout.status === 'SKIPPED') && (
            <div className="px-5 pb-5">
              <button onClick={() => onFeedback(todayWorkout)}
                className={`w-full py-3 rounded-2xl text-sm font-bold transition cursor-pointer
                  ${todayWorkout.result?.rpe
                    ? 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                    : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                {todayWorkout.result?.rpe
                  ? `Feedback registrado · RPE ${todayWorkout.result.rpe} · Editar`
                  : 'Como foi o treino?'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-2xl mb-2">🌿</p>
          <p className="text-sm font-bold text-gray-700">Dia de descanso</p>
          <p className="text-xs text-gray-400 mt-1">Recuperação é parte do treino</p>
          {tomorrowWorkout && (
            <p className="text-xs text-gray-400 mt-2">Amanhã: <span className="font-semibold text-gray-600">{tomorrowWorkout.title}</span></p>
          )}
        </div>
      )}

      {/* Active plan */}
      {!loading && (
        plan ? (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Planilha ativa</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{plan.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmt.dateShort(plan.startDate)} → {fmt.dateShort(plan.endDate)} · {plan.weeklyFrequency}×/sem</p>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-gray-200 p-5 text-center">
            <p className="text-sm text-gray-400">Aguardando planilha do seu coach</p>
          </div>
        )
      )}
    </div>
  );
}

// ─── Tab: Treinos ─────────────────────────────────────────────────────────────

function TreinosTab({ weekly, loading, onFeedback }: {
  weekly: WeeklyData | null; loading: boolean; onFeedback: (w: Workout) => void;
}) {
  if (loading) return (
    <div className="space-y-3">
      {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-3xl h-20 animate-pulse border border-gray-100" />)}
    </div>
  );

  if (!weekly || weekly.workouts.length === 0) return (
    <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm">
      <p className="text-3xl mb-3">🏃</p>
      <p className="text-sm font-bold text-gray-700">Nenhum treino esta semana</p>
      <p className="text-xs text-gray-400 mt-1">Seu coach atribuirá a planilha em breve</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Esta semana</p>
      {weekly.workouts.map(w => {
        const isToday = fmt.isToday(w.scheduledDate ?? w.date);
        const hasFeedback = w.result?.rpe != null;
        const sensationEmoji = w.result?.sensationScore ? SENSATIONS.find(s => s.score === w.result?.sensationScore)?.emoji : null;
        const canFeedback = w.status === 'COMPLETED' || w.status === 'SKIPPED';
        const isCompleted = w.status === 'COMPLETED';
        const isSkipped = w.status === 'SKIPPED';

        return (
          <div key={w.id} className={`bg-white rounded-3xl p-4 border shadow-sm transition
            ${isToday && !isCompleted ? 'border-[#DC2626]/20 ring-1 ring-[#DC2626]/10' : 'border-gray-100'}`}>
            <div className="flex items-start gap-3">
              {/* Status dot */}
              <div className={`mt-0.5 w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-base
                ${isCompleted ? 'bg-emerald-50 text-emerald-600' : isSkipped ? 'bg-gray-100 text-gray-400' : isToday ? 'bg-red-50' : 'bg-gray-50'}`}>
                {isCompleted ? (
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : isSkipped ? (
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                ) : (
                  <svg className={`w-4 h-4 ${isToday ? 'text-[#DC2626]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-900 truncate">{w.title}</p>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 uppercase tracking-wide
                    ${isCompleted ? 'bg-emerald-50 text-emerald-600' : isSkipped ? 'bg-gray-100 text-gray-400' : isToday ? 'bg-red-50 text-[#DC2626]' : 'bg-gray-50 text-gray-400'}`}>
                    {isToday && !isCompleted && !isSkipped ? 'Hoje' : STATUS_LABEL[w.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">
                  {fmt.weekday(w.scheduledDate ?? w.date)}
                  {WORKOUT_TYPE_LABEL[w.type] ? ` · ${WORKOUT_TYPE_LABEL[w.type]}` : ''}
                  {w.distanceMeters ? ` · ${fmt.dist(w.distanceMeters)}` : ''}
                </p>

                {canFeedback && (
                  <div className="mt-2 flex items-center justify-between pt-2 border-t border-gray-50">
                    {hasFeedback ? (
                      <div className="flex items-center gap-1.5">
                        {sensationEmoji && <span className="text-sm">{sensationEmoji}</span>}
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                          ${(w.result?.rpe ?? 0) >= 8 ? 'bg-red-50 text-red-600' : (w.result?.rpe ?? 0) >= 5 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          RPE {w.result?.rpe}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Sem feedback</span>
                    )}
                    <button onClick={() => onFeedback(w)} className="text-xs font-bold text-gray-500 hover:text-gray-900 transition cursor-pointer">
                      {hasFeedback ? 'Editar' : 'Registrar →'}
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
    } catch { } finally { setSavingWater(false); }
  };

  const handleSaveMeal = async () => {
    if (!meal.mealName.trim()) return;
    setSavingMeal(true);
    try {
      await api.post('/nutrition/meal', { date: today, mealName: meal.mealName.trim(), calories: Number(meal.calories) || 0, protein: Number(meal.protein) || 0, carbs: Number(meal.carbs) || 0, fat: Number(meal.fat) || 0 });
      const r = await api.get(`/nutrition/day?date=${today}`);
      if (r.data?.totals) setTotals(r.data.totals);
      setMeal(EMPTY_MEAL);
      setShowMealForm(false);
    } catch { alert('Erro ao salvar.'); } finally { setSavingMeal(false); }
  };

  const waterPercent = Math.min(100, Math.round((water / waterGoal) * 100));

  return (
    <div className="space-y-4">
      {/* Water */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Hidratação</p>
            <p className="text-sm font-bold text-gray-900">Meta: {(waterGoal / 1000).toFixed(1)}L por dia</p>
          </div>
          <p className="text-3xl font-black text-gray-900">
            {water >= 1000 ? `${(water / 1000).toFixed(1)}L` : `${water}ml`}
          </p>
        </div>

        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-4">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${waterPercent}%`, backgroundColor: waterPercent >= 100 ? '#16A34A' : '#3B82F6' }} />
        </div>

        <div className="flex gap-2">
          {WATER_STEPS.map(ml => (
            <button key={ml} onClick={() => handleAddWater(ml)} disabled={savingWater}
              className="flex-1 py-3 rounded-2xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50">
              + {ml}ml
            </button>
          ))}
        </div>
        {waterPercent >= 100 && <p className="text-xs font-bold text-emerald-600 text-center mt-3">Meta atingida!</p>}
      </div>

      {/* Nutrition */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nutrição de hoje</p>
          <button onClick={() => setShowMealForm(v => !v)} className="text-xs font-bold text-[#DC2626] cursor-pointer">
            {showMealForm ? 'Cancelar' : '+ Refeição'}
          </button>
        </div>

        {totals && totals.calories > 0 ? (
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              { label: 'Calorias', value: `${totals.calories}`, unit: 'kcal', color: 'text-amber-600' },
              { label: 'Proteína', value: `${totals.protein.toFixed(0)}`, unit: 'g', color: 'text-blue-600' },
              { label: 'Carboidratos', value: `${totals.carbs.toFixed(0)}`, unit: 'g', color: 'text-emerald-600' },
              { label: 'Gordura', value: `${totals.fat.toFixed(0)}`, unit: 'g', color: 'text-purple-600' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-2xl p-4">
                <p className={`text-xl font-black ${item.color}`}>{item.value}<span className="text-xs font-medium text-gray-400 ml-0.5">{item.unit}</span></p>
                <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        ) : !showMealForm ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400 mb-3">Nenhuma refeição registrada hoje</p>
            <button onClick={() => setShowMealForm(true)} className="text-xs font-bold text-[#DC2626] cursor-pointer">Registrar agora →</button>
          </div>
        ) : null}

        {showMealForm && (
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <input type="text" placeholder="Nome da refeição"
              value={meal.mealName} onChange={e => setMeal(p => ({ ...p, mealName: e.target.value }))}
              className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-200" />
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'calories', label: 'Calorias (kcal)' }, { key: 'protein', label: 'Proteína (g)' },
                { key: 'carbs', label: 'Carboidratos (g)' }, { key: 'fat', label: 'Gordura (g)' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs text-gray-400 mb-1 font-medium">{field.label}</label>
                  <input type="number" min={0} value={(meal as any)[field.key]}
                    onChange={e => setMeal(p => ({ ...p, [field.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
                </div>
              ))}
            </div>
            <button onClick={handleSaveMeal} disabled={savingMeal || !meal.mealName.trim()}
              className="w-full py-3.5 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold transition disabled:opacity-40 cursor-pointer">
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
  user: any; stats: Stats | null; plan: Plan | null; onLogout: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #DC2626, transparent 60%)' }} />
        <div className="relative flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-white text-2xl font-black">{fmt.initials(user?.name)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-white truncate">{user?.name}</h2>
            <p className="text-sm text-gray-400 truncate">{user?.email}</p>
            <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-gray-300 uppercase tracking-widest">Atleta</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Desempenho</p>
        <div className="space-y-3.5">
          {[
            { label: 'Quilômetros percorridos', value: `${stats?.totalKm?.toFixed(1) ?? '0'} km` },
            { label: 'Treinos concluídos', value: `${stats?.totalWorkouts ?? 0}` },
            { label: 'Pace médio', value: stats?.avgPace ?? '—' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{item.label}</span>
              <span className="text-sm font-black text-gray-900">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {plan && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Planilha atual</p>
          <p className="text-sm font-bold text-gray-900">{plan.name}</p>
          <p className="text-xs text-gray-400 mt-1">{fmt.dateShort(plan.startDate)} até {fmt.dateShort(plan.endDate)}</p>
          <p className="text-xs text-gray-400">{plan.weeklyFrequency} sessões por semana</p>
        </div>
      )}

      <button onClick={onLogout}
        className="w-full py-4 rounded-2xl border-2 border-gray-200 text-sm font-bold text-gray-500 hover:border-gray-300 hover:text-gray-700 transition cursor-pointer">
        Sair da conta
      </button>
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

type Tab = 'home' | 'treinos' | 'nutricao' | 'perfil';

function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
    {
      id: 'home', label: 'Início',
      icon: (a) => <svg className="w-5 h-5" fill={a ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={a ? 0 : 1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
    },
    {
      id: 'treinos', label: 'Treinos',
      icon: (a) => <svg className="w-5 h-5" fill={a ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={a ? 0 : 1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
    },
    {
      id: 'nutricao', label: 'Nutrição',
      icon: (a) => <svg className="w-5 h-5" fill={a ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={a ? 0 : 1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
    },
    {
      id: 'perfil', label: 'Perfil',
      icon: (a) => <svg className="w-5 h-5" fill={a ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={a ? 0 : 1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40 safe-area-bottom">
      <div className="max-w-2xl mx-auto flex">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => onChange(tab.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition cursor-pointer
              ${active === tab.id ? 'text-[#DC2626]' : 'text-gray-400'}`}>
            {tab.icon(active === tab.id)}
            <span className="text-[10px] font-bold tracking-wide">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AthletePortalPage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackWorkout, setFeedbackWorkout] = useState<Workout | null>(null);

  useEffect(() => { loadUser(); }, []);
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/athlete-login');
    // ADMIN preview mode: allow ADMIN/SUPER_ADMIN to view athlete UI
    // (no redirect even if user.role is not ATHLETE)
  }, [isAuthenticated, authLoading]);

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
      ...prev, workouts: prev.workouts.map(w => w.id === workoutId ? { ...w, result: { ...(w.result ?? {}), ...fb } } : w),
    } : prev);
    setFeedbackWorkout(null);
  }, []);

  const handleLogout = () => { logout(); router.replace('/athlete-login'); };

  return (
    <div className="min-h-screen bg-[#F7F7F8] pb-24">
      <AdminPreviewBanner />
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 px-5 py-4">
        <div className="max-w-2xl mx-auto">
          <LogoMark size="sm" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5">
        {activeTab === 'home' && <HomeTab user={user} weekly={weekly} stats={stats} plan={plan} loading={loading} onFeedback={setFeedbackWorkout} />}
        {activeTab === 'treinos' && <TreinosTab weekly={weekly} loading={loading} onFeedback={setFeedbackWorkout} />}
        {activeTab === 'nutricao' && <NutricaoTab />}
        {activeTab === 'perfil' && <PerfilTab user={user} stats={stats} plan={plan} onLogout={handleLogout} />}
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />

      {feedbackWorkout && (
        <FeedbackModal workout={feedbackWorkout} onClose={() => setFeedbackWorkout(null)} onSaved={handleFeedbackSaved} />
      )}
    </div>
  );
}
