/**
 * Converts RR Workout model → Garmin Connect Training API JSON format.
 *
 * Reference: Garmin Connect Developer Program - Training API
 * Workout JSON spec reverse-engineered from community tools + official docs.
 *
 * REGRA: nunca inventar passos que o treinador não definiu. A estrutura (aquecimento / repetições /
 * recuperação / desaquecimento) só existe quando está ESCRITA de forma explícita e interpretável na
 * descrição (ex.: "aquecimento 15min", "6x800m", "2min de trote", "desaquecimento 10min").
 * Caso contrário: UM passo com a distância/duração alvo (aberto se nenhuma), com alvo de pace/FC só se
 * o treinador definiu. O mesmo modelo (buildWorkoutStructure) alimenta o push Garmin e o arquivo .FIT.
 */

import { Workout, HeartRateZone } from '@prisma/client';

// --- Garmin JSON Types ---

interface GarminSportType {
  sportTypeId: number;
  sportTypeKey: string;
  displayOrder: number;
}

interface GarminStepType {
  stepTypeId: number;
  stepTypeKey: string;
  displayOrder: number;
}

interface GarminCondition {
  conditionTypeId: number;
  conditionTypeKey: string;
  displayable: boolean;
}

interface GarminTarget {
  workoutTargetTypeId: number;
  workoutTargetTypeKey: string;
  displayOrder: number;
}

interface GarminUnit {
  unitId: number;
  unitKey: string;
  factor: number;
}

interface GarminExecutableStep {
  type: 'ExecutableStepDTO';
  stepId: null;
  stepOrder: number;
  stepType: GarminStepType;
  childStepId: number;
  description: string;
  endCondition: GarminCondition;
  endConditionValue: string;
  preferredEndConditionUnit?: GarminUnit;
  targetType: GarminTarget;
  targetValueOne?: number;
  targetValueTwo?: number;
  zoneNumber?: string;
  equipmentType: { equipmentTypeId: number; displayOrder: number };
}

interface GarminRepeatGroup {
  type: 'RepeatGroupDTO';
  stepOrder: number;
  stepType: GarminStepType;
  childStepId: number;
  numberOfIterations: number;
  workoutSteps: GarminExecutableStep[];
  endConditionValue: string;
  endCondition: GarminCondition;
}

type GarminStep = GarminExecutableStep | GarminRepeatGroup;

interface GarminWorkoutSegment {
  segmentOrder: number;
  sportType: GarminSportType;
  workoutSteps: GarminStep[];
}

export interface GarminWorkoutPayload {
  workoutId: null;
  ownerId: null;
  workoutName: string;
  description: string;
  sportType: GarminSportType;
  workoutSegments: GarminWorkoutSegment[];
  avgTrainingSpeed: number;
  estimatedDistanceUnit: { unitId: null; unitKey: null; factor: null };
  shared: boolean;
}

// --- Constants ---

const RUNNING_SPORT: GarminSportType = {
  sportTypeId: 1,
  sportTypeKey: 'running',
  displayOrder: 1,
};

const STEP_TYPES = {
  warmup: { stepTypeId: 0, stepTypeKey: 'warmup', displayOrder: 0 },
  interval: { stepTypeId: 1, stepTypeKey: 'interval', displayOrder: 1 },
  cooldown: { stepTypeId: 2, stepTypeKey: 'cooldown', displayOrder: 2 },
  rest: { stepTypeId: 5, stepTypeKey: 'rest', displayOrder: 5 },
  repeat: { stepTypeId: 6, stepTypeKey: 'repeat', displayOrder: 6 },
} as const;

const CONDITIONS = {
  lapButton: { conditionTypeId: 1, conditionTypeKey: 'lap.button', displayable: true },
  time: { conditionTypeId: 2, conditionTypeKey: 'time', displayable: true },
  distance: { conditionTypeId: 3, conditionTypeKey: 'distance', displayable: true },
  iterations: { conditionTypeId: 7, conditionTypeKey: 'iterations', displayable: false },
  fixedRest: { conditionTypeId: 8, conditionTypeKey: 'fixed.rest', displayable: true },
} as const;

