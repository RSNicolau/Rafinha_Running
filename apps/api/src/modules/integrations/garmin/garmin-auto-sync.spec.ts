import { GarminAutoSyncService } from './garmin-auto-sync.service';
import { TrainingPlansService } from '../../training-plans/training-plans.service';
import { WorkoutsService } from '../../workouts/workouts.service';

const FUTURE = new Date(Date.now() + 3 * 86400000);
const PAST = new Date(Date.now() - 3 * 86400000);

function workoutRow(over: Record<string, any> = {}) {
  return {
    id: 'w1',
    athleteId: 'ath-1',
    status: 'SCHEDULED',
    scheduledDate: FUTURE,
    garminWorkoutId: null,
    garminScheduleId: null,
    plan: { status: 'ACTIVE', deletedAt: null },
    ...over,
  };
}

function setup(opts: { workout?: any; integration?: any; push?: jest.Mock; del?: jest.Mock } = {}) {
  const prisma: any = {
    workout: {
      findUnique: jest.fn().mockResolvedValue(opts.workout === undefined ? workoutRow() : opts.workout),
      findMany: jest.fn().mockResolvedValue([]),
    },
    fitnessIntegration: {
      findFirst: jest.fn().mockResolvedValue(opts.integration === undefined ? { id: 'int-1' } : opts.integration),
    },
  };
  const garmin: any = {
    pushWorkoutToGarmin: opts.push ?? jest.fn().mockResolvedValue({ success: true }),
    deleteWorkoutFromGarmin: opts.del ?? jest.fn().mockResolvedValue(true),
  };
  return { prisma, garmin, svc: new GarminAutoSyncService(prisma, garmin) };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('GarminAutoSyncService', () => {
  const OLD = { id: process.env.GARMIN_CLIENT_ID, secret: process.env.GARMIN_CLIENT_SECRET };
  beforeEach(() => {
    process.env.GARMIN_CLIENT_ID = 'cid';
    process.env.GARMIN_CLIENT_SECRET = 'csecret';
  });
  afterAll(() => {
    process.env.GARMIN_CLIENT_ID = OLD.id;
    process.env.GARMIN_CLIENT_SECRET = OLD.secret;
  });

  it('envia quando o atleta tem Garmin ativo e o treino é futuro, SCHEDULED e de planilha ativa', async () => {
    const { svc, garmin, prisma } = setup();
    await expect(svc.syncWorkout('w1')).resolves.toBe('pushed');
    expect(prisma.fitnessIntegration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'ath-1', provider: 'GARMIN', isActive: true } }),
    );
    expect(garmin.pushWorkoutToGarmin).toHaveBeenCalledWith('w1');
    expect(garmin.deleteWorkoutFromGarmin).not.toHaveBeenCalled();
  });

  it('na edição de treino já enviado: remove o antigo no Garmin e cria de novo', async () => {
    const { svc, garmin } = setup({ workout: workoutRow({ garminWorkoutId: 'g-1', garminScheduleId: 's-1' }) });
    await expect(svc.syncWorkout('w1')).resolves.toBe('replaced');
    expect(garmin.deleteWorkoutFromGarmin).toHaveBeenCalledWith('ath-1', 'g-1', 's-1');
    expect(garmin.pushWorkoutToGarmin).toHaveBeenCalledWith('w1');
  });

  it.each([
    ['sem integração Garmin ativa', { integration: null }],
    ['treino concluído', { workout: workoutRow({ status: 'COMPLETED' }) }],
    ['treino no passado', { workout: workoutRow({ scheduledDate: PAST }) }],
    ['planilha em rascunho', { workout: workoutRow({ plan: { status: 'DRAFT', deletedAt: null } }) }],
    ['planilha excluída', { workout: workoutRow({ plan: { status: 'ACTIVE', deletedAt: new Date() } }) }],
    ['treino inexistente', { workout: null }],
  ])('não envia: %s', async (_label, opts) => {
    const { svc, garmin } = setup(opts as any);
    await expect(svc.syncWorkout('w1')).resolves.toBe('skipped');
    expect(garmin.pushWorkoutToGarmin).not.toHaveBeenCalled();
  });

  it('não envia quando o ambiente não tem credenciais Garmin', async () => {
    delete process.env.GARMIN_CLIENT_ID;
    const { svc, garmin, prisma } = setup();
    await expect(svc.syncWorkout('w1')).resolves.toBe('skipped');
    svc.onWorkoutSaved('w1');
    await flush();
    expect(prisma.workout.findUnique).not.toHaveBeenCalled();
    expect(garmin.pushWorkoutToGarmin).not.toHaveBeenCalled();
  });

  it('falha no Garmin vira "failed" — nunca lança', async () => {
    const { svc } = setup({ push: jest.fn().mockRejectedValue(new Error('Garmin 500')) });
    await expect(svc.syncWorkout('w1')).resolves.toBe('failed');
  });

  it('onWorkoutSaved é fire-and-forget: retorna na hora e engole erros', async () => {
    let release!: () => void;
    const push = jest.fn(() => new Promise((_, reject) => { release = () => reject(new Error('timeout')); }));
    const { svc } = setup({ push });
    expect(svc.onWorkoutSaved('w1')).toBeUndefined();
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
    release();
    await flush();
  });

  it('edições seguidas do mesmo treino são serializadas', async () => {
    const order: string[] = [];
    let first = true;
    const push = jest.fn(async () => {
      const tag = first ? 'A' : 'B';
      first = false;
      order.push(`start-${tag}`);
      await new Promise((r) => setTimeout(r, tag === 'A' ? 20 : 0));
      order.push(`end-${tag}`);
    });
    const { svc } = setup({ push });
    svc.onWorkoutSaved('w1');
    svc.onWorkoutSaved('w1');
    await new Promise((r) => setTimeout(r, 60));
    expect(order).toEqual(['start-A', 'end-A', 'start-B', 'end-B']);
  });

  it('planilha ativada: envia os treinos futuros ainda não enviados', async () => {
    const { svc, prisma, garmin } = setup();
    prisma.workout.findMany.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
    await expect(svc.pushPendingForPlan('p1')).resolves.toEqual({ total: 2, pushed: 2 });
    expect(prisma.workout.findMany.mock.calls[0][0].where).toMatchObject({ planId: 'p1', status: 'SCHEDULED', garminWorkoutId: null });
    expect(garmin.pushWorkoutToGarmin).toHaveBeenCalledTimes(2);
  });

  it('exclusão: remove do Garmin só os que têm garminWorkoutId', async () => {
    const { svc, garmin } = setup();
    svc.onWorkoutsDeleted([
      { id: 'w1', athleteId: 'ath-1', garminWorkoutId: 'g-1', garminScheduleId: 's-1' },
      { id: 'w2', athleteId: 'ath-1', garminWorkoutId: null },
    ]);
    await flush();
    expect(garmin.deleteWorkoutFromGarmin).toHaveBeenCalledTimes(1);
    expect(garmin.deleteWorkoutFromGarmin).toHaveBeenCalledWith('ath-1', 'g-1', 's-1');
  });
});

