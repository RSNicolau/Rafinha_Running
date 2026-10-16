/**
 * Gera arquivo FIT de TREINO (file type = workout) a partir do modelo Workout do RR.
 * Formato universal: Garmin (GARMIN/NewFiles ou Garmin Connect), Coros, Suunto, Wahoo...
 *
 * A estrutura de passos é a MESMA do push Garmin (buildWorkoutStructure em garmin-workout.converter.ts):
 * nada é inventado — só há aquecimento / repetições / recuperação / desaquecimento quando o treinador
 * escreveu isso de forma explícita na descrição; senão, UM passo com distância/duração alvo (aberto se
 * nenhuma) e alvo de pace/FC apenas se definido. A descrição do treinador vai em `notes` do passo principal.
 *
 * Codificação: SDK oficial `@garmin/fitsdk` (ESM). O Encoder ignora sub-campos, então os valores vão
 * nos campos principais em unidade "crua" do perfil FIT:
 *   durationValue: tempo em ms (escala 1000) · distância em cm (escala 100)
 *   customTargetValueLow/High (speed): mm/s (escala 1000)
 */
import { pathToFileURL } from 'node:url';
import { type Workout } from '@prisma/client';
import {
  buildWorkoutStructure,
  isRepeat,
  type RRStep,
} from '../../integrations/garmin/garmin-workout.converter';
import { calendarDayInTz } from '../../../common/utils/date-only';

export const FIT_CONTENT_TYPE = 'application/vnd.ant.fit';

/** Campos do Workout usados na geração (permite passar objetos parciais nos testes). */
export type FitWorkoutInput = Pick<
  Workout,
  | 'id'
  | 'title'
  | 'type'
  | 'description'
  | 'scheduledDate'
  | 'targetDistanceMeters'
  | 'targetDurationSeconds'
  | 'targetPace'
  | 'heartRateZone'
>;

export interface FitStepMessage {
  messageIndex: number;
  wktStepName?: string;
  durationType: 'time' | 'distance' | 'open' | 'repeatUntilStepsCmplt';
  durationValue?: number;
  targetType?: 'speed' | 'heartRate' | 'open';
  targetValue?: number;
  customTargetValueLow?: number;
  customTargetValueHigh?: number;
  intensity?: 'active' | 'rest' | 'warmup' | 'cooldown' | 'recovery';
  notes?: string;
}

export interface FitWorkoutMessages {
  fileId: {
    type: 'workout';
    manufacturer: 'development';
    product: number;
    serialNumber: number;
    timeCreated: Date;
  };
  workout: {
    wktName: string;
    sport: 'running';
    numValidSteps: number;
    wktDescription?: string;
  };
  steps: FitStepMessage[];
}

const HR_ZONE_NUMBER: Record<string, number> = {
  Z1_RECOVERY: 1,
  Z2_EASY: 2,
  Z3_AEROBIC: 3,
  Z4_THRESHOLD: 4,
  Z5_MAXIMUM: 5,
};

/** Tolerância do alvo de pace (mesma do conversor Garmin): ±15 s/km. */
const PACE_TOLERANCE_SEC_PER_KM = 15;

/** Trunca uma string para caber em `maxBytes` em UTF-8 (campos string FIT têm no máx. 255 bytes). */
export function truncateUtf8(value: string | null | undefined, maxBytes: number): string {
  const s = (value ?? '').replace(/\s+/g, ' ').trim();
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  let out = '';
  for (const ch of s) {
    if (Buffer.byteLength(out + ch, 'utf8') > maxBytes) break;
    out += ch;
  }
  return out;
}

/** "5:30" (min:s por km) → faixa de velocidade em mm/s (low = mais lento). */
export function paceToSpeedRangeMms(pace?: string | null): { low: number; high: number } | null {
  if (!pace) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(pace.trim());
  if (!m) return null;
  const secPerKm = +m[1] * 60 + +m[2];
  if (!(secPerKm > 0)) return null;
  const slow = secPerKm + PACE_TOLERANCE_SEC_PER_KM;
  const fast = Math.max(secPerKm - PACE_TOLERANCE_SEC_PER_KM, 60);
  // m/s = 1000 / (s/km)  →  mm/s = 1_000_000 / (s/km)
  return { low: Math.round(1_000_000 / slow), high: Math.round(1_000_000 / fast) };
}

function applyTarget(
  step: FitStepMessage,
  kind: 'pace' | 'hr' | 'none',
  speed: { low: number; high: number } | null,
  hrZone: number | null,
) {
  if (kind === 'pace' && speed) {
    step.targetType = 'speed';
    step.targetValue = 0; // 0 = faixa customizada
    step.customTargetValueLow = speed.low;
    step.customTargetValueHigh = speed.high;
  } else if (kind === 'hr' && hrZone) {
    step.targetType = 'heartRate';
    step.targetValue = hrZone; // zona 1-5
  } else {
    step.targetType = 'open';
    step.targetValue = 0;
  }
}

