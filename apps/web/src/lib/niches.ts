export const NICHES = {
  running: {
    label: 'Corrida',
    icon: '🏃',
    unit: 'km',
    weeklyMetric: 'km/sem',
    workoutLabel: 'corrida',
    planLabel: 'planilha',
    metricsLabel: 'Pace',
    metricsUnit: 'min/km',
    weeklyGoalLabel: 'Meta semanal (km)',
  },
  cycling: {
    label: 'Ciclismo',
    icon: '🚴',
    unit: 'km',
    weeklyMetric: 'km/sem',
    workoutLabel: 'pedal',
    planLabel: 'planilha',
    metricsLabel: 'Velocidade média',
    metricsUnit: 'km/h',
    weeklyGoalLabel: 'Meta semanal (km)',
  },
  swimming: {
    label: 'Natação',
    icon: '🏊',
    unit: 'm',
    weeklyMetric: 'm/sem',
    workoutLabel: 'treino',
    planLabel: 'planilha',
    metricsLabel: 'Pace',
    metricsUnit: 'min/100m',
    weeklyGoalLabel: 'Meta semanal (m)',
  },
  triathlon: {
    label: 'Triátlon',
    icon: '🔺',
    unit: 'km',
    weeklyMetric: 'km/sem',
    workoutLabel: 'treino',
    planLabel: 'planilha',
    metricsLabel: 'Distância total',
    metricsUnit: 'km',
    weeklyGoalLabel: 'Meta semanal (km)',
  },
  crossfit: {
    label: 'CrossFit',
    icon: '🏋️',
    unit: 'WODs',
    weeklyMetric: 'treinos/sem',
    workoutLabel: 'WOD',
    planLabel: 'programação',
    metricsLabel: 'WODs completados',
    metricsUnit: 'WODs',
    weeklyGoalLabel: 'Meta semanal (treinos)',
  },
  other: {
    label: 'Outro',
    icon: '⚡',
    unit: 'treinos',
    weeklyMetric: 'treinos/sem',
    workoutLabel: 'treino',
    planLabel: 'planilha',
    metricsLabel: 'Treinos',
    metricsUnit: 'treinos',
    weeklyGoalLabel: 'Meta semanal',
  },
} as const;

export type NicheKey = keyof typeof NICHES;

export function getNiche(key?: string | null): typeof NICHES[NicheKey] {
  if (key && key in NICHES) return NICHES[key as NicheKey];
  return NICHES.running;
}