const TARGETS = {
  noTarget: { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target', displayOrder: 1 },
  pace: { workoutTargetTypeId: 6, workoutTargetTypeKey: 'pace.zone', displayOrder: 6 },
  heartRateZone: { workoutTargetTypeId: 4, workoutTargetTypeKey: 'heart.rate.zone', displayOrder: 4 },
} as const;

const METER_UNIT: GarminUnit = { unitId: 1, unitKey: 'meter', factor: 100.0 };

const NO_EQUIPMENT = { equipmentTypeId: 0, displayOrder: 0 };

// --- Helper Functions ---

/** Map our HeartRateZone enum to Garmin zone number (1-5) */
function hrZoneToNumber(zone?: HeartRateZone | null): string | undefined {
  if (!zone) return undefined;
  const map: Record<HeartRateZone, string> = {
    Z1_RECOVERY: '1',
    Z2_EASY: '2',
    Z3_AEROBIC: '3',
    Z4_THRESHOLD: '4',
    Z5_MAXIMUM: '5',
  };
  return map[zone];
}

/** Convert pace string "5:30" (min:sec per km) → seconds per meter for Garmin target */
function paceToSecondsPerMeter(pace?: string | null): { low: number; high: number } | null {
  if (!pace) return null;
  const parts = pace.split(':');
  if (parts.length !== 2) return null;
  const totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  const secPerMeter = totalSeconds / 1000;
  // Allow ±15 sec/km tolerance
  const tolerance = 15 / 1000;
  return { low: secPerMeter - tolerance, high: secPerMeter + tolerance };
}

function makeStep(
  order: number,
  stepType: GarminStepType,
  endCondition: GarminCondition,
  endConditionValue: string,
  description: string,
  target: GarminTarget = TARGETS.noTarget as any,
  extra: Partial<GarminExecutableStep> = {},
): GarminExecutableStep {
  return {
    type: 'ExecutableStepDTO',
    stepId: null,
    stepOrder: order,
    stepType: { ...stepType },
    childStepId: 0,
    description,
    endCondition: { ...endCondition },
    endConditionValue,
    targetType: { ...target },
    equipmentType: { ...NO_EQUIPMENT },
    ...extra,
  };
}

// --- Modelo de passos compartilhado (Garmin push + arquivo .FIT) ---

export type RRStepKind = 'warmup' | 'active' | 'rest' | 'cooldown';

export type RRStepDuration =
  | { type: 'time'; seconds: number }
  | { type: 'distance'; meters: number }
  | { type: 'open' };

export interface RRStep {
  kind: RRStepKind;
  name: string;
  duration: RRStepDuration;
  /** Alvo — só 'pace'/'hr' quando o treinador definiu targetPace / heartRateZone. */
  target: 'pace' | 'hr' | 'none';
  /** Instruções do treinador (descrição) anexadas ao passo principal. */
  notes?: string;
}

export interface RRRepeat {
  repeat: number;
  steps: RRStep[];
}

export type RRStructureItem = RRStep | RRRepeat;

export function isRepeat(item: RRStructureItem): item is RRRepeat {
  return (item as RRRepeat).repeat !== undefined;
}

export interface RRWorkoutStructure {
  /** true quando a estrutura veio de texto explícito da descrição. */
  explicit: boolean;
  items: RRStructureItem[];
}

type StructureInput = Pick<
  Workout,
  'title' | 'description' | 'targetDistanceMeters' | 'targetDurationSeconds' | 'targetPace' | 'heartRateZone'
>;

const NUM = '(\\d+(?:[.,]\\d+)?)';

function toNumber(v: string): number {
  return parseFloat(v.replace(',', '.'));
}

/** "15" + "min" → duração; "2" + "km" → distância. Null se não interpretável. */
function toDuration(value: string, unitRaw: string): RRStepDuration | null {
  const n = toNumber(value);
  if (!(n > 0)) return null;
  const unit = unitRaw.toLowerCase();
  if (unit === 'min' || unit === "'") return { type: 'time', seconds: Math.round(n * 60) };
  if (unit === 's' || unit === 'seg' || unit === '"') return { type: 'time', seconds: Math.round(n) };
  if (unit === 'km') return { type: 'distance', meters: Math.round(n * 1000) };
  if (unit === 'm') return { type: 'distance', meters: Math.round(n) };
  return null;
}

function durationLabel(d: RRStepDuration): string {
  if (d.type === 'distance') return d.meters >= 1000 ? `${d.meters / 1000} km` : `${d.meters} m`;
  if (d.type === 'time') return d.seconds % 60 === 0 ? `${d.seconds / 60} min` : `${d.seconds} s`;
  return '';
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/×/g, 'x');
}

