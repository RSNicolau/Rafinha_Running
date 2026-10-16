'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, friendlyError } from '@/lib/api';
import AthletePicker from '@/components/coach/AthletePicker';
import {
  calendarInputValue,
  formatCalendarDate,
  HR_ZONE_LABELS,
  PLAN_STATUS_LABELS,
  WORKOUT_STATUS_LABELS,
  WORKOUT_TYPE_LABELS,
} from '@/lib/coach-format';

interface WorkoutResult {
  distanceMeters: number;
  durationSeconds: number;
  avgPace?: string | null;
  rpe?: number | null;
}

interface PlanWorkout {
  id: string;
  scheduledDate: string;
  type: string;
  title: string;
  description?: string | null;
  targetDistanceMeters?: number | null;
  targetDurationSeconds?: number | null;
  targetPace?: string | null;
  heartRateZone?: string | null;
  coachNotes?: string | null;
  status: string;
  result?: WorkoutResult | null;
}

interface PlanDetail {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  startDate: string;
  endDate: string;
  weeklyFrequency: number;
  athlete: { id: string; name: string; email?: string };
  coach?: { id: string; name: string } | null;
  workouts: PlanWorkout[];
  completedWorkouts: number;
  totalWorkouts: number;
  completionPercentage: number;
  canManage: boolean;
}

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-blue-50 text-blue-700',
};

const W_STATUS_CLASSES: Record<string, string> = {
  SCHEDULED: 'bg-gray-100 text-gray-600',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  SKIPPED: 'bg-amber-50 text-amber-700',
  MISSED: 'bg-red-50 text-red-600',
};

const inputClass = 'w-full px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40';
const labelClass = 'block text-xs font-medium text-gray-500 mb-1';

