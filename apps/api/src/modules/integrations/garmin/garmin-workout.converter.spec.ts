import { buildWorkoutStructure, convertWorkoutToGarmin, parseExplicitStructure } from './garmin-workout.converter';

function workout(over: Record<string, any> = {}): any {
  return {
    id: 'w1', title: 'Treino', type: 'INTERVAL', description: null, scheduledDate: new Date('2026-10-20T12:00:00Z'),
    targetDistanceMeters: null, targetDurationSeconds: null, targetPace: null, heartRateZone: null, ...over,
  };
}

describe('parseExplicitStructure', () => {
  it.each([
    ['6x800m', { repeat: { reps: 6, work: { type: 'distance', meters: 800 } } }],
    ['5 x 1km com pausa de 90s', { repeat: { reps: 5, work: { type: 'distance', meters: 1000 }, rest: { type: 'time', seconds: 90 } } }],
    ['8x1min forte / 1min trote', { repeat: { reps: 8, work: { type: 'time', seconds: 60 }, rest: { type: 'time', seconds: 60 } } }],
    ['10×400m recuperação 200m', { repeat: { reps: 10, work: { type: 'distance', meters: 400 }, rest: { type: 'distance', meters: 200 } } }],
    ['Aquecimento 15min', { warmup: { type: 'time', seconds: 900 } }],
    ['10 min de desaquecimento', { cooldown: { type: 'time', seconds: 600 } }],
    ['volta à calma 5min', { cooldown: { type: 'time', seconds: 300 } }],
  ])('"%s"', (text, expected) => {
    expect(parseExplicitStructure(text)).toMatchObject(expected);
  });

  it('desaquecimento não é confundido com aquecimento', () => {
    const r = parseExplicitStructure('desaquecimento 10min')!;
    expect(r.warmup).toBeUndefined();
    expect(r.cooldown).toEqual({ type: 'time', seconds: 600 });
  });

  it.each([[null], [''], ['Corrida leve, curta e solta'], ['Tiros na pista'], ['Treino de 2x por semana']])(
    'sem estrutura explícita: %p → null',
    (text) => {
      expect(parseExplicitStructure(text as any)).toBeNull();
    },
  );
});

describe('buildWorkoutStructure — nunca inventa passos', () => {
  it('sem estrutura: um passo com a distância alvo e o pace do treinador', () => {
    expect(buildWorkoutStructure(workout({ targetDistanceMeters: 10000, targetPace: '5:00', description: 'Ritmo confortável' }))).toEqual({
      explicit: false,
      items: [{ kind: 'active', name: 'Treino', duration: { type: 'distance', meters: 10000 }, target: 'pace', notes: 'Ritmo confortável' }],
    });
  });

  it('sem distância → duração; sem nenhum → aberto; sem alvo → none', () => {
    expect(buildWorkoutStructure(workout({ targetDurationSeconds: 1800 })).items[0]).toMatchObject({ duration: { type: 'time', seconds: 1800 }, target: 'none' });
    expect(buildWorkoutStructure(workout()).items[0]).toMatchObject({ duration: { type: 'open' }, target: 'none' });
    expect(buildWorkoutStructure(workout({ heartRateZone: 'Z2_EASY' })).items[0]).toMatchObject({ target: 'hr' });
  });
});

describe('convertWorkoutToGarmin (push Garmin)', () => {
  const steps = (w: any) => convertWorkoutToGarmin(w).workoutSegments[0].workoutSteps as any[];

  it('intervalado sem estrutura escrita → 1 passo (sem aquecimento 10min / 5x1000 padrão)', () => {
    const s = steps(workout({ targetDistanceMeters: 8000, description: 'Tiros fortes' }));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ type: 'ExecutableStepDTO', endCondition: { conditionTypeKey: 'distance' }, endConditionValue: '8000.0' });
    expect(s[0].targetType.workoutTargetTypeKey).toBe('no.target');
  });

  it('corrida leve sem duração → passo aberto (lap.button), não 40 min', () => {
    const s = steps(workout({ type: 'EASY_RUN' }));
    expect(s).toEqual([expect.objectContaining({ endCondition: expect.objectContaining({ conditionTypeKey: 'lap.button' }), endConditionValue: '0' })]);
  });

  it('estrutura explícita → aquecimento + repeat group + desaquecimento, com pace no tiro', () => {
    const s = steps(workout({ description: 'aquecimento 15min, 6x800m pausa 2min, desaquecimento 10min', targetPace: '4:00' }));
    expect(s.map((x) => x.type)).toEqual(['ExecutableStepDTO', 'RepeatGroupDTO', 'ExecutableStepDTO']);
    expect(s[0]).toMatchObject({ stepType: { stepTypeKey: 'warmup' }, endConditionValue: '900.0' });
    expect(s[1]).toMatchObject({ numberOfIterations: 6, endConditionValue: '6.0' });
    expect(s[1].workoutSteps[0]).toMatchObject({ stepType: { stepTypeKey: 'interval' }, endConditionValue: '800.0', targetType: { workoutTargetTypeKey: 'pace.zone' } });
    expect(s[1].workoutSteps[1]).toMatchObject({ stepType: { stepTypeKey: 'rest' }, endConditionValue: '120.0' });
    expect(s[2]).toMatchObject({ stepType: { stepTypeKey: 'cooldown' }, endConditionValue: '600.0', stepOrder: 3 });
  });

  it('zona de FC definida → alvo heart.rate.zone com a zona', () => {
    const s = steps(workout({ type: 'RECOVERY', targetDurationSeconds: 1800, heartRateZone: 'Z1_RECOVERY' }));
    expect(s[0]).toMatchObject({ targetType: { workoutTargetTypeKey: 'heart.rate.zone' }, zoneNumber: '1', endConditionValue: '1800.0' });
  });

  it('mantém nome e descrição do treino', () => {
    const p = convertWorkoutToGarmin(workout({ title: 'Longão', description: 'Leve' }));
    expect(p.workoutName).toBe('Longão');
    expect(p.description).toBe('Leve');
  });
});