const INTENSITY: Record<RRStep['kind'], NonNullable<FitStepMessage['intensity']>> = {
  warmup: 'warmup',
  active: 'active',
  rest: 'rest',
  cooldown: 'cooldown',
};

function mapStep(
  step: RRStep,
  messageIndex: number,
  speed: { low: number; high: number } | null,
  hrZone: number | null,
): FitStepMessage {
  const out: FitStepMessage = {
    messageIndex,
    wktStepName: truncateUtf8(step.name, 50) || undefined,
    durationType: 'open',
    intensity: INTENSITY[step.kind],
  };
  if (step.duration.type === 'time' && step.duration.seconds > 0) {
    out.durationType = 'time';
    out.durationValue = Math.round(step.duration.seconds * 1000); // ms
  } else if (step.duration.type === 'distance' && step.duration.meters > 0) {
    out.durationType = 'distance';
    out.durationValue = Math.round(step.duration.meters * 100); // cm
  }
  applyTarget(out, step.target === 'pace' ? 'pace' : step.target === 'hr' ? 'hr' : 'none', speed, hrZone);
  const notes = truncateUtf8(step.notes, 200);
  if (notes) out.notes = notes;
  return out;
}

/** Monta as mensagens FIT (puro — sem o SDK). */
export function buildFitWorkoutMessages(workout: FitWorkoutInput, now: Date = new Date()): FitWorkoutMessages {
  const speed = paceToSpeedRangeMms(workout.targetPace);
  const hrZone = workout.heartRateZone ? HR_ZONE_NUMBER[workout.heartRateZone] ?? null : null;

  const steps: FitStepMessage[] = [];
  for (const item of buildWorkoutStructure(workout).items) {
    if (isRepeat(item)) {
      const first = steps.length;
      for (const child of item.steps) steps.push(mapStep(child, steps.length, speed, hrZone));
      steps.push({
        messageIndex: steps.length,
        durationType: 'repeatUntilStepsCmplt',
        durationValue: first, // volta para o 1º passo do bloco
        targetValue: item.repeat, // nº de repetições
      });
    } else {
      steps.push(mapStep(item, steps.length, speed, hrZone));
    }
  }

  const serial = parseInt(String(workout.id ?? '').replace(/[^0-9a-f]/gi, '').slice(0, 8) || '1', 16) >>> 0;

  const description = truncateUtf8(workout.description, 200);
  return {
    fileId: {
      type: 'workout',
      manufacturer: 'development',
      product: 0,
      serialNumber: serial || 1,
      timeCreated: now,
    },
    workout: {
      wktName: truncateUtf8(workout.title, 64) || 'Treino',
      sport: 'running',
      numValidSteps: steps.length,
      ...(description ? { wktDescription: description } : {}),
    },
    steps,
  };
}

// ── SDK (ESM) ────────────────────────────────────────────────────────────────

type FitSdk = typeof import('@garmin/fitsdk');

// `new Function` impede que o compilador (tsc/swc → CommonJS) troque o import() por require().
const dynamicImport = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>;
let sdkPromise: Promise<FitSdk> | null = null;

async function importFitSdk(): Promise<FitSdk> {
  try {
    const resolved = require.resolve('@garmin/fitsdk');
    const mod = await dynamicImport(pathToFileURL(resolved).href);
    if (mod?.Encoder) return mod as FitSdk;
    if (mod?.default?.Encoder) return mod.default as FitSdk;
  } catch {
    // Ambientes sem import() dinâmico em scripts (ex.: Jest/vm): cai para require() — Node ≥ 22 carrega ESM
    // via require(), e no Jest o pacote é transpilado (ver "transform" no package.json).
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@garmin/fitsdk');
  return (mod?.Encoder ? mod : mod?.default) as FitSdk;
}

export function loadFitSdk(): Promise<FitSdk> {
  if (!sdkPromise) {
    sdkPromise = importFitSdk().catch((err) => {
      sdkPromise = null;
      throw err;
    });
  }
  return sdkPromise;
}

/** Codifica o treino como arquivo FIT binário. */
export async function encodeWorkoutFit(workout: FitWorkoutInput, now: Date = new Date()): Promise<Buffer> {
  const sdk = await loadFitSdk();
  const { MesgNum } = sdk.Profile;
  const msgs = buildFitWorkoutMessages(workout, now);
  const encoder = new sdk.Encoder();
  encoder.onMesg(MesgNum.FILE_ID, msgs.fileId as any);
  encoder.onMesg(MesgNum.WORKOUT, msgs.workout as any);
  for (const step of msgs.steps) encoder.onMesg(MesgNum.WORKOUT_STEP, step as any);
  return Buffer.from(encoder.close());
}

/** "2026-10-20-intervalado-5x1000.fit" */
export function fitFileName(workout: Pick<Workout, 'title' | 'scheduledDate'>): string {
  const day = calendarDayInTz(new Date(workout.scheduledDate));
  const slug =
    String(workout.title ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'treino';
  return `${day}-${slug}.fit`;
}