function fmtKm(m?: number | null) {
  if (!m) return null;
  return `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`;
}
function fmtDur(s?: number | null) {
  if (!s) return null;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m} min`;
}

/** "45" → 2700s; "1:15" → 4500s (h:mm); vazio → null. */
function parseDuration(v: string): number | null | 'invalid' {
  const t = v.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10) * 60;
  const m = /^(\d+):([0-5]\d)$/.exec(t);
  if (m) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60;
  return 'invalid';
}
function durationToInput(s?: number | null) {
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : String(m);
}

// ─── Workout modal ────────────────────────────────────────────────────────────

interface WorkoutForm {
  scheduledDate: string;
  type: string;
  title: string;
  distanceKm: string;
  duration: string;
  targetPace: string;
  heartRateZone: string;
  description: string;
  coachNotes: string;
}

function WorkoutModal({
  initial, minDate, maxDate, onClose, onSave, saving, error,
}: {
  initial: WorkoutForm & { id?: string };
  minDate?: string;
  maxDate?: string;
  onClose: () => void;
  onSave: (f: WorkoutForm) => void;
  saving: boolean;
  error: string;
}) {
  const [f, setF] = useState<WorkoutForm>(initial);
  const set = (k: keyof WorkoutForm, v: string) => setF((p) => ({ ...p, [k]: v }));
  const outOfRange = (minDate && f.scheduledDate && f.scheduledDate < minDate) || (maxDate && f.scheduledDate && f.scheduledDate > maxDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">{initial.id ? 'Editar treino' : 'Novo treino'}</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSave(f); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="w-date">Data *</label>
              <input id="w-date" type="date" required value={f.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="w-type">Tipo *</label>
              <select id="w-type" value={f.type} onChange={(e) => set('type', e.target.value)} className={inputClass}>
                {Object.entries(WORKOUT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          {outOfRange && <p className="text-xs text-amber-600">Atenção: a data está fora do período da planilha.</p>}
          <div>
            <label className={labelClass} htmlFor="w-title">Título</label>
            <input id="w-title" value={f.title} maxLength={150} onChange={(e) => set('title', e.target.value)} placeholder={WORKOUT_TYPE_LABELS[f.type]} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass} htmlFor="w-dist">Distância (km)</label>
              <input id="w-dist" inputMode="decimal" value={f.distanceKm} onChange={(e) => set('distanceKm', e.target.value)} placeholder="ex.: 8" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="w-dur">Duração (min ou h:mm)</label>
              <input id="w-dur" value={f.duration} onChange={(e) => set('duration', e.target.value)} placeholder="ex.: 45 ou 1:15" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="w-pace">Pace alvo (m:ss/km)</label>
              <input id="w-pace" value={f.targetPace} onChange={(e) => set('targetPace', e.target.value)} placeholder="ex.: 5:30" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="w-zone">Zona de FC</label>
            <select id="w-zone" value={f.heartRateZone} onChange={(e) => set('heartRateZone', e.target.value)} className={inputClass}>
              <option value="">—</option>
              {Object.entries(HR_ZONE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="w-desc">Descrição / instruções</label>
            <textarea id="w-desc" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Ex.: 10 min aquecimento + 6x800m Z4 com 2 min de trote" className={`${inputClass} resize-none`} />
          </div>
          <div>
            <label className={labelClass} htmlFor="w-notes">Notas do treinador</label>
            <textarea id="w-notes" rows={2} value={f.coachNotes} onChange={(e) => set('coachNotes', e.target.value)} className={`${inputClass} resize-none`} />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 cursor-pointer">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer">
              {saving ? 'Salvando...' : 'Salvar treino'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [workoutModal, setWorkoutModal] = useState<(WorkoutForm & { id?: string }) | null>(null);
  const [workoutError, setWorkoutError] = useState('');
  const [savingWorkout, setSavingWorkout] = useState(false);

  const [editMeta, setEditMeta] = useState<{ name: string; description: string; startDate: string; endDate: string; weeklyFrequency: string } | null>(null);
  const [metaError, setMetaError] = useState('');
  const [dupModal, setDupModal] = useState<{ athleteId: string; athleteName: string; startDate: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Ativar pausa as outras planilhas ATIVAS do atleta (regra da API) → confirmação explícita antes
  const [activateConfirm, setActivateConfirm] = useState<{ others: { id: string; name: string; coachName?: string | null }[]; checkFailed?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<PlanDetail>(`/training-plans/${id}`);
      setPlan(data);
      setLoadError('');
    } catch (e: any) {
      setLoadError(e?.response?.status === 404 ? 'Planilha não encontrada ou você não tem acesso a ela.' : friendlyError(e, 'Erro ao carregar a planilha.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const weeks = useMemo(() => {
    if (!plan) return [] as { label: string; items: PlanWorkout[] }[];
    const start = Date.parse(`${plan.startDate.slice(0, 10)}T12:00:00Z`);
    const groups = new Map<number, PlanWorkout[]>();
    for (const w of plan.workouts) {
      const d = Date.parse(`${w.scheduledDate.slice(0, 10)}T12:00:00Z`);
      const wk = Math.floor((d - start) / (7 * 86400000));
      groups.set(wk, [...(groups.get(wk) ?? []), w]);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([wk, items]) => ({ label: wk < 0 ? 'Antes do início' : `Semana ${wk + 1}`, items }));
  }, [plan]);

  const changeStatus = async (status: PlanDetail['status'], pausedCount = 0) => {
    if (!plan) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.put(`/training-plans/${plan.id}`, { status });
      await load();
      setNotice({
        type: 'success',
        text: status === 'ACTIVE' ? `Planilha ativada — o atleta já vê os treinos no app.${pausedCount ? ` ${pausedCount === 1 ? '1 outra planilha foi pausada' : `${pausedCount} outras planilhas foram pausadas`}.` : ''}`
          : status === 'PAUSED' ? 'Planilha pausada.'
          : status === 'COMPLETED' ? 'Planilha concluída.' : 'Status atualizado.',
      });
    } catch (e) {
      setNotice({ type: 'error', text: friendlyError(e, 'Não foi possível alterar o status.') });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Antes de ativar/retomar: consulta as outras planilhas ATIVAS do atleta.
   * A API mantém só uma ativa por atleta e PAUSA as demais (inclusive de outro treinador) ao ativar esta.
   */
  const requestActivate = async () => {
    if (!plan) return;
    setBusy(true);
    setNotice(null);
    try {
      const { data } = await api.get('/training-plans', { params: { athleteId: plan.athlete.id, status: 'ACTIVE', limit: 50 } });
      const rows: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      const others = rows
        .filter((r) => r?.id && r.id !== plan.id)
        .map((r) => ({ id: r.id, name: r.name ?? 'Planilha', coachName: r.coach?.name ?? null }));
      if (others.length === 0) {
        setBusy(false);
        await changeStatus('ACTIVE');
        return;
      }
      setActivateConfirm({ others });
    } catch {
      // Sem como checar: confirma mesmo assim, avisando da regra
      setActivateConfirm({ others: [], checkFailed: true });
    } finally {
      setBusy(false);
    }
  };

  const saveWorkout = async (f: WorkoutForm) => {
    if (!plan || !workoutModal) return;
    setWorkoutError('');
    const dist = f.distanceKm.trim() ? Number(f.distanceKm.replace(',', '.')) : null;
    if (dist !== null && (!isFinite(dist) || dist < 0 || dist > 500)) { setWorkoutError('Distância inválida.'); return; }
    const dur = parseDuration(f.duration);
    if (dur === 'invalid') { setWorkoutError('Duração inválida — use minutos (45) ou h:mm (1:15).'); return; }
    const pace = f.targetPace.trim();
    if (pace && !/^\d{1,2}:[0-5]\d$/.test(pace)) { setWorkoutError('Pace alvo deve estar no formato m:ss (ex.: 5:30).'); return; }
    if (!f.scheduledDate) { setWorkoutError('Informe a data do treino.'); return; }

    const body: Record<string, unknown> = {
      scheduledDate: f.scheduledDate,
      type: f.type,
      ...(f.title.trim() ? { title: f.title.trim() } : {}),
      description: f.description.trim() || (workoutModal.id ? null : undefined),
      targetDistanceMeters: dist !== null ? Math.round(dist * 1000) : (workoutModal.id ? null : undefined),
      targetDurationSeconds: dur !== null ? dur : (workoutModal.id ? null : undefined),
      targetPace: pace || (workoutModal.id ? null : undefined),
      heartRateZone: f.heartRateZone || (workoutModal.id ? null : undefined),
      coachNotes: f.coachNotes.trim() || (workoutModal.id ? null : undefined),
    };
    setSavingWorkout(true);
    try {
      if (workoutModal.id) await api.patch(`/training-plans/${plan.id}/workouts/${workoutModal.id}`, body);
      else await api.post(`/training-plans/${plan.id}/workouts`, body);
      setWorkoutModal(null);
      await load();
      setNotice({ type: 'success', text: workoutModal.id ? 'Treino atualizado.' : 'Treino adicionado.' });
    } catch (e) {
      setWorkoutError(friendlyError(e, 'Não foi possível salvar o treino.'));
    } finally {
      setSavingWorkout(false);
    }
  };

  const deleteWorkout = async (w: PlanWorkout) => {
    if (!plan) return;
    if (!window.confirm(`Excluir o treino "${w.title}" de ${formatCalendarDate(w.scheduledDate)}?`)) return;
    try {
      await api.delete(`/training-plans/${plan.id}/workouts/${w.id}`);
      await load();
      setNotice({ type: 'success', text: 'Treino excluído.' });
    } catch (e) {
      setNotice({ type: 'error', text: friendlyError(e, 'Não foi possível excluir o treino.') });
    }
  };

  const saveMeta = async () => {
    if (!plan || !editMeta) return;
    setMetaError('');
    if (!editMeta.name.trim()) { setMetaError('Informe o nome.'); return; }
    if (editMeta.endDate < editMeta.startDate) { setMetaError('A data de fim deve ser igual ou posterior à data de início.'); return; }
    setBusy(true);
    try {
      await api.put(`/training-plans/${plan.id}`, {
        name: editMeta.name.trim(),
        description: editMeta.description.trim(),
        startDate: editMeta.startDate,
        endDate: editMeta.endDate,
        weeklyFrequency: parseInt(editMeta.weeklyFrequency, 10) || plan.weeklyFrequency,
      });
      setEditMeta(null);
      await load();
      setNotice({ type: 'success', text: 'Planilha atualizada.' });
    } catch (e) {
      setMetaError(friendlyError(e, 'Não foi possível salvar.'));
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    if (!plan || !dupModal) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/training-plans/${plan.id}/duplicate`, {
        athleteId: dupModal.athleteId || undefined,
        startDate: dupModal.startDate || undefined,
        name: dupModal.name.trim() || undefined,
      });
      setDupModal(null);
      router.push(`/dashboard/plans/${data.id}`);
    } catch (e) {
      setNotice({ type: 'error', text: friendlyError(e, 'Não foi possível duplicar a planilha.') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await api.delete(`/training-plans/${plan.id}`);
      router.push('/dashboard/plans');
    } catch (e) {
      setNotice({ type: 'error', text: friendlyError(e, 'Não foi possível excluir a planilha.') });
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-gray-100 rounded" />
        <div className="h-28 bg-gray-100 rounded-2xl" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (loadError || !plan) {
    return (
      <div className="text-center py-24">
        <p className="text-gray-500 mb-4">{loadError || 'Planilha não encontrada.'}</p>
        <Link href="/dashboard/plans" className="text-sm text-primary hover:underline">Voltar para planilhas</Link>
      </div>
    );
  }

  const blankWorkout = (): WorkoutForm => ({
    scheduledDate: calendarInputValue(plan.startDate),
    type: 'EASY_RUN', title: '', distanceKm: '', duration: '', targetPace: '', heartRateZone: '', description: '', coachNotes: '',
  });

  return (
    <div>
      <Link href="/dashboard/plans" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
        ← Planilhas
      </Link>

      {/* Header */}
      <div className="glass-card p-5 sm:p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 break-words">{plan.name}</h1>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_CLASSES[plan.status]}`}>{PLAN_STATUS_LABELS[plan.status]}</span>
            </div>
            {plan.description && <p className="text-sm text-gray-500 mb-2 whitespace-pre-line">{plan.description}</p>}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
              <span>Atleta: <Link href={`/dashboard/athletes/${plan.athlete.id}`} className="font-medium text-gray-700 hover:text-primary">{plan.athlete.name}</Link></span>
              <span>{formatCalendarDate(plan.startDate)} → {formatCalendarDate(plan.endDate)}</span>
              <span>{plan.weeklyFrequency}x/semana</span>
              {plan.coach?.name && <span>Criada por {plan.coach.name}</span>}
            </div>
          </div>

          {plan.canManage && (
            <div className="flex flex-wrap gap-2">
              {(plan.status === 'DRAFT' || plan.status === 'PAUSED') && (
                <button disabled={busy} onClick={requestActivate} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer">
                  {plan.status === 'PAUSED' ? 'Retomar' : 'Ativar'}
                </button>
              )}
              {plan.status === 'ACTIVE' && (
                <button disabled={busy} onClick={() => changeStatus('PAUSED')} className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-medium disabled:opacity-50 cursor-pointer">Pausar</button>
              )}
              {(plan.status === 'ACTIVE' || plan.status === 'PAUSED') && (
                <button disabled={busy} onClick={() => changeStatus('COMPLETED')} className="px-4 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium disabled:opacity-50 cursor-pointer">Concluir</button>
              )}
              <button
                onClick={() => { setMetaError(''); setEditMeta({ name: plan.name, description: plan.description ?? '', startDate: calendarInputValue(plan.startDate), endDate: calendarInputValue(plan.endDate), weeklyFrequency: String(plan.weeklyFrequency) }); }}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 cursor-pointer"
              >Editar</button>
              <button
                onClick={() => setDupModal({ athleteId: plan.athlete.id, athleteName: plan.athlete.name, startDate: '', name: `${plan.name} (cópia)` })}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 cursor-pointer"
              >Duplicar</button>
              <button onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 cursor-pointer">Excluir</button>
            </div>
          )}
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{plan.completedWorkouts} de {plan.totalWorkouts} treinos realizados</span>
            <span>{plan.completionPercentage}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${plan.completionPercentage}%` }} />
          </div>
        </div>
        {!plan.canManage && (
          <p className="mt-3 text-xs text-gray-400">Somente leitura — apenas o treinador do atleta ou a gestão da equipe pode alterar esta planilha.</p>
        )}
      </div>

      {notice && (
        <div role="status" className={`mb-4 px-4 py-3 rounded-xl text-sm ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {notice.text}
        </div>
      )}

      {/* Workouts */}
      <div className="glass-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Treinos ({plan.workouts.length})</h2>
          {plan.canManage && (
            <button onClick={() => { setWorkoutError(''); setWorkoutModal(blankWorkout()); }} className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium cursor-pointer">
              + Adicionar treino
            </button>
          )}
        </div>

        {plan.workouts.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-500">Nenhum treino nesta planilha ainda.</p>
            {plan.canManage && <p className="text-xs text-gray-400 mt-1">Adicione os treinos e depois clique em &quot;Ativar&quot; para o atleta recebê-los.</p>}
          </div>
        ) : (
          <div className="space-y-6">
            {weeks.map((wk) => (
              <div key={wk.label}>
                <p className="text-xs font-semibold text-gray-500 mb-2">{wk.label}</p>
                <ul className="space-y-2">
                  {wk.items.map((w) => {
                    const done = !!w.result || w.status === 'COMPLETED';
                    const targets = [fmtKm(w.targetDistanceMeters), fmtDur(w.targetDurationSeconds), w.targetPace ? `${w.targetPace}/km` : null, w.heartRateZone ? HR_ZONE_LABELS[w.heartRateZone] : null].filter(Boolean);
                    return (
                      <li key={w.id} className="flex flex-col sm:flex-row sm:items-start gap-3 p-3.5 rounded-xl border border-gray-100">
                        <div className="sm:w-28 shrink-0 text-xs text-gray-500">
                          <p className="font-semibold text-gray-700 capitalize">{formatCalendarDate(w.scheduledDate, { weekday: 'short', day: '2-digit', month: 'short' })}</p>
                          <span className={`inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${W_STATUS_CLASSES[w.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {WORKOUT_STATUS_LABELS[w.status] ?? w.status}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {w.title} <span className="text-xs font-normal text-gray-400">· {WORKOUT_TYPE_LABELS[w.type] ?? w.type}</span>
                          </p>
                          {targets.length > 0 && <p className="text-xs text-gray-500 mt-0.5">Alvo: {targets.join(' · ')}</p>}
                          {w.description && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{w.description}</p>}
                          {w.coachNotes && <p className="text-xs text-gray-400 mt-1">Notas: {w.coachNotes}</p>}
                          {w.result && (
                            <p className="text-xs text-emerald-700 mt-1">
                              Realizado: {fmtKm(w.result.distanceMeters) ?? '—'} · {fmtDur(w.result.durationSeconds) ?? '—'}
                              {w.result.avgPace ? ` · ${w.result.avgPace}/km` : ''}{w.result.rpe != null ? ` · RPE ${w.result.rpe}` : ''}
                            </p>
                          )}
                        </div>
                        {plan.canManage && !done && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setWorkoutError('');
                                setWorkoutModal({
                                  id: w.id,
                                  scheduledDate: calendarInputValue(w.scheduledDate),
                                  type: w.type,
                                  title: w.title,
                                  distanceKm: w.targetDistanceMeters ? String(w.targetDistanceMeters / 1000) : '',
                                  duration: durationToInput(w.targetDurationSeconds),
                                  targetPace: w.targetPace ?? '',
                                  heartRateZone: w.heartRateZone ?? '',
                                  description: w.description ?? '',
                                  coachNotes: w.coachNotes ?? '',
                                });
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 cursor-pointer"
                            >Editar</button>
                            <button onClick={() => deleteWorkout(w)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer">Excluir</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {workoutModal && (
        <WorkoutModal
          key={workoutModal.id ?? 'new'}
          initial={workoutModal}
          minDate={calendarInputValue(plan.startDate)}
          maxDate={calendarInputValue(plan.endDate)}
          onClose={() => setWorkoutModal(null)}
          onSave={saveWorkout}
          saving={savingWorkout}
          error={workoutError}
        />
      )}

      {editMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Editar planilha</h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass} htmlFor="m-name">Nome</label>
                <input id="m-name" value={editMeta.name} maxLength={150} onChange={(e) => setEditMeta({ ...editMeta, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="m-desc">Descrição</label>
                <textarea id="m-desc" rows={3} value={editMeta.description} onChange={(e) => setEditMeta({ ...editMeta, description: e.target.value })} className={`${inputClass} resize-none`} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="m-start">Início</label>
                  <input id="m-start" type="date" value={editMeta.startDate} onChange={(e) => setEditMeta({ ...editMeta, startDate: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="m-end">Fim</label>
                  <input id="m-end" type="date" min={editMeta.startDate} value={editMeta.endDate} onChange={(e) => setEditMeta({ ...editMeta, endDate: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="m-freq">Treinos por semana</label>
                <input id="m-freq" type="number" min={1} max={7} value={editMeta.weeklyFrequency} onChange={(e) => setEditMeta({ ...editMeta, weeklyFrequency: e.target.value })} className={inputClass} />
              </div>
              {metaError && <p role="alert" className="text-sm text-red-600">{metaError}</p>}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditMeta(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 cursor-pointer">Cancelar</button>
              <button onClick={saveMeta} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50 cursor-pointer">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {dupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Duplicar como modelo</h3>
            <p className="text-sm text-gray-500 mb-4">Copia todos os treinos (como agendados) para uma nova planilha em rascunho.</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Atleta</label>
                <AthletePicker value={dupModal.athleteId} initialLabel={dupModal.athleteName} onChange={(a) => setDupModal({ ...dupModal, athleteId: a?.id ?? '', athleteName: a?.name ?? '' })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="d-name">Nome</label>
                <input id="d-name" value={dupModal.name} maxLength={150} onChange={(e) => setDupModal({ ...dupModal, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="d-start">Nova data de início (opcional)</label>
                <input id="d-start" type="date" value={dupModal.startDate} onChange={(e) => setDupModal({ ...dupModal, startDate: e.target.value })} className={inputClass} />
                <p className="text-[11px] text-gray-400 mt-1">Os treinos são deslocados mantendo os mesmos intervalos.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDupModal(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 cursor-pointer">Cancelar</button>
              <button onClick={duplicate} disabled={busy || !dupModal.athleteId} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50 cursor-pointer">Duplicar</button>
            </div>
          </div>
        </div>
      )}

      {activateConfirm && plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="activate-title">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 id="activate-title" className="text-lg font-semibold text-gray-900 mb-2">
              {plan.status === 'PAUSED' ? 'Retomar' : 'Ativar'} esta planilha?
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              Cada atleta tem só uma planilha ativa por vez. Ao ativar &quot;{plan.name}&quot;, as outras planilhas ativas de {plan.athlete.name} serão <strong>pausadas automaticamente</strong>.
            </p>
            {activateConfirm.others.length > 0 ? (
              <ul className="mb-4 space-y-1.5 rounded-xl border border-amber-100 bg-amber-50 p-3">
                {activateConfirm.others.map((o) => (
                  <li key={o.id} className="text-sm text-amber-900">
                    <span className="font-medium">{o.name}</span>
                    {o.coachName && <span className="text-amber-700"> · criada por {o.coachName}</span>}
                  </li>
                ))}
              </ul>
            ) : activateConfirm.checkFailed ? (
              <p className="mb-4 text-xs text-amber-700 rounded-xl bg-amber-50 border border-amber-100 p-3">
                Não foi possível verificar se o atleta tem outra planilha ativa.
              </p>
            ) : null}
            <p className="text-xs text-gray-400 mb-5">
              Se você excluir esta planilha depois, a anterior não volta sozinha — será preciso retomá-la manualmente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setActivateConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 cursor-pointer">Cancelar</button>
              <button
                onClick={async () => { const n = activateConfirm.others.length; setActivateConfirm(null); await changeStatus('ACTIVE', n); }}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
              >
                {activateConfirm.others.length > 0 ? 'Ativar e pausar as outras' : 'Ativar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="alertdialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Excluir planilha?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Os treinos ainda não realizados serão removidos. Treinos já realizados continuam no histórico do atleta.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 cursor-pointer">Cancelar</button>
              <button onClick={remove} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 cursor-pointer">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
