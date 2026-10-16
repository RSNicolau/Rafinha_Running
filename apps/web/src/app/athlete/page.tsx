'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api, friendlyError } from '@/lib/api';
import Link from 'next/link';
import { AdminPreviewBanner } from '@/components/AdminPreviewBanner';
import { LEGAL_ROUTES } from '@/lib/legal';
import MembershipCard from './_components/MembershipCard';
import SupplementsCard from '@/components/nutrition/SupplementsCard';
import { formatKm } from '@/lib/coach-format';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkoutResult {
  rpe?: number | null;
  sensationScore?: number | null;
  athleteFeedback?: string | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  avgPace?: string | null;
  avgHeartRate?: number | null;
  source?: string | null;
}

/** Formato devolvido pela API (/workouts/weekly, /workouts/calendar). */
interface Workout {
  id: string;
  title: string;
  scheduledDate: string;
  type: string;
  description?: string | null;
  targetDistanceMeters?: number | null;
  targetDurationSeconds?: number | null;
  targetPace?: string | null;
  heartRateZone?: string | null;
  coachNotes?: string | null;
  status: string;
  completedAt?: string | null;
  /** Preenchido quando o treino já foi enviado ao Garmin Connect do atleta. */
  garminWorkoutId?: string | null;
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
  status?: string;
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
  SCHEDULED: 'Agendado', COMPLETED: 'Concluído', SKIPPED: 'Pulado', MISSED: 'Perdido', IN_PROGRESS: 'Em andamento',
};

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  EASY_RUN: 'Rodagem leve', EASY: 'Leve', TEMPO: 'Tempo', INTERVAL: 'Intervalado', LONG_RUN: 'Longão', LONG: 'Longo',
  RACE: 'Prova', RECOVERY: 'Recuperação', CROSS_TRAINING: 'Treino cruzado', STRENGTH: 'Força', REST: 'Descanso',
};

const HR_ZONE_LABEL: Record<string, string> = {
  Z1_RECOVERY: 'Z1 · Recuperação',
  Z2_EASY: 'Z2 · Leve',
  Z3_AEROBIC: 'Z3 · Aeróbico',
  Z4_THRESHOLD: 'Z4 · Limiar',
  Z5_MAXIMUM: 'Z5 · Máximo',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Data local 'YYYY-MM-DD' (o navegador do atleta está no fuso dele). */
const localIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayKey = (iso: string) => localIso(new Date(iso));

const fmt = {
  dist: (m: number | null | undefined) => m && m > 0 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : null,
  duration: (s: number | null | undefined) => {
    if (!s || s <= 0) return null;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h${pad2(m)}` : sec ? `${m}min${pad2(sec)}` : `${m} min`;
  },
  dateShort: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  dateLong: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
  weekday: (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short' }),
  isToday: (iso: string) => dayKey(iso) === localIso(new Date()),
  isTomorrow: (iso: string) => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    return dayKey(iso) === localIso(t);
  },
  /** Treino de dia posterior a hoje (não pode receber resultado). */
  isFuture: (iso: string) => dayKey(iso) > localIso(new Date()),
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

/** Distância a exibir: realizada (resultado) ou planejada. */
const workoutDistance = (w: Workout) => (w.result?.distanceMeters && w.result.distanceMeters > 0 ? w.result.distanceMeters : w.targetDistanceMeters) ?? null;

/** Segunda-feira (local) da semana de `d`. */
function mondayOf(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** "45:30" / "1:05:00" / "50" (min) → segundos. */
function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t) * 60;
  const parts = t.split(':').map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

function paceOf(distanceMeters: number, seconds: number) {
  if (!distanceMeters || !seconds) return null;
  const spk = seconds / (distanceMeters / 1000);
  let m = Math.floor(spk / 60), s = Math.round(spk % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${pad2(s)}/km`;
}

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
    } catch (e) { alert(friendlyError(e, 'Não foi possível salvar o feedback. Tente novamente.')); } finally { setSaving(false); }
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


// ─── Detalhe do treino ────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-bold text-gray-900 text-right">{value}</span>
    </div>
  );
}

// ─── Baixar treino para o relógio (.FIT) ─────────────────────────────────────

function fitFileNameFrom(header: unknown, w: Workout): string {
  const m = /filename="?([^";]+)"?/i.exec(typeof header === 'string' ? header : '');
  return m?.[1] || `${String(w.scheduledDate).slice(0, 10)}-treino.fit`;
}

