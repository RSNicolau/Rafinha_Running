export const APP_NAME = 'RR - Rafinha Running';

export const LOCALE = 'pt-BR';
export const CURRENCY = 'BRL';
export const DATE_FORMAT = 'dd/MM/yyyy';
export const TIMEZONE = 'America/Sao_Paulo';

export const BRAND_COLORS = {
  primary: '#DC2626',
  primaryDark: '#B91C1C',
  primaryLight: '#EF4444',
  secondary: '#FFFFFF',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

export const WORKOUT_TYPE_LABELS: Record<string, string> = {
  EASY_RUN: 'Corrida Leve',
  TEMPO: 'Tempo Run',
  INTERVAL: 'Intervalado',
  LONG_RUN: 'Longão',
  RECOVERY: 'Recuperação',
  RACE: 'Prova',
  CROSS_TRAINING: 'Treino Cruzado',
  REST: 'Descanso',
};

export const WORKOUT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendado',
  COMPLETED: 'Concluído',
  SKIPPED: 'Pulado',
  MISSED: 'Perdido',
};

export const HR_ZONE_LABELS: Record<string, string> = {
  Z1_RECOVERY: 'Z1 - Recuperação',
  Z2_EASY: 'Z2 - Leve',
  Z3_AEROBIC: 'Z3 - Aeróbico',
  Z4_THRESHOLD: 'Z4 - Limiar',
  Z5_MAXIMUM: 'Z5 - Máximo',
};

export const ATHLETE_LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
  ELITE: 'Elite',
};

export const API_PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};