function matchFirst(text: string, patterns: RegExp[]): RegExpExecArray | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m;
  }
  return null;
}

/** Quantidade + unidade antes/depois de uma palavra-chave (ex.: "aquecimento 15min" | "15min de aquecimento"). */
function keywordDuration(text: string, keyword: string): RRStepDuration | null {
  const unit = "(min|km|m|s|seg)\\b";
  const m = matchFirst(text, [
    new RegExp(`${keyword}\\w*\\s*(?:de\\s*|:\\s*)?${NUM}\\s*${unit}`),
    new RegExp(`${NUM}\\s*${unit}\\s*(?:de\\s*)?${keyword}`),
  ]);
  return m ? toDuration(m[1], m[2]) : null;
}

/**
 * Lê estrutura EXPLÍCITA da descrição do treinador. Reconhece:
 *  - aquecimento: "aquecimento 15min", "15min de aquecimento", "aquecer 2km";
 *  - desaquecimento: "desaquecimento 10min", "10min de desaquecimento", "volta a calma 5min";
 *  - repetições: "6x800m", "5 x 1km", "8x1min", "10x30s";
 *  - recuperação entre repetições: "2min de trote", "pausa 90s", "recuperação 200m", "descanso de 1min".
 * Devolve null se nada disso estiver escrito.
 */
export function parseExplicitStructure(description: string | null | undefined): {
  warmup?: RRStepDuration;
  cooldown?: RRStepDuration;
  repeat?: { reps: number; work: RRStepDuration; rest?: RRStepDuration };
} | null {
  if (!description || !description.trim()) return null;
  const text = normalize(description);

  // "(?<!des)" evita que "desaquecimento" conte como aquecimento
  const warmup = keywordDuration(text, '(?<!des)aquec') ?? undefined;
  const cooldown =
    keywordDuration(text, 'desaquec') ?? keywordDuration(text, 'volta a calma') ?? undefined;

  let repeat: { reps: number; work: RRStepDuration; rest?: RRStepDuration } | undefined;
  const rep = new RegExp(`(\\d{1,2})\\s*x\\s*${NUM}\\s*(km|m|min|s|seg|'|")(?![a-z])`).exec(text);
  if (rep) {
    const reps = parseInt(rep[1], 10);
    const work = toDuration(rep[2], rep[3]);
    if (work && reps >= 1 && reps <= 50) {
      const afterRep = text.slice(rep.index + rep[0].length);
      const restKw = '(?:pausa|intervalo|recupera\\w*|descanso|trote|rec\\b)';
      const restM = matchFirst(afterRep, [
        new RegExp(`${restKw}\\s*(?:de\\s*|:\\s*)?${NUM}\\s*(min|s|seg|m|km)\\b`),
        new RegExp(`${NUM}\\s*(min|s|seg|m|km)\\s*(?:de\\s*)?${restKw}`),
      ]);
      const rest = restM ? toDuration(restM[1], restM[2]) ?? undefined : undefined;
      repeat = { reps, work, ...(rest ? { rest } : {}) };
    }
  }

  if (!warmup && !cooldown && !repeat) return null;
  return { warmup, cooldown, repeat };
}