describe('Hooks de envio automático nos serviços do treinador', () => {
  const sync = () => ({ onWorkoutSaved: jest.fn(), onPlanActivated: jest.fn(), onWorkoutsDeleted: jest.fn(), enabled: true });
  const notifications: any = { createNotification: jest.fn().mockResolvedValue(undefined) };

  function plansSetup(planStatus = 'ACTIVE') {
    const plan = { id: 'p1', athleteId: 'ath-1', coachId: 'coach-1', status: planStatus, deletedAt: null, startDate: new Date(), endDate: new Date() };
    const prisma: any = {
      trainingPlan: {
        findUnique: jest.fn().mockResolvedValue(plan),
        update: jest.fn().mockResolvedValue({ ...plan, status: 'ACTIVE', name: 'Plano' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockResolvedValue(plan),
      },
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1', teamId: null }) },
      workout: {
        create: jest.fn().mockResolvedValue({ id: 'w-new', title: 'Treino' }),
        update: jest.fn().mockResolvedValue({ id: 'w1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'w1', planId: 'p1', athleteId: 'ath-1', status: 'SCHEDULED', result: null, garminWorkoutId: 'g-1', garminScheduleId: 's-1' }),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([{ id: 'w1', athleteId: 'ath-1', garminWorkoutId: 'g-1', garminScheduleId: null }]),
      },
    };
    const s = sync();
    return { prisma, s, svc: new TrainingPlansService(prisma, notifications, s as any) };
  }
  const coach = { id: 'coach-1', role: 'COACH' };

  it('addWorkout / updateWorkout disparam o envio', async () => {
    const { svc, s } = plansSetup();
    await svc.addWorkout('p1', coach, { scheduledDate: '2026-10-20', type: 'EASY_RUN' } as any);
    expect(s.onWorkoutSaved).toHaveBeenCalledWith('w-new');
    await svc.updateWorkout('p1', 'w1', coach, { scheduledDate: '2026-10-21' } as any);
    expect(s.onWorkoutSaved).toHaveBeenCalledWith('w1');
  });

  it('deleteWorkout remove do Garmin', async () => {
    const { svc, s } = plansSetup();
    await svc.deleteWorkout('p1', 'w1', coach);
    expect(s.onWorkoutsDeleted).toHaveBeenCalledWith([{ id: 'w1', athleteId: 'ath-1', garminWorkoutId: 'g-1', garminScheduleId: 's-1' }]);
  });

  it('ativar a planilha envia os treinos pendentes', async () => {
    const { svc, s } = plansSetup('DRAFT');
    await svc.update('p1', coach, { status: 'ACTIVE' } as any);
    expect(s.onPlanActivated).toHaveBeenCalledWith('p1');
  });

  it('excluir a planilha remove do Garmin os treinos já enviados', async () => {
    const { svc, s, prisma } = plansSetup();
    prisma.workout.count.mockResolvedValue(0);
    await svc.remove('p1', coach);
    expect(s.onWorkoutsDeleted).toHaveBeenCalledWith([{ id: 'w1', athleteId: 'ath-1', garminWorkoutId: 'g-1', garminScheduleId: null }]);
  });

  it('a requisição do treinador não falha mesmo que o envio exploda', async () => {
    const { svc, s } = plansSetup();
    s.onWorkoutSaved.mockImplementation(() => undefined); // contrato: fire-and-forget nunca lança
    const real = new GarminAutoSyncService({ workout: { findUnique: jest.fn().mockRejectedValue(new Error('db down')) } } as any, {} as any);
    process.env.GARMIN_CLIENT_ID = 'cid';
    process.env.GARMIN_CLIENT_SECRET = 'csecret';
    expect(() => real.onWorkoutSaved('w1')).not.toThrow();
    await flush();
    await expect(svc.addWorkout('p1', coach, { scheduledDate: '2026-10-20', type: 'EASY_RUN' } as any)).resolves.toBeTruthy();
  });

  it('WorkoutsService.create e changeWorkoutType disparam o envio', async () => {
    const prisma: any = {
      trainingPlan: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', athleteId: 'ath-1', coachId: 'coach-1', deletedAt: null }) },
      workout: {
        create: jest.fn().mockResolvedValue({ id: 'w-new' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'w1', athleteId: 'ath-1', plan: { coachId: 'coach-1' } }),
        update: jest.fn().mockResolvedValue({ id: 'w1' }),
      },
    };
    const s = sync();
    const svc = new WorkoutsService(prisma, notifications, {} as any, s as any);
    await svc.create('coach-1', { planId: 'p1', scheduledDate: '2026-10-20', type: 'EASY_RUN', title: 'Leve' } as any);
    expect(s.onWorkoutSaved).toHaveBeenCalledWith('w-new');
    await svc.changeWorkoutType('w1', coach, 'RECOVERY');
    expect(s.onWorkoutSaved).toHaveBeenCalledWith('w1');
  });
});

describe('GarminService.deleteWorkoutFromGarmin', () => {
  const { GarminService } = require('./garmin.service');
  const { encrypt } = require('../../../common/utils/encryption');
  const OLD_KEY = process.env.ENCRYPTION_KEY;
  const realFetch = global.fetch;
  beforeAll(() => (process.env.ENCRYPTION_KEY = 'a'.repeat(64)));
  afterAll(() => {
    process.env.ENCRYPTION_KEY = OLD_KEY;
    global.fetch = realFetch;
  });

  function svcWith(integration: any) {
    const prisma: any = { fitnessIntegration: { findFirst: jest.fn().mockResolvedValue(integration) } };
    return new GarminService(prisma);
  }
  const integration = () => ({ id: 'i1', accessToken: encrypt('tok'), refreshToken: null, expiresAt: new Date(Date.now() + 3600e3) });

  it('apaga agenda e treino no Training API', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchMock as any;
    await expect(svcWith(integration()).deleteWorkoutFromGarmin('ath-1', 'g-1', 's-1')).resolves.toBe(true);
    expect(fetchMock.mock.calls.map((c: any[]) => [c[0], c[1].method])).toEqual([
      ['https://apis.garmin.com/training-api/schedule/s-1', 'DELETE'],
      ['https://apis.garmin.com/training-api/workout/g-1', 'DELETE'],
    ]);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
  });

  it('nunca lança (rede fora / sem integração)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
    await expect(svcWith(integration()).deleteWorkoutFromGarmin('ath-1', 'g-1')).resolves.toBe(false);
    await expect(svcWith(null).deleteWorkoutFromGarmin('ath-1', 'g-1')).resolves.toBe(false);
  });
});
