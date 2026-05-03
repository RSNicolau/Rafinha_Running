'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface Meal {
  id: string;
  mealName: string;
  mealTime?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  date: string;
}

interface DaySummary {
  date: string;
  meals: Meal[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
  water: { amount: number; goal: number };
}

interface MealFormState {
  mealType: string;
  description: string;
  calories: string;
  carbs: string;
  protein: string;
  fat: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Café da manhã', icon: '🌅' },
  { value: 'lunch', label: 'Almoço', icon: '☀️' },
  { value: 'snack', label: 'Lanche', icon: '🍎' },
  { value: 'dinner', label: 'Jantar', icon: '🌙' },
  { value: 'supper', label: 'Ceia', icon: '⭐' },
];

const CALORIE_GOAL = 2000;
const WATER_GOAL_ML = 2000;

function getMealIcon(mealTime: string | null | undefined): string {
  if (!mealTime) return '🍽️';
  const found = MEAL_TYPES.find((m) => m.value === mealTime);
  return found ? found.icon : '🍽️';
}

function getMealLabel(mealTime: string | null | undefined): string {
  if (!mealTime) return 'Refeição';
  const found = MEAL_TYPES.find((m) => m.value === mealTime);
  return found ? found.label : mealTime;
}

// ── Water Card ────────────────────────────────────────────────────────────────

function WaterCard({
  waterAmount,
  waterGoal,
  onAdd,
  adding,
}: {
  waterAmount: number;
  waterGoal: number;
  onAdd: (ml: number) => void;
  adding: boolean;
}) {
  const pct = Math.min(100, Math.round((waterAmount / waterGoal) * 100));
  const remaining = Math.max(0, waterGoal - waterAmount);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Hidratação</h2>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {waterAmount} <span className="text-sm font-normal text-gray-400">/ {waterGoal} ml</span>
          </p>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
          <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c0 0-6 7.5-6 12a6 6 0 0012 0C18 10.5 12 3 12 3z" />
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-3 mb-3 overflow-hidden">
        <div
          className="h-3 rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mb-5">
        {pct}% da meta diária
        {remaining > 0 ? ` — faltam ${remaining} ml` : ' — meta atingida!'}
      </p>

      {/* Quick-add buttons */}
      <div className="flex gap-2 flex-wrap">
        {[200, 350, 500].map((ml) => (
          <button
            key={ml}
            onClick={() => onAdd(ml)}
            disabled={adding}
            className="flex-1 min-w-[70px] py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition disabled:opacity-50 cursor-pointer"
          >
            +{ml} ml
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Calorie Summary ───────────────────────────────────────────────────────────

function CalorieSummary({ totals }: { totals: DaySummary['totals'] }) {
  const pct = Math.min(100, Math.round((totals.calories / CALORIE_GOAL) * 100));

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Resumo Calórico</h2>

      <div className="flex items-end gap-2 mb-3">
        <span className="text-3xl font-bold text-gray-900">{totals.calories}</span>
        <span className="text-sm text-gray-400 mb-1">/ {CALORIE_GOAL} kcal</span>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2.5 mb-5 overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${
            pct > 100 ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Carboidratos', value: totals.carbs, unit: 'g', color: 'text-amber-600 bg-amber-50' },
          { label: 'Proteína', value: totals.protein, unit: 'g', color: 'text-blue-600 bg-blue-50' },
          { label: 'Gordura', value: totals.fat, unit: 'g', color: 'text-rose-600 bg-rose-50' },
        ].map((macro) => (
          <div key={macro.label} className={`rounded-xl p-3 text-center ${macro.color.split(' ')[1]}`}>
            <p className={`text-lg font-bold ${macro.color.split(' ')[0]}`}>
              {macro.value.toFixed(1)}<span className="text-xs font-normal">{macro.unit}</span>
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">{macro.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Meal List ─────────────────────────────────────────────────────────────────

function MealList({
  meals,
  onDelete,
  deleting,
}: {
  meals: Meal[];
  onDelete: (id: string) => void;
  deleting: string | null;
}) {
  if (meals.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-3xl mb-2">🍽️</p>
        <p className="text-sm text-gray-400">Nenhuma refeição registrada hoje</p>
        <p className="text-xs text-gray-300 mt-1">Use o formulário abaixo para adicionar</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {meals.map((meal) => (
        <div
          key={meal.id}
          className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition"
        >
          <span className="text-2xl leading-none mt-0.5">{getMealIcon(meal.mealTime)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {getMealLabel(meal.mealTime)}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900 mt-1 break-words">{meal.mealName}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
              <span className="font-medium text-gray-700">{meal.calories} kcal</span>
              <span>C: {meal.carbs.toFixed(1)}g</span>
              <span>P: {meal.protein.toFixed(1)}g</span>
              <span>G: {meal.fat.toFixed(1)}g</span>
            </div>
          </div>
          <button
            onClick={() => onDelete(meal.id)}
            disabled={deleting === meal.id}
            className="text-gray-300 hover:text-red-400 transition shrink-0 cursor-pointer disabled:opacity-50"
            title="Remover"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Add Meal Form ─────────────────────────────────────────────────────────────

function AddMealForm({
  onAdd,
  adding,
}: {
  onAdd: (form: MealFormState) => void;
  adding: boolean;
}) {
  const [form, setForm] = useState<MealFormState>({
    mealType: 'breakfast',
    description: '',
    calories: '',
    carbs: '',
    protein: '',
    fat: '',
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [aiHint, setAiHint] = useState('');
  const [showMfpModal, setShowMfpModal] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyzeWithAI = useCallback(async (description: string) => {
    if (!description.trim() || description.trim().length < 3) return;
    setAnalyzing(true);
    setAiHint('');
    try {
      const { data } = await api.post('/nutrition/analyze', { description });
      if (data.calories > 0) {
        setForm(f => ({
          ...f,
          calories: String(data.calories),
          protein: String(data.protein),
          carbs: String(data.carbs),
          fat: String(data.fat),
        }));
        setAiHint(data.analysis || '');
      }
    } catch { /* silent */ }
    finally { setAnalyzing(false); }
  }, []);

  const handleDescriptionChange = (val: string) => {
    setForm(f => ({ ...f, description: val }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 4) {
      debounceRef.current = setTimeout(() => analyzeWithAI(val), 1200);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) return;
    onAdd(form);
    setForm({ mealType: 'breakfast', description: '', calories: '', carbs: '', protein: '', fat: '' });
    setAiHint('');
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Adicionar Refeição</h2>
        <button
          type="button"
          onClick={() => setShowMfpModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-100 bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
          MyFitnessPal
        </button>
      </div>

      {/* MFP Modal */}
      {showMfpModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowMfpModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">M</div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">MyFitnessPal</p>
                <p className="text-xs text-gray-400">Integração de nutrição</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
              <p className="text-xs text-amber-700 font-medium mb-1">API descontinuada</p>
              <p className="text-xs text-amber-600">O MyFitnessPal encerrou sua API pública em 2020. Não é possível sincronizar automaticamente.</p>
            </div>
            <p className="text-xs text-gray-600 mb-4">Nossa IA calcula os macros automaticamente ao digitar a descrição da refeição — tão rápido quanto o MFP!</p>
            <div className="flex gap-2">
              <button onClick={() => setShowMfpModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Fechar</button>
              <a href="https://www.myfitnesspal.com/account/export" target="_blank" rel="noopener noreferrer" className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium text-center hover:bg-blue-700 transition">Exportar MFP CSV →</a>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Tipo de refeição</label>
          <select
            value={form.mealType}
            onChange={(e) => setForm((f) => ({ ...f, mealType: e.target.value }))}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
          >
            {MEAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Descrição</label>
          <div className="relative">
            <input
              type="text"
              value={form.description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Ex: Arroz, feijão e frango grelhado (IA calcula automaticamente)"
              required
              className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
            />
            {analyzing && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin inline-block" />
              </div>
            )}
          </div>
          {aiHint && (
            <p className="text-xs text-indigo-500 mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              {aiHint}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Calorias {analyzing ? <span className="text-indigo-400 ml-1">calculando...</span> : <span className="text-gray-300">(auto-calculado pela IA)</span>}
          </label>
          <input
            type="number"
            value={form.calories}
            onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))}
            placeholder="Ex: 450"
            min="0"
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'carbs' as const, label: 'Carb. (g)' },
            { key: 'protein' as const, label: 'Proteína (g)' },
            { key: 'fat' as const, label: 'Gordura (g)' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
              <input
                type="number"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder="0"
                min="0"
                step="0.1"
                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
              />
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={adding || !form.description.trim()}
          className="w-full bg-indigo-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
        >
          {adding && (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          Registrar Refeição
        </button>
      </form>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NutritionPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingMeal, setAddingMeal] = useState(false);
  const [addingWater, setAddingWater] = useState(false);
  const [deletingMeal, setDeletingMeal] = useState<string | null>(null);

  const fetchDay = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const { data } = await api.get<DaySummary>(`/nutrition/day?date=${date}`);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDay(selectedDate);
  }, [selectedDate, fetchDay]);

  const handleAddWater = async (ml: number) => {
    if (!summary) return;
    setAddingWater(true);
    try {
      const newAmount = summary.water.amount + ml;
      await api.post('/nutrition/water', {
        amount: newAmount,
        date: selectedDate,
      });
      setSummary((prev) =>
        prev
          ? { ...prev, water: { ...prev.water, amount: newAmount } }
          : prev,
      );
    } catch {
      // silent
    } finally {
      setAddingWater(false);
    }
  };

  const handleAddMeal = async (form: MealFormState) => {
    setAddingMeal(true);
    try {
      const { data } = await api.post<Meal>('/nutrition/meal', {
        date: selectedDate,
        mealName: form.description,
        mealTime: form.mealType,
        calories: form.calories ? parseInt(form.calories, 10) : 0,
        protein: form.protein ? parseFloat(form.protein) : 0,
        carbs: form.carbs ? parseFloat(form.carbs) : 0,
        fat: form.fat ? parseFloat(form.fat) : 0,
      });
      setSummary((prev) => {
        if (!prev) return prev;
        const meals = [...prev.meals, data];
        const totals = meals.reduce(
          (acc, m) => ({
            calories: acc.calories + m.calories,
            protein: acc.protein + m.protein,
            carbs: acc.carbs + m.carbs,
            fat: acc.fat + m.fat,
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 },
        );
        return { ...prev, meals, totals };
      });
    } catch {
      // silent
    } finally {
      setAddingMeal(false);
    }
  };

  const handleDeleteMeal = async (id: string) => {
    setDeletingMeal(id);
    try {
      await api.delete(`/nutrition/meal/${id}`);
      setSummary((prev) => {
        if (!prev) return prev;
        const meals = prev.meals.filter((m) => m.id !== id);
        const totals = meals.reduce(
          (acc, m) => ({
            calories: acc.calories + m.calories,
            protein: acc.protein + m.protein,
            carbs: acc.carbs + m.carbs,
            fat: acc.fat + m.fat,
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 },
        );
        return { ...prev, meals, totals };
      });
    } catch {
      // silent
    } finally {
      setDeletingMeal(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Nutrição</h1>
          <p className="text-sm text-gray-500 mt-1">Acompanhe sua alimentação e hidratação diária</p>
        </div>

        {/* Date picker */}
        <input
          type="date"
          value={selectedDate}
          max={today}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3.5 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 h-48 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Water */}
            <WaterCard
              waterAmount={summary?.water.amount ?? 0}
              waterGoal={summary?.water.goal ?? WATER_GOAL_ML}
              onAdd={handleAddWater}
              adding={addingWater}
            />

            {/* Calorie Summary */}
            <CalorieSummary totals={summary?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }} />
          </div>

          {/* Meal List */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">
              Refeições do dia
              {summary && summary.meals.length > 0 && (
                <span className="ml-2 text-gray-300 normal-case font-normal">({summary.meals.length})</span>
              )}
            </h2>
            <MealList
              meals={summary?.meals ?? []}
              onDelete={handleDeleteMeal}
              deleting={deletingMeal}
            />
          </div>

          {/* Add Meal Form */}
          <AddMealForm onAdd={handleAddMeal} adding={addingMeal} />
        </div>
      )}
    </div>
  );
}