/** Estrutura de passos do treino — explícita (descrição) ou passo único com os alvos do treinador. */
export function buildWorkoutStructure(workout: StructureInput): RRWorkoutStructure {
  const target: RRStep['target'] = paceToSecondsPerMeter(workout.targetPace)
    ? 'pace'
    : workout.heartRateZone
      ? 'hr'
      : 'none';
  const notes = workout.description?.trim() || undefined;
  const parsed = parseExplicitStructure(workout.description);

  if (!parsed) {
    let duration: RRStepDuration = { type: 'open' };
    if (workout.targetDistanceMeters && workout.targetDistanceMeters > 0) {
      duration = { type: 'distance', meters: workout.targetDistanceMeters };
    } else if (workout.targetDurationSeconds && workout.targetDurationSeconds > 0) {
      duration = { type: 'time', seconds: workout.targetDurationSeconds };
    }
    return {
      explicit: false,
      items: [{ kind: 'active', name: workout.title, duration, target, ...(notes ? { notes } : {}) }],
    };
  }

  const items: RRStructureItem[] = [];
  if (parsed.warmup) {
    items.push({ kind: 'warmup', name: 'Aquecimento', duration: parsed.warmup, target: 'none' });
  }
  if (parsed.repeat) {
    const steps: RRStep[] = [
      {
        kind: 'active',
        name: `${parsed.repeat.reps}x ${durationLabel(parsed.repeat.work)}`,
        duration: parsed.repeat.work,
        target,
        ...(notes ? { notes } : {}),
      },
    ];
    if (parsed.repeat.rest) {
      steps.push({ kind: 'rest', name: 'Recuperação', duration: parsed.repeat.rest, target: 'none' });
    }
    items.push({ repeat: parsed.repeat.reps, steps });
  } else {
    // Só aquecimento/desaquecimento escritos: o bloco principal fica aberto (botão de volta), com os alvos do treinador
    items.push({ kind: 'active', name: workout.title, duration: { type: 'open' }, target, ...(notes ? { notes } : {}) });
  }
  if (parsed.cooldown) {
    items.push({ kind: 'cooldown', name: 'Desaquecimento', duration: parsed.cooldown, target: 'none' });
  }
  return { explicit: true, items };
}

// --- Main Converter ---

export function convertWorkoutToGarmin(workout: Workout): GarminWorkoutPayload {
  const structure = buildWorkoutStructure(workout);
  const hrZone = hrZoneToNumber(workout.heartRateZone);
  const paceTarget = paceToSecondsPerMeter(workout.targetPace);

  const toGarminStep = (step: RRStep, order: number): GarminExecutableStep => {
    const stepType =
      step.kind === 'warmup' ? STEP_TYPES.warmup
        : step.kind === 'cooldown' ? STEP_TYPES.cooldown
          : step.kind === 'rest' ? STEP_TYPES.rest
            : STEP_TYPES.interval;

    let endCondition: GarminCondition = { ...CONDITIONS.lapButton };
    let endConditionValue = '0';
    const extra: Partial<GarminExecutableStep> = {};
    if (step.duration.type === 'time') {
      endCondition = { ...CONDITIONS.time };
      endConditionValue = `${step.duration.seconds}.0`;
    } else if (step.duration.type === 'distance') {
      endCondition = { ...CONDITIONS.distance };
      endConditionValue = `${step.duration.meters}.0`;
      extra.preferredEndConditionUnit = { ...METER_UNIT };
    }

    const garminStep = makeStep(
      order,
      stepType as any,
      endCondition,
      endConditionValue,
      step.name.slice(0, 100),
      TARGETS.noTarget as any,
      extra,
    );
    if (step.target === 'pace' && paceTarget) {
      garminStep.targetType = { ...TARGETS.pace } as any;
      garminStep.targetValueOne = paceTarget.low;
      garminStep.targetValueTwo = paceTarget.high;
    } else if (step.target === 'hr' && hrZone) {
      garminStep.targetType = { ...TARGETS.heartRateZone } as any;
      garminStep.zoneNumber = hrZone;
    }
    return garminStep;
  };

  const steps: GarminStep[] = structure.items.map((item, i) => {
    if (isRepeat(item)) {
      return {
        type: 'RepeatGroupDTO',
        stepOrder: i + 1,
        stepType: { ...STEP_TYPES.repeat } as any,
        childStepId: 1,
        numberOfIterations: item.repeat,
        workoutSteps: item.steps.map((s, j) => toGarminStep(s, j + 1)),
        endConditionValue: `${item.repeat}.0`,
        endCondition: { ...CONDITIONS.iterations } as any,
      } as GarminRepeatGroup;
    }
    return toGarminStep(item, i + 1);
  });

  return {
    workoutId: null,
    ownerId: null,
    workoutName: workout.title,
    description: workout.description || `Treino ${workout.type} - Rafinha Running`,
    sportType: { ...RUNNING_SPORT },
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { ...RUNNING_SPORT },
        workoutSteps: steps,
      },
    ],
    avgTrainingSpeed: 0.0,
    estimatedDistanceUnit: { unitId: null, unitKey: null, factor: null },
    shared: false,
  };
}