function FitDownloadSection({ workout }: { workout: Workout }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      // Via cliente da API (Bearer + refresh automático do token)
      const res = await api.get(`/workouts/${workout.id}/fit`, { responseType: 'blob' });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/vnd.ant.fit' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fitFileNameFrom(res.headers?.['content-disposition'], workout);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError('Não foi possível baixar o arquivo do treino. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2">
      {workout.garminWorkoutId && (
        <p className="text-xs font-bold text-emerald-700">Enviado ao Garmin ✓</p>
      )}
      <button onClick={download} disabled={downloading}
        className="w-full py-3 rounded-2xl border border-gray-200 bg-white text-gray-800 text-sm font-bold hover:bg-gray-100 transition cursor-pointer disabled:opacity-60 disabled:cursor-wait">
        {downloading ? 'Gerando arquivo…' : 'Baixar para o relógio (.FIT)'}
      </button>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Garmin: copie para a pasta GARMIN/NewFiles via USB ou importe no Garmin Connect. Coros/Suunto: importe pelo app do relógio.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function WorkoutDetailModal({ workout, onClose, onFeedback, onResult }: {
  workout: Workout; onClose: () => void; onFeedback: (w: Workout) => void; onResult: (w: Workout) => void;
}) {
  const future = fmt.isFuture(workout.scheduledDate);
  const r = workout.result;
  const hasResult = !!r && ((r.distanceMeters ?? 0) > 0 || (r.durationSeconds ?? 0) > 0);
  const isDone = workout.status === 'COMPLETED' || workout.status === 'SKIPPED';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5 capitalize">{fmt.dateLong(workout.scheduledDate)}</p>
            <h3 className="text-lg font-black text-gray-900 leading-tight">{workout.title}</h3>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {WORKOUT_TYPE_LABEL[workout.type] && (
                <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600 font-medium">{WORKOUT_TYPE_LABEL[workout.type]}</span>
              )}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${workout.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}>
                {STATUS_LABEL[workout.status] ?? workout.status}
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition cursor-pointer shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {workout.description && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">O que fazer</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{workout.description}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Alvos do treino</p>
            <div className="divide-y divide-gray-50">
              <DetailRow label="Distância" value={fmt.dist(workout.targetDistanceMeters) ?? '—'} />
              <DetailRow label="Duração" value={fmt.duration(workout.targetDurationSeconds) ?? '—'} />
              <DetailRow label="Pace alvo" value={workout.targetPace ? `${workout.targetPace}/km` : '—'} />
              <DetailRow label="Zona de FC" value={workout.heartRateZone ? (HR_ZONE_LABEL[workout.heartRateZone] ?? workout.heartRateZone) : '—'} />
            </div>
          </div>

          {workout.coachNotes && (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1">Recado do treinador</p>
              <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">{workout.coachNotes}</p>
            </div>
          )}

          {workout.status === 'SCHEDULED' && workout.type !== 'REST' && <FitDownloadSection workout={workout} />}

          {hasResult && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Seu resultado</p>
              <div className="divide-y divide-gray-50">
                <DetailRow label="Distância" value={fmt.dist(r?.distanceMeters) ?? '—'} />
                <DetailRow label="Tempo" value={fmt.duration(r?.durationSeconds) ?? '—'} />
                <DetailRow label="Pace médio" value={r?.avgPace ? `${r.avgPace}/km` : '—'} />
                {r?.avgHeartRate ? <DetailRow label="FC média" value={`${r.avgHeartRate} bpm`} /> : null}
                {r?.rpe ? <DetailRow label="Esforço (RPE)" value={r.rpe} /> : null}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-2 space-y-2 border-t border-gray-50">
          {future ? (
            <p className="text-xs text-gray-400 text-center py-2">Você poderá registrar o resultado a partir do dia do treino.</p>
          ) : (
            <>
              {!hasResult && workout.status !== 'SKIPPED' && (
                <button onClick={() => onResult(workout)}
                  className="w-full py-3.5 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-bold transition cursor-pointer">
                  Registrar treino feito
                </button>
              )}
              {hasResult && (
                <button onClick={() => onResult(workout)}
                  className="w-full py-3 rounded-2xl border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 transition cursor-pointer">
                  Editar resultado
                </button>
              )}
              {(isDone || hasResult) && (
                <button onClick={() => onFeedback(workout)}
                  className="w-full py-3 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold transition cursor-pointer">
                  {r?.rpe ? 'Editar feedback (RPE)' : 'Como foi o treino?'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Lançar resultado manual ──────────────────────────────────────────────────

function ResultModal({ workout, onClose, onSaved }: {
  workout: Workout; onClose: () => void; onSaved: (w: Workout) => void;
}) {
  const r = workout.result;
  const [km, setKm] = useState(r?.distanceMeters ? String(r.distanceMeters / 1000).replace('.', ',') : workout.targetDistanceMeters ? String(workout.targetDistanceMeters / 1000).replace('.', ',') : '');
  const [time, setTime] = useState(() => {
    const s = r?.durationSeconds;
    if (!s) return '';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
  });
  const [hr, setHr] = useState(r?.avgHeartRate ? String(r.avgHeartRate) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const distanceMeters = Math.round((Number(km.replace(',', '.')) || 0) * 1000);
  const seconds = parseDuration(time);
  const pace = seconds && distanceMeters ? paceOf(distanceMeters, seconds) : null;

  const handleSave = async () => {
    setError('');
    if (fmt.isFuture(workout.scheduledDate)) { setError('Não é possível registrar o resultado de um treino com data futura.'); return; }
    if (!(distanceMeters > 0)) { setError('Informe a distância em km (ex.: 5,2).'); return; }
    if (distanceMeters > 300000) { setError('Distância muito alta. Confira o valor em km.'); return; }
    if (!seconds || seconds <= 0) { setError('Informe o tempo no formato mm:ss ou h:mm:ss (ex.: 32:15).'); return; }
    if (seconds > 24 * 3600) { setError('Tempo muito alto. Confira o valor.'); return; }
    const hrNum = hr.trim() ? Number(hr) : undefined;
    if (hrNum !== undefined && (!Number.isInteger(hrNum) || hrNum < 30 || hrNum > 250)) { setError('FC média deve estar entre 30 e 250 bpm.'); return; }

    setSaving(true);
    try {
      const { data } = await api.post(`/workouts/${workout.id}/result`, {
        source: 'MANUAL',
        distanceMeters,
        durationSeconds: seconds,
        ...(hrNum !== undefined && { avgHeartRate: hrNum }),
      });
      onSaved({ ...workout, status: 'COMPLETED', result: { ...(workout.result ?? {}), ...(data ?? {}), distanceMeters, durationSeconds: seconds } });
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível salvar o resultado. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Registrar treino feito</p>
          <h3 className="text-base font-bold text-gray-900">{workout.title}</h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-gray-500 mb-1 font-medium">Distância (km)</span>
              <input inputMode="decimal" value={km} onChange={e => setKm(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="5,0"
                className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="block">
              <span className="block text-xs text-gray-500 mb-1 font-medium">Tempo</span>
              <input inputMode="numeric" value={time} onChange={e => setTime(e.target.value.replace(/[^\d:]/g, ''))} placeholder="32:15"
                className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-red-100" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1 font-medium">FC média (opcional, bpm)</span>
            <input inputMode="numeric" value={hr} onChange={e => setHr(e.target.value.replace(/\D/g, ''))} placeholder="150"
              className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-red-100" />
          </label>
          {pace && <p className="text-xs text-gray-500">Pace médio calculado: <strong className="text-gray-900">{pace}</strong></p>}
          {error && <p className="text-xs font-medium text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>
        <div className="px-6 pb-6 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 cursor-pointer">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3.5 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold transition disabled:opacity-40 cursor-pointer">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Home ────────────────────────────────────────────────────────────────

function HomeTab({ user, weekly, stats, plan, loading, onOpen }: {
  user: any; weekly: WeeklyData | null; stats: Stats | null; plan: Plan | null; loading: boolean; onOpen: (w: Workout) => void;
}) {
  const todayWorkout = weekly?.workouts.find(w => fmt.isToday(w.scheduledDate));
  const tomorrowWorkout = weekly?.workouts.find(w => fmt.isTomorrow(w.scheduledDate));
  const weekProgress = weekly ? (weekly.completedCount / Math.max(weekly.totalCount, 1)) * 100 : 0;
  const weeklyKm = stats?.weeklyKm ?? 0;

  return (
    <div className="space-y-5 pb-2">

      {/* Hero */}
      <div className="rounded-3xl bg-gray-900 p-6 relative overflow-hidden">
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
                  <p className="text-xl font-black text-white">{weeklyKm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">km<br/>esta semana</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-xl font-black text-white">{weekly?.completedCount ?? 0}<span className="text-sm text-gray-400">/{weekly?.totalCount ?? 0}</span></p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">treinos<br/>feitos</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-3 text-center">
                  <p className="text-xl font-black text-white">{stats?.totalKm != null ? Math.round(stats.totalKm).toLocaleString('pt-BR') : '0'}</p>
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
            {weekly.workouts.map((w) => {
              const isCompleted = w.status === 'COMPLETED';
              const isToday = fmt.isToday(w.scheduledDate);
              const isSkipped = w.status === 'SKIPPED' || w.status === 'MISSED';
              return (
                <button key={w.id} onClick={() => onOpen(w)} className="flex-1 flex flex-col items-center gap-1.5 cursor-pointer" aria-label={w.title}>
                  <div className={`w-full h-1.5 rounded-full transition-all
                    ${isCompleted ? 'bg-emerald-500' : isSkipped ? 'bg-gray-200' : isToday ? 'bg-[#DC2626]' : 'bg-gray-100'}`} />
                  <span className="text-[10px] text-gray-400 capitalize">{fmt.weekday(w.scheduledDate)}</span>
                </button>
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
        <button onClick={() => onOpen(todayWorkout)} className="w-full text-left bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
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
              {workoutDistance(todayWorkout) ? (
                <div className="text-right ml-4 shrink-0">
                  <p className="text-2xl font-black text-gray-900">{fmt.dist(workoutDistance(todayWorkout))}</p>
                  {todayWorkout.targetPace && <p className="text-xs text-gray-400">pace {todayWorkout.targetPace}/km</p>}
                </div>
              ) : null}
            </div>

            {todayWorkout.description && (
              <p className="text-sm text-gray-500 leading-relaxed border-t border-gray-50 pt-3 mt-1 line-clamp-3">
                {todayWorkout.description}
              </p>
            )}
            <p className="text-xs font-bold text-[#DC2626] mt-3">
              {todayWorkout.status === 'COMPLETED' ? 'Ver detalhes e feedback →' : 'Ver detalhes e registrar →'}
            </p>
          </div>
        </button>
      ) : (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-2xl mb-2">🌿</p>
          <p className="text-sm font-bold text-gray-700">Dia de descanso</p>
          <p className="text-xs text-gray-400 mt-1">Recuperação é parte do treino</p>
          {tomorrowWorkout && (
            <button onClick={() => onOpen(tomorrowWorkout)} className="text-xs text-gray-400 mt-2 cursor-pointer">
              Amanhã: <span className="font-semibold text-gray-600 underline">{tomorrowWorkout.title}</span>
            </button>
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

// ─── Tab: Treinos (semana / mês) ──────────────────────────────────────────────

function WorkoutCard({ w, onOpen }: { w: Workout; onOpen: (w: Workout) => void }) {
  const isToday = fmt.isToday(w.scheduledDate);
  const hasFeedback = w.result?.rpe != null;
  const sensationEmoji = w.result?.sensationScore ? SENSATIONS.find(s => s.score === w.result?.sensationScore)?.emoji : null;
  const isCompleted = w.status === 'COMPLETED';
  const isSkipped = w.status === 'SKIPPED' || w.status === 'MISSED';
  const dist = fmt.dist(workoutDistance(w));

  return (
    <button onClick={() => onOpen(w)} className={`w-full text-left bg-white rounded-3xl p-4 border shadow-sm transition cursor-pointer hover:border-gray-200
      ${isToday && !isCompleted ? 'border-[#DC2626]/20 ring-1 ring-[#DC2626]/10' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3">
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
              {isToday && !isCompleted && !isSkipped ? 'Hoje' : STATUS_LABEL[w.status] ?? w.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">
            {fmt.weekday(w.scheduledDate)} {fmt.dateShort(w.scheduledDate)}
            {WORKOUT_TYPE_LABEL[w.type] ? ` · ${WORKOUT_TYPE_LABEL[w.type]}` : ''}
            {dist ? ` · ${dist}` : ''}
            {w.targetPace && !isCompleted ? ` · ${w.targetPace}/km` : ''}
          </p>
          {(isCompleted || isSkipped) && (
            <div className="mt-2 flex items-center gap-1.5 pt-2 border-t border-gray-50">
              {hasFeedback ? (
                <>
                  {sensationEmoji && <span className="text-sm">{sensationEmoji}</span>}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                    ${(w.result?.rpe ?? 0) >= 8 ? 'bg-red-50 text-red-600' : (w.result?.rpe ?? 0) >= 5 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    RPE {w.result?.rpe}
                  </span>
                </>
              ) : (
                <span className="text-xs text-gray-400">Sem feedback · toque para registrar</span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

const WEEKDAYS_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

function TreinosTab({ refreshKey, onOpen }: { refreshKey: number; onOpen: (w: Workout) => void }) {
  const [view, setView] = useState<'semana' | 'mes'>('semana');
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [month, setMonth] = useState<Date>(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    let from: Date, to: Date;
    if (view === 'semana') {
      from = weekStart;
      to = new Date(weekStart); to.setDate(to.getDate() + 6);
    } else {
      from = month;
      to = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    }
    setLoading(true);
    setError('');
    api.get('/workouts/calendar', { params: { from: localIso(from), to: localIso(to) } })
      .then((r) => setWorkouts(Array.isArray(r.data?.workouts) ? r.data.workouts : []))
      .catch((e) => { setWorkouts([]); setError(friendlyError(e, 'Não foi possível carregar seus treinos.')); })
      .finally(() => setLoading(false));
  }, [view, weekStart, month, refreshKey]);

  const byDay = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of workouts) {
      const k = dayKey(w.scheduledDate);
      map.set(k, [...(map.get(k) ?? []), w]);
    }
    return map;
  }, [workouts]);

  const shiftWeek = (n: number) => setWeekStart((d) => { const x = new Date(d); x.setDate(x.getDate() + 7 * n); return x; });
  const shiftMonth = (n: number) => { setSelectedDay(null); setMonth((d) => new Date(d.getFullYear(), d.getMonth() + n, 1)); };

  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  const title = view === 'semana'
    ? `${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
    : month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Grade do mês (semanas começando na segunda)
  const monthCells: (Date | null)[] = [];
  if (view === 'mes') {
    const lead = (month.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) monthCells.push(null);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) monthCells.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (monthCells.length % 7) monthCells.push(null);
  }
  const todayKey = localIso(new Date());
  const dayList = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {(['semana', 'mes'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {v === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => (view === 'semana' ? shiftWeek(-1) : shiftMonth(-1))} aria-label="Anterior" className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-gray-500 cursor-pointer">‹</button>
          <span className="text-xs font-bold text-gray-700 capitalize min-w-[96px] text-center">{title}</span>
          <button onClick={() => (view === 'semana' ? shiftWeek(1) : shiftMonth(1))} aria-label="Próximo" className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-gray-500 cursor-pointer">›</button>
        </div>
      </div>

      {error && <p className="text-xs font-medium text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

      {view === 'semana' ? (
        loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white rounded-3xl h-20 animate-pulse border border-gray-100" />)}</div>
        ) : workouts.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-gray-100 shadow-sm">
            <p className="text-3xl mb-3">🏃</p>
            <p className="text-sm font-bold text-gray-700">Nenhum treino nesta semana</p>
            <p className="text-xs text-gray-400 mt-1">Quando seu coach publicar a planilha, os treinos aparecem aqui</p>
          </div>
        ) : (
          <div className="space-y-3">{workouts.map((w) => <WorkoutCard key={w.id} w={w} onOpen={onOpen} />)}</div>
        )
      ) : (
        <>
          <div className="bg-white rounded-3xl p-3 border border-gray-100 shadow-sm">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS_SHORT.map((d) => <span key={d} className="text-[10px] text-center font-bold text-gray-400 uppercase">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((d, i) => {
                if (!d) return <div key={i} />;
                const k = localIso(d);
                const list = byDay.get(k) ?? [];
                const done = list.some((w) => w.status === 'COMPLETED');
                const planned = list.length > 0;
                const isSel = selectedDay === k;
                return (
                  <button key={i} onClick={() => setSelectedDay(isSel ? null : k)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-bold transition cursor-pointer
                      ${isSel ? 'bg-gray-900 text-white' : k === todayKey ? 'bg-red-50 text-[#DC2626]' : 'text-gray-700 hover:bg-gray-50'}`}>
                    {d.getDate()}
                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full ${!planned ? 'bg-transparent' : done ? 'bg-emerald-500' : isSel ? 'bg-white' : 'bg-[#DC2626]'}`} />
                  </button>
                );
              })}
            </div>
            {loading && <p className="text-[10px] text-gray-400 text-center mt-2">Carregando...</p>}
            <div className="flex justify-center gap-4 mt-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" /> planejado</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> concluído</span>
            </div>
          </div>
          {selectedDay && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest capitalize">
                {new Date(`${selectedDay}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              {dayList.length === 0 ? (
                <p className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 p-4 text-center">Sem treino neste dia</p>
              ) : dayList.map((w) => <WorkoutCard key={w.id} w={w} onOpen={onOpen} />)}
            </div>
          )}
        </>
      )}
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
  const [meals, setMeals] = useState<{ id: string; mealName: string; calories: number; protein: number; carbs: number; fat: number }[]>([]);
  const [deletingMeal, setDeletingMeal] = useState<string | null>(null);

  const applyDay = (d: any) => {
    if (d?.totals) setTotals(d.totals);
    setMeals(Array.isArray(d?.meals) ? d.meals : []);
    if (d?.water?.amount != null) setWater(d.water.amount);
    if (d?.water?.goal != null) setWaterGoal(d.water.goal);
  };

  useEffect(() => {
    api.get(`/nutrition/day?date=${today}`).then(r => applyDay(r.data)).catch(() => {});
  }, [today]);

  const handleDeleteMeal = async (id: string) => {
    if (!window.confirm('Remover esta refeição?')) return;
    setDeletingMeal(id);
    try {
      await api.delete(`/nutrition/meal/${id}`);
      const r = await api.get(`/nutrition/day?date=${today}`);
      applyDay(r.data);
    } catch (e) { alert(friendlyError(e, 'Não foi possível remover a refeição.')); } finally { setDeletingMeal(null); }
  };

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
      applyDay(r.data);
      setMeal(EMPTY_MEAL);
      setShowMealForm(false);
    } catch (e) { alert(friendlyError(e, 'Não foi possível salvar a refeição.')); } finally { setSavingMeal(false); }
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
        ) : null}

        {meals.length > 0 && (
          <ul className="divide-y divide-gray-100 mb-3">
            {meals.map(m => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{m.mealName}</p>
                  <p className="text-xs text-gray-400">{m.calories} kcal · P {Number(m.protein).toFixed(0)}g · C {Number(m.carbs).toFixed(0)}g · G {Number(m.fat).toFixed(0)}g</p>
                </div>
                <button onClick={() => handleDeleteMeal(m.id)} disabled={deletingMeal === m.id}
                  aria-label={`Remover ${m.mealName}`}
                  className="text-xs font-semibold text-gray-300 hover:text-red-500 cursor-pointer disabled:opacity-50">
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}

        {meals.length === 0 && !showMealForm ? (
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

      <SupplementsCard date={today} compact />

      <Link href="/dashboard/athlete/nutrition" className="block text-center text-xs font-bold text-gray-500 hover:text-gray-900 py-2">
        Abrir nutrição completa →
      </Link>
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
            { label: 'Quilômetros percorridos', value: formatKm(stats?.totalKm ?? 0) },
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

      <MembershipCard />

      {plan && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Planilha atual</p>
          <p className="text-sm font-bold text-gray-900">{plan.name}</p>
          <p className="text-xs text-gray-400 mt-1">{fmt.dateShort(plan.startDate)} até {fmt.dateShort(plan.endDate)}</p>
          <p className="text-xs text-gray-400">{plan.weeklyFrequency} sessões por semana</p>
        </div>
      )}

      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Privacidade e termos</p>
        <div className="divide-y divide-gray-100">
          {[
            { href: '/dashboard/settings', label: 'Editar meus dados' },
            { href: LEGAL_ROUTES.myData, label: 'Meus dados (LGPD)' },
            { href: LEGAL_ROUTES.terms, label: 'Termos de Uso' },
            { href: LEGAL_ROUTES.privacy, label: 'Política de Privacidade' },
          ].map(link => (
            <Link key={link.href} href={link.href}
              className="flex items-center justify-between py-3 text-sm font-medium text-gray-700 hover:text-gray-900 transition">
              {link.label}
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </Link>
          ))}
        </div>
      </div>

      <button onClick={onLogout}
        className="w-full py-4 rounded-2xl border-2 border-gray-200 text-sm font-bold text-gray-500 hover:border-gray-300 hover:text-gray-700 transition cursor-pointer">
        Sair da conta
      </button>
    </div>
  );
}


// ─── Tab: Mais (resto da área do atleta) ─────────────────────────────────────

type MoreLink = { href: string; label: string; desc: string; icon: string };

const MORE_SECTIONS: { title: string; links: MoreLink[] }[] = [
  {
    title: 'Treino e desempenho',
    links: [
      { href: '/dashboard/athlete/training-load', label: 'Carga de treino', desc: 'Fadiga, forma e condicionamento', icon: '📈' },
      { href: '/dashboard/athlete/niche-zones', label: 'Zonas de treino', desc: 'Pace, FC e potência', icon: '🎯' },
      { href: '/dashboard/athlete/badges', label: 'Conquistas', desc: 'Suas medalhas e badges', icon: '🏅' },
      { href: '/dashboard/athlete/ranking', label: 'Ranking da equipe', desc: 'Sua posição no grupo', icon: '🏆' },
      { href: '/dashboard/athlete/group', label: 'Meu grupo', desc: 'Comparação anônima', icon: '👥' },
      { href: '/dashboard/athlete/reports', label: 'Relatórios', desc: 'PDF mensal do seu treino', icon: '📄' },
    ],
  },
  {
    title: 'Comunicação e agenda',
    links: [
      { href: '/dashboard/chat', label: 'Chat com o treinador', desc: 'Converse com seu coach', icon: '💬' },
      { href: '/dashboard/athlete/schedule', label: 'Agendar sessão', desc: 'Horários com o treinador', icon: '📅' },
      { href: '/dashboard/athlete/events', label: 'Eventos e provas', desc: 'Inscrições, QR do kit', icon: '🏁' },
    ],
  },
  {
    title: 'Saúde',
    links: [
      { href: '/dashboard/athlete/nutrition', label: 'Nutrição completa', desc: 'Refeições, água e suplementos', icon: '🥗' },
      { href: '/dashboard/athlete/documents', label: 'Documentos e exames', desc: 'Envie e baixe seus arquivos', icon: '🩺' },
      { href: '/dashboard/integrations', label: 'Integrações', desc: 'Strava e relógios', icon: '⌚' },
    ],
  },
  {
    title: 'Conta',
    links: [
      { href: '/athlete-subscribe', label: 'Mensalidade', desc: 'Plano, pagamento e troca', icon: '💳' },
      { href: '/dashboard/settings', label: 'Meus dados', desc: 'Editar perfil e senha', icon: '👤' },
      { href: '/dashboard/athlete/referrals', label: 'Indicar amigos', desc: 'Ganhe descontos', icon: '🎁' },
      { href: '/dashboard/athlete/testimonial', label: 'Meu depoimento', desc: 'Conte sua experiência', icon: '⭐' },
      { href: LEGAL_ROUTES.myData, label: 'Privacidade (LGPD)', desc: 'Consentimentos e exportação', icon: '🔒' },
    ],
  },
];

function MaisTab() {
  return (
    <div className="space-y-5">
      {MORE_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">{section.title}</p>
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
            {section.links.map((l) => (
              <Link key={l.href} href={l.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition">
                <span className="w-9 h-9 rounded-2xl bg-gray-50 flex items-center justify-center text-lg shrink-0" aria-hidden>{l.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-gray-900">{l.label}</span>
                  <span className="block text-xs text-gray-400 truncate">{l.desc}</span>
                </span>
                <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

type Tab = 'home' | 'treinos' | 'nutricao' | 'mais' | 'perfil';
const TABS: Tab[] = ['home', 'treinos', 'nutricao', 'mais', 'perfil'];

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
      id: 'mais', label: 'Mais',
      icon: (a) => <svg className="w-5 h-5" fill={a ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={a ? 0 : 1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
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
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-1 transition cursor-pointer
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

/** A API de planilhas devolve { data: [...] } (paginado); versões antigas, um array. */
function pickActivePlan(raw: any): Plan | null {
  const list: Plan[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return list.find((p) => p.status === 'ACTIVE') ?? (list.length && !list[0].status ? list[0] : null);
}

export default function AthletePortalPage() {
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [activeTab, setActiveTabState] = useState<Tab>('home');
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackWorkout, setFeedbackWorkout] = useState<Workout | null>(null);
  const [detailWorkout, setDetailWorkout] = useState<Workout | null>(null);
  const [resultWorkout, setResultWorkout] = useState<Workout | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { loadUser(); }, []);

  // Aba inicial pela URL (?tab=mais) — permite voltar das outras páginas para o menu
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      if (t && TABS.includes(t)) setActiveTabState(t);
    } catch {}
  }, []);

  const setActiveTab = (t: Tab) => {
    setActiveTabState(t);
    try {
      const url = new URL(window.location.href);
      if (t === 'home') url.searchParams.delete('tab'); else url.searchParams.set('tab', t);
      url.searchParams.delete('source');
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch {}
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/athlete-login');
    // Treinador que abriu o app instalado (start_url = /athlete) vai para o painel dele.
    // ADMIN/SUPER_ADMIN podem visualizar a área do atleta (modo prévia).
    if (!authLoading && isAuthenticated && user?.role === 'COACH') router.replace('/dashboard');
  }, [isAuthenticated, authLoading, user?.role]);

  const loadData = useCallback(() => {
    return Promise.all([
      api.get('/workouts/weekly').catch(() => null),
      api.get('/workouts/stats').catch(() => null),
      api.get('/training-plans', { params: { limit: 20 } }).catch(() => null),
    ]).then(([weeklyRes, statsRes, plansRes]) => {
      if (weeklyRes?.data) setWeekly(weeklyRes.data);
      if (statsRes?.data) setStats(statsRes.data);
      setPlan(pickActivePlan(plansRes?.data));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();
  }, [isAuthenticated, loadData]);

  const patchWorkout = useCallback((workoutId: string, patch: (w: Workout) => Workout) => {
    setWeekly(prev => prev ? { ...prev, workouts: prev.workouts.map(w => w.id === workoutId ? patch(w) : w) } : prev);
    setDetailWorkout(prev => prev && prev.id === workoutId ? patch(prev) : prev);
  }, []);

  const handleFeedbackSaved = useCallback((workoutId: string, fb: WorkoutResult) => {
    patchWorkout(workoutId, (w) => ({ ...w, result: { ...(w.result ?? {}), ...fb } }));
    setFeedbackWorkout(null);
    setRefreshKey((k) => k + 1);
  }, [patchWorkout]);

  const handleResultSaved = useCallback((updated: Workout) => {
    patchWorkout(updated.id, () => updated);
    setResultWorkout(null);
    setRefreshKey((k) => k + 1);
    loadData(); // atualiza km da semana / contadores
  }, [patchWorkout, loadData]);

  // O store revoga a sessão no servidor e redireciona (atleta → /athlete-login)
  const handleLogout = () => { void logout({ redirectTo: '/athlete-login' }); };

  return (
    <div className="min-h-screen bg-[#F7F7F8] pb-24">
      <AdminPreviewBanner />
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <LogoMark size="sm" />
          <Link href="/dashboard/chat" aria-label="Chat com o treinador" className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-900">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5">
        {activeTab === 'home' && <HomeTab user={user} weekly={weekly} stats={stats} plan={plan} loading={loading} onOpen={setDetailWorkout} />}
        {activeTab === 'treinos' && <TreinosTab refreshKey={refreshKey} onOpen={setDetailWorkout} />}
        {activeTab === 'nutricao' && <NutricaoTab />}
        {activeTab === 'mais' && <MaisTab />}
        {activeTab === 'perfil' && <PerfilTab user={user} stats={stats} plan={plan} onLogout={handleLogout} />}
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />

      {detailWorkout && (
        <WorkoutDetailModal
          workout={detailWorkout}
          onClose={() => setDetailWorkout(null)}
          onFeedback={(w) => setFeedbackWorkout(w)}
          onResult={(w) => setResultWorkout(w)}
        />
      )}
      {resultWorkout && (
        <ResultModal workout={resultWorkout} onClose={() => setResultWorkout(null)} onSaved={handleResultSaved} />
      )}
      {feedbackWorkout && (
        <FeedbackModal workout={feedbackWorkout} onClose={() => setFeedbackWorkout(null)} onSaved={handleFeedbackSaved} />
      )}
    </div>
  );
}
