/**
 * Arquivo FIT de treino: monta mensagens, codifica com o SDK oficial (@garmin/fitsdk) e decodifica
 * de volta com o Decoder do próprio SDK para validar integridade e valores.
 */
import {
  buildFitWorkoutMessages,
  encodeWorkoutFit,
  fitFileName,
  loadFitSdk,
  paceToSpeedRangeMms,
  truncateUtf8,
  FitWorkoutInput,
} from './workout-fit';

function workout(over: Partial<FitWorkoutInput> = {}): FitWorkoutInput {
  return {
    id: '3f2a9c1e-0000-4000-8000-000000000001',
    title: 'Intervalado 5x1000',
    type: 'INTERVAL' as any,
    description: '5x1000m forte com 2min de trote',
    scheduledDate: new Date('2026-10-20T12:00:00.000Z'),
    targetDistanceMeters: 8000,
    targetDurationSeconds: 3000,
    targetPace: '4:30',
    heartRateZone: null,
    ...over,
  };
}

async function decode(buf: Buffer) {
  const { Decoder, Stream } = await loadFitSdk();
  const stream = Stream.fromByteArray(Array.from(buf));
  const decoder = new Decoder(stream);
  expect(decoder.isFIT()).toBe(true);
  expect(decoder.checkIntegrity()).toBe(true);
  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  return messages as any;
}

describe('workout FIT — helpers', () => {
  it('converte pace em faixa de velocidade (mm/s), low = mais lento', () => {
    const r = paceToSpeedRangeMms('5:00')!; // 300 s/km ± 15
    expect(r.low).toBe(Math.round(1_000_000 / 315));
    expect(r.high).toBe(Math.round(1_000_000 / 285));
    expect(r.low).toBeLessThan(r.high);
    expect(paceToSpeedRangeMms('abc')).toBeNull();
    expect(paceToSpeedRangeMms(null)).toBeNull();
  });

  it('trunca strings respeitando bytes UTF-8', () => {
    const out = truncateUtf8('Ação ação ação', 7);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(7);
    expect(out.startsWith('Ação')).toBe(true);
  });

  it('nome do arquivo: <yyyy-mm-dd>-<slug>.fit (dia em SP, sem acentos)', () => {
    expect(fitFileName({ title: 'Longão de Domingo — Ritmo!', scheduledDate: new Date('2026-10-26T12:00:00Z') })).toBe(
      '2026-10-26-longao-de-domingo-ritmo.fit',
    );
    expect(fitFileName({ title: '***', scheduledDate: new Date('2026-10-26T12:00:00Z') })).toBe('2026-10-26-treino.fit');
  });
});

describe('workout FIT — mensagens (nada inventado)', () => {
  it('estrutura explícita na descrição: aquecimento + 5x1000m c/ 2min de trote + desaquecimento', () => {
    const m = buildFitWorkoutMessages(
      workout({ description: 'Aquecimento 15min, 5x1000m forte com 2min de trote, desaquecimento 10min' }),
    );
    expect(m.fileId.type).toBe('workout');
    expect(m.workout.sport).toBe('running');
    expect(m.workout.numValidSteps).toBe(m.steps.length);

    const [warm, interval, rest, repeat, cool] = m.steps;
    expect(m.steps).toHaveLength(5);
    expect(warm).toMatchObject({ intensity: 'warmup', durationType: 'time', durationValue: 900_000, targetType: 'open' });
    expect(interval).toMatchObject({
      messageIndex: 1,
      intensity: 'active',
      durationType: 'distance',
      durationValue: 100_000, // 1000 m em cm
      targetType: 'speed',
    });
    expect(interval.customTargetValueLow).toBe(paceToSpeedRangeMms('4:30')!.low);
    expect(interval.notes).toContain('5x1000m');
    expect(rest).toMatchObject({ intensity: 'rest', durationType: 'time', durationValue: 120_000, targetType: 'open' });
    expect(repeat).toMatchObject({ durationType: 'repeatUntilStepsCmplt', durationValue: 1, targetValue: 5 });
    expect(cool).toMatchObject({ intensity: 'cooldown', durationType: 'time', durationValue: 600_000 });
    m.steps.forEach((s, i) => expect(s.messageIndex).toBe(i));
  });

  it('repetição sem recuperação escrita: não cria passo de descanso', () => {
    const m = buildFitWorkoutMessages(workout({ description: '6x800m' }));
    expect(m.steps.map((s) => s.durationType)).toEqual(['distance', 'repeatUntilStepsCmplt']);
    expect(m.steps[1]).toMatchObject({ durationValue: 0, targetValue: 6 });
  });

  it('intervalado SEM estrutura escrita → passo único (sem 5x1000 / aquecimento inventados)', () => {
    const m = buildFitWorkoutMessages(workout({ description: 'Tiros fortes na pista', targetDistanceMeters: 8000 }));
    expect(m.steps).toEqual([
      expect.objectContaining({ messageIndex: 0, durationType: 'distance', durationValue: 800_000, targetType: 'speed', notes: 'Tiros fortes na pista' }),
    ]);
  });

  it('corrida leve só com duração e zona → um passo de tempo com alvo de FC', () => {
    const m = buildFitWorkoutMessages(
      workout({ type: 'EASY_RUN' as any, description: null, targetDistanceMeters: null, targetPace: null, heartRateZone: 'Z2_EASY' as any, targetDurationSeconds: 2700 }),
    );
    expect(m.steps).toEqual([
      expect.objectContaining({ intensity: 'active', durationType: 'time', durationValue: 2_700_000, targetType: 'heartRate', targetValue: 2 }),
    ]);
    expect(m.steps[0].notes).toBeUndefined();
  });

  it('corrida leve sem duração nem distância → passo aberto (não inventa 40 min)', () => {
    const m = buildFitWorkoutMessages(
      workout({ type: 'EASY_RUN' as any, description: null, targetDistanceMeters: null, targetDurationSeconds: null, targetPace: null }),
    );
    expect(m.steps).toEqual([expect.objectContaining({ durationType: 'open', targetType: 'open' })]);
    expect(m.steps[0].durationValue).toBeUndefined();
  });

  it('só aquecimento/desaquecimento escritos: bloco principal aberto com os alvos', () => {
    const m = buildFitWorkoutMessages(
      workout({ type: 'TEMPO' as any, description: '10min de aquecimento + 20min forte + 5min de desaquecimento', targetPace: '4:50' }),
    );
    expect(m.steps.map((s) => [s.intensity, s.durationType, s.durationValue])).toEqual([
      ['warmup', 'time', 600_000],
      ['active', 'open', undefined],
      ['cooldown', 'time', 300_000],
    ]);
    expect(m.steps[1].targetType).toBe('speed');
  });

  it('passo único por distância com pace (treino cruzado)', () => {
    const m = buildFitWorkoutMessages(
      workout({ type: 'CROSS_TRAINING' as any, title: 'Bike', description: null, targetDistanceMeters: 20000, targetPace: '2:00' }),
    );
    expect(m.steps).toEqual([
      expect.objectContaining({ messageIndex: 0, wktStepName: 'Bike', durationType: 'distance', durationValue: 2_000_000, targetType: 'speed' }),
    ]);
  });

  it('notas longas são truncadas com segurança (≤ 200 bytes UTF-8)', () => {
    const m = buildFitWorkoutMessages(workout({ description: 'ção '.repeat(200) }));
    expect(Buffer.byteLength(m.steps[0].notes!, 'utf8')).toBeLessThanOrEqual(200);
    expect(Buffer.byteLength(m.workout.wktDescription!, 'utf8')).toBeLessThanOrEqual(200);
  });
});

