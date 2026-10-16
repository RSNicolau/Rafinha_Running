/**
 * Formatação compartilhada do painel do treinador (datas em America/Sao_Paulo, pace, BRL, níveis, plural).
 */
export const APP_TZ = 'America/Sao_Paulo';

/**
 * Datas "de calendário" (planilha, treino, avaliação) chegam como ISO (12:00 UTC ou, em registros antigos,
 * 00:00 UTC). Exibimos pelo DIA da string ISO para não "voltar um dia" em BRT.
 */
export function formatCalendarDate(
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '—';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return d.toLocaleDateString('pt-BR', { ...opts, timeZone: 'UTC' });
}

/** YYYY-MM-DD de uma data ISO de calendário (para <input type="date">). */
export function calendarInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : '';
}

/** Data/hora de um instante (ex.: criado em), no fuso de São Paulo. */
export function formatInstant(
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { ...opts, timeZone: APP_TZ });
}

/** Hoje (YYYY-MM-DD) em São Paulo. */
export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Segundos por km → "m:ss" (arredonda o total antes de separar: nunca "5:60"). */
export function formatPaceSeconds(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const total = Math.round(secPerKm);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function formatBRLFromCents(cents: number | null | undefined): string {
  if (cents == null || !isFinite(cents)) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
  ELITE: 'Elite',
};

export function levelLabel(level: string | null | undefined): string {
  if (!level) return '—';
  return LEVEL_LABELS[level.toUpperCase()] ?? level;
}

/** "1 corrida perdida" / "2 corridas perdidas". */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export const WORKOUT_TYPE_LABELS: Record<string, string> = {
  EASY_RUN: 'Corrida leve',
  TEMPO: 'Tempo run',
  INTERVAL: 'Intervalado',
  LONG_RUN: 'Longão',
  RECOVERY: 'Regenerativo',
  RACE: 'Prova',
  CROSS_TRAINING: 'Treino cruzado',
  REST: 'Descanso',
};

export const HR_ZONE_LABELS: Record<string, string> = {
  Z1_RECOVERY: 'Z1 · Recuperação',
  Z2_EASY: 'Z2 · Leve',
  Z3_AEROBIC: 'Z3 · Aeróbico',
  Z4_THRESHOLD: 'Z4 · Limiar',
  Z5_MAXIMUM: 'Z5 · Máximo',
};

export const PLAN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
};

export const WORKOUT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendado',
  COMPLETED: 'Realizado',
  SKIPPED: 'Pulado',
  MISSED: 'Perdido',
};

/** Erro de IA não configurada (503 da API). */
export function isAiNotConfigured(e: unknown): boolean {
  const err = e as any;
  return err?.response?.status === 503 && /IA não configurada/i.test(String(err?.response?.data?.message ?? ''));
}

/** Número em pt-BR com casas fixas (75,7). */
export function formatNumberBR(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Quilômetros em pt-BR: formatKm(75.66) → "75,7 km". */
export function formatKm(km: number | null | undefined, digits = 1): string {
  return `${formatNumberBR(km, digits)} km`;
}

/** Metros → km em pt-BR: formatMetersAsKm(5230) → "5,2 km" (abaixo de 1 km: "850 m" se metersBelowKm). */
export function formatMetersAsKm(meters: number | null | undefined, digits = 1, metersBelowKm = false): string {
  const m = Number(meters ?? 0);
  if (metersBelowKm && m < 1000) return `${Math.round(m)} m`;
  return formatKm(m / 1000, digits);
}
