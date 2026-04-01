/**
 * Converts RR Workout model → Garmin Connect Training API JSON format.
 *
 * Reference: Garmin Connect Developer Program - Training API
 * Workout JSON spec reverse-engineered from community tools + official docs.
 */

import { Workout, WorkoutType, HeartRateZone } from '@prisma/client';

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

// --- Main Converter ---

export function convertWorkoutToGarmin(workout: Workout): GarminWorkoutPayload {
  const steps = buildStepsForWorkoutType(workout);

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

function buildStepsForWorkoutType(workout: Workout): GarminStep[] {
  const hrZone = hrZoneToNumber(workout.heartRateZone);
  const paceTarget = paceToSecondsPerMeter(workout.targetPace);

  switch (workout.type) {
    case WorkoutType.EASY_RUN:
      return buildEasyRun(workout, hrZone);

    case WorkoutType.TEMPO:
      return buildTempo(workout, hrZone, paceTarget);

    case WorkoutType.INTERVAL:
      return buildInterval(workout, hrZone, paceTarget);

    case WorkoutType.LONG_RUN:
      return buildLongRun(workout, hrZone);

    case WorkoutType.RECOVERY:
      return buildRecovery(workout);

    case WorkoutType.RACE:
      return buildRace(workout);

    case WorkoutType.CROSS_TRAINING:
    case WorkoutType.REST:
    default:
      return buildSimpleRun(workout, hrZone);
  }
}

/** Easy Run: single step with HR zone 2 target or time-based */
function buildEasyRun(workout: Workout, hrZone?: string): GarminStep[] {
  const duration = workout.targetDurationSeconds || 2400; // default 40min
  const target = hrZone
    ? (TARGETS.heartRateZone as any)
    : (TARGETS.noTarget as any);

  return [
    makeStep(1, STEP_TYPES.warmup as any, CONDITIONS.time as any, '300.0', 'Aquecimento leve'),
    makeStep(
      2,
      STEP_TYPES.interval as any,
      CONDITIONS.time as any,
      `${duration - 600}.0`,
      'Corrida leve',
      target,
      hrZone ? { zoneNumber: hrZone || '2' } : {},
    ),
    makeStep(3, STEP_TYPES.cooldown as any, CONDITIONS.time as any, '300.0', 'Desaquecimento'),
  ];
}

/** Tempo: warmup + tempo block (pace target) + cooldown */
function buildTempo(
  workout: Workout,
  hrZone?: string,
  paceTarget?: { low: number; high: number } | null,
): GarminStep[] {
  const duration = workout.targetDurationSeconds || 2400;
  const tempoDuration = Math.max(duration - 900, 600); // subtract warmup+cooldown

  const step = makeStep(
    2,
    STEP_TYPES.interval as any,
    CONDITIONS.time as any,
    `${tempoDuration}.0`,
    'Ritmo forte sustentado',
    hrZone ? (TARGETS.heartRateZone as any) : (TARGETS.noTarget as any),
    hrZone ? { zoneNumber: hrZone || '4' } : {},
  );

  if (paceTarget) {
    step.targetType = { ...TARGETS.pace } as any;
    step.targetValueOne = paceTarget.low;
    step.targetValueTwo = paceTarget.high;
  }

  return [
    makeStep(1, STEP_TYPES.warmup as any, CONDITIONS.time as any, '600.0', 'Aquecimento 10min'),
    step,
    makeStep(3, STEP_TYPES.cooldown as any, CONDITIONS.time as any, '300.0', 'Desaquecimento 5min'),
  ];
}

/** Interval: warmup + repeat(interval + rest) + cooldown */
function buildInterval(
  workout: Workout,
  hrZone?: string,
  paceTarget?: { low: number; high: number } | null,
): GarminStep[] {
  // Parse interval details from description or use defaults
  const { reps, intervalDistance, restSeconds } = parseIntervalDetails(workout);

  const intervalStep = makeStep(
    1,
    STEP_TYPES.interval as any,
    CONDITIONS.distance as any,
    `${intervalDistance}.0`,
    `${intervalDistance}m forte`,
    hrZone ? (TARGETS.heartRateZone as any) : (TARGETS.noTarget as any),
    {
      preferredEndConditionUnit: { ...METER_UNIT },
      ...(hrZone ? { zoneNumber: hrZone || '4' } : {}),
    },
  );

  if (paceTarget) {
    intervalStep.targetType = { ...TARGETS.pace } as any;
    intervalStep.targetValueOne = paceTarget.low;
    intervalStep.targetValueTwo = paceTarget.high;
  }

  const restStep = makeStep(
    2,
    STEP_TYPES.rest as any,
    CONDITIONS.fixedRest as any,
    `${restSeconds}.0`,
    'Recuperação',
  );

  const repeatGroup: GarminRepeatGroup = {
    type: 'RepeatGroupDTO',
    stepOrder: 2,
    stepType: { ...STEP_TYPES.repeat } as any,
    childStepId: 1,
    numberOfIterations: reps,
    workoutSteps: [intervalStep, restStep],
    endConditionValue: `${reps}.0`,
    endCondition: { ...CONDITIONS.iterations } as any,
  };

  return [
    makeStep(1, STEP_TYPES.warmup as any, CONDITIONS.time as any, '600.0', 'Aquecimento 10min'),
    repeatGroup,
    makeStep(3, STEP_TYPES.cooldown as any, CONDITIONS.time as any, '300.0', 'Desaquecimento 5min'),
  ];
}

/** Long Run: single long step with distance target, HR zone 2 */
function buildLongRun(workout: Workout, hrZone?: string): GarminStep[] {
  if (workout.targetDistanceMeters) {
    return [
      makeStep(1, STEP_TYPES.warmup as any, CONDITIONS.time as any, '600.0', 'Aquecimento 10min'),
      makeStep(
        2,
        STEP_TYPES.interval as any,
        CONDITIONS.distance as any,
        `${workout.targetDistanceMeters}.0`,
        'Corrida longa',
        hrZone ? (TARGETS.heartRateZone as any) : (TARGETS.noTarget as any),
        {
          preferredEndConditionUnit: { ...METER_UNIT },
          ...(hrZone ? { zoneNumber: hrZone || '2' } : {}),
        },
      ),
      makeStep(3, STEP_TYPES.cooldown as any, CONDITIONS.time as any, '300.0', 'Desaquecimento'),
    ];
  }

  // Fallback to time-based
  const duration = workout.targetDurationSeconds || 5400; // default 90min
  return [
    makeStep(1, STEP_TYPES.warmup as any, CONDITIONS.time as any, '600.0', 'Aquecimento'),
    makeStep(
      2,
      STEP_TYPES.interval as any,
      CONDITIONS.time as any,
      `${duration - 900}.0`,
      'Corrida longa',
      hrZone ? (TARGETS.heartRateZone as any) : (TARGETS.noTarget as any),
      hrZone ? { zoneNumber: hrZone || '2' } : {},
    ),
    makeStep(3, STEP_TYPES.cooldown as any, CONDITIONS.time as any, '300.0', 'Desaquecimento'),
  ];
}

/** Recovery: easy pace, low HR, shorter duration */
function buildRecovery(workout: Workout): GarminStep[] {
  const duration = workout.targetDurationSeconds || 1800; // default 30min
  return [
    makeStep(
      1,
      STEP_TYPES.interval as any,
      CONDITIONS.time as any,
      `${duration}.0`,
      'Recuperação ativa - ritmo bem leve',
      TARGETS.heartRateZone as any,
      { zoneNumber: '1' },
    ),
  ];
}

/** Race: distance-based, no specific target */
function buildRace(workout: Workout): GarminStep[] {
  if (workout.targetDistanceMeters) {
    return [
      makeStep(1, STEP_TYPES.warmup as any, CONDITIONS.time as any, '600.0', 'Aquecimento'),
      makeStep(
        2,
        STEP_TYPES.interval as any,
        CONDITIONS.distance as any,
        `${workout.targetDistanceMeters}.0`,
        'Prova',
        TARGETS.noTarget as any,
        { preferredEndConditionUnit: { ...METER_UNIT } },
      ),
      makeStep(3, STEP_TYPES.cooldown as any, CONDITIONS.lapButton as any, '0', 'Desaquecimento livre'),
    ];
  }
  return buildSimpleRun(workout);
}

/** Generic simple run fallback */
function buildSimpleRun(workout: Workout, hrZone?: string): GarminStep[] {
  const duration = workout.targetDurationSeconds || 1800;
  return [
    makeStep(
      1,
      STEP_TYPES.interval as any,
      CONDITIONS.time as any,
      `${duration}.0`,
      workout.title,
      hrZone ? (TARGETS.heartRateZone as any) : (TARGETS.noTarget as any),
      hrZone ? { zoneNumber: hrZone || '2' } : {},
    ),
  ];
}

/** Parse interval details from workout description or use sensible defaults */
function parseIntervalDetails(workout: Workout): {
  reps: number;
  intervalDistance: number;
  restSeconds: number;
} {
  const desc = (workout.description || '').toLowerCase();

  // Try to parse "5x1000m" or "8x400m" pattern
  const match = desc.match(/(\d+)\s*x\s*(\d+)\s*m/);
  if (match) {
    return {
      reps: parseInt(match[1]),
      intervalDistance: parseInt(match[2]),
      restSeconds: parseInt(match[2]) <= 400 ? 60 : 120, // shorter rest for shorter intervals
    };
  }

  // Default based on target distance
  if (workout.targetDistanceMeters) {
    const totalDist = workout.targetDistanceMeters;
    if (totalDist <= 4000) {
      return { reps: 8, intervalDistance: 400, restSeconds: 60 };
    } else if (totalDist <= 8000) {
      return { reps: 5, intervalDistance: 1000, restSeconds: 120 };
    } else {
      return { reps: 4, intervalDistance: 2000, restSeconds: 180 };
    }
  }

  return { reps: 5, intervalDistance: 1000, restSeconds: 120 };
}