describe('workout FIT — codificação com @garmin/fitsdk (encode → decode)', () => {
  it('gera FIT válido (tipo workout) e os valores voltam iguais no Decoder', async () => {
    const desc = 'Aquecimento 10min, 5x1000m com 2min de trote, desaquecimento 5min';
    const buf = await encodeWorkoutFit(workout({ description: desc }), new Date('2026-10-18T22:00:00Z'));
    expect(buf.subarray(8, 12).toString('ascii')).toBe('.FIT');

    const msgs = await decode(buf);
    expect(msgs.fileIdMesgs[0]).toMatchObject({ type: 'workout', manufacturer: 'development' });
    expect(msgs.workoutMesgs[0]).toMatchObject({ wktName: 'Intervalado 5x1000', sport: 'running', numValidSteps: 5 });
    expect(msgs.workoutMesgs[0].wktDescription).toBe(desc);

    const steps = msgs.workoutStepMesgs;
    expect(steps).toHaveLength(5);
    expect(steps[0]).toMatchObject({ intensity: 'warmup', durationType: 'time', durationTime: 600 });
    expect(steps[1]).toMatchObject({ intensity: 'active', durationType: 'distance', durationDistance: 1000, targetType: 'speed', notes: desc });
    expect(steps[1].customTargetSpeedLow).toBeCloseTo(1000 / 285, 2); // 4:30 + 15 s
    expect(steps[1].customTargetSpeedHigh).toBeCloseTo(1000 / 255, 2); // 4:30 − 15 s
    expect(steps[2]).toMatchObject({ intensity: 'rest', durationType: 'time', durationTime: 120 });
    expect(steps[3]).toMatchObject({ durationType: 'repeatUntilStepsCmplt', durationStep: 1, repeatSteps: 5 });
    expect(steps[4]).toMatchObject({ intensity: 'cooldown', durationType: 'time', durationTime: 300 });
  });

  it('título/descrição com acentos e passo único com FC', async () => {
    const buf = await encodeWorkoutFit(
      workout({
        type: 'CROSS_TRAINING' as any,
        title: 'Regeneração ação',
        description: null,
        targetDistanceMeters: null,
        targetDurationSeconds: 1800,
        targetPace: null,
        heartRateZone: 'Z1_RECOVERY' as any,
      }),
    );
    const msgs = await decode(buf);
    expect(msgs.workoutMesgs[0].wktName).toBe('Regeneração ação');
    expect(msgs.workoutStepMesgs).toHaveLength(1);
    expect(msgs.workoutStepMesgs[0]).toMatchObject({ durationType: 'time', durationTime: 1800, targetType: 'heartRate', targetHrZone: 1 });
  });
});
