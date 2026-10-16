import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TrainingPlansService } from '../training-plans.service';
import { CreatePlanDto, PlanWorkoutDto, UpdatePlanDto } from '../dto/plan.dto';
import { PlanStatus } from '@prisma/client';

const COACH = { id: 'coach-1', role: 'COACH' };
const OWNER = { id: 'owner-1', role: 'COACH' };
const OTHER = { id: 'other-coach', role: 'COACH' };
const STAFF = { id: 'staff-1', role: 'COACH' };
const ATHLETE = { id: 'athlete-1', role: 'ATHLETE' };

/** Atleta athlete-1 é atribuído a coach-1, na equipe team-1 (owner-1 = OWNER, staff-1 = STAFF). */
function makePrisma(over: Partial<Record<string, any>> = {}) {
  const basePlan = {
    id: 'plan-1', coachId: 'owner-1', athleteId: 'athlete-1', name: 'Plano', description: null,
    startDate: new Date('2026-11-02T12:00:00Z'), endDate: new Date('2026-11-29T12:00:00Z'),
    weeklyFrequency: 3, status: PlanStatus.DRAFT, deletedAt: null,
  };
  const prisma: any = {
    athleteProfile: {
      findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1', teamId: 'team-1' }),
    },
    teamMember: {
      findFirst: jest.fn(async ({ where }: any) => {
        const roles: string[] = where.role?.in ?? [];
        if (where.userId === 'owner-1' && roles.includes('OWNER')) return { role: 'OWNER' };
        if (where.userId === 'staff-1' && roles.includes('STAFF')) return { role: 'STAFF' };
        return null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        if (where.userId === 'owner-1') return [{ teamId: 'team-1' }];
        return [];
      }),
    },
    trainingPlan: {
      create: jest.fn(async ({ data }: any) => ({ id: 'new-plan', ...data, coach: { name: 'C' } })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(basePlan),
      update: jest.fn(async ({ data }: any) => ({ ...basePlan, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue(basePlan),
    },
    workout: {
      create: jest.fn(async ({ data }: any) => ({ id: 'w-new', ...data })),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(async ({ data }: any) => ({ id: 'w1', ...data })),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    ...over,
  };
  const notifications = { createNotification: jest.fn().mockResolvedValue(undefined) };
  const svc = new TrainingPlansService(prisma, notifications as any);
  return { svc, prisma, notifications, basePlan };
}

describe('TrainingPlansService — create', () => {
  it('cria em DRAFT com datas ao meio-dia UTC (sem deslocar o dia em BRT) e notifica', async () => {
    const { svc, prisma, notifications } = makePrisma();
    await svc.create(COACH, { athleteId: 'athlete-1', name: ' Plano ', startDate: '2026-11-01', endDate: '2026-11-30', weeklyFrequency: 4 });
    const data = prisma.trainingPlan.create.mock.calls[0][0].data;
    expect(data.status).toBe(PlanStatus.DRAFT);
    expect(data.coachId).toBe('coach-1');
    expect(data.name).toBe('Plano');
    expect(data.startDate.toISOString()).toBe('2026-11-01T12:00:00.000Z');
    expect(data.endDate.toISOString()).toBe('2026-11-30T12:00:00.000Z');
    expect(notifications.createNotification).toHaveBeenCalled();
  });

  it('rejeita fim antes do início', async () => {
    const { svc, prisma } = makePrisma();
    await expect(
      svc.create(COACH, { athleteId: 'athlete-1', name: 'X', startDate: '2026-11-30', endDate: '2026-11-01', weeklyFrequency: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.trainingPlan.create).not.toHaveBeenCalled();
  });

  it('coach não cria plano para atleta de outro coach/equipe', async () => {
    const { svc, prisma } = makePrisma();
    await expect(
      svc.create(OTHER, { athleteId: 'athlete-1', name: 'X', startDate: '2026-01-01', endDate: '2026-02-01', weeklyFrequency: 3 }),
    ).rejects.toThrow('Atleta não encontrado');
    expect(prisma.trainingPlan.create).not.toHaveBeenCalled();
  });

  it('OWNER da equipe cria plano para atleta atribuído a outro treinador da equipe', async () => {
    const { svc, prisma } = makePrisma();
    await svc.create(OWNER, { athleteId: 'athlete-1', name: 'X', startDate: '2026-01-01', endDate: '2026-02-01', weeklyFrequency: 3 });
    expect(prisma.trainingPlan.create).toHaveBeenCalled();
  });

  it('STAFF não cria (só leitura)', async () => {
    const { svc, prisma } = makePrisma();
    await expect(
      svc.create(STAFF, { athleteId: 'athlete-1', name: 'X', startDate: '2026-01-01', endDate: '2026-02-01', weeklyFrequency: 3 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.trainingPlan.create).not.toHaveBeenCalled();
  });
});

describe('DTO — validação de datas (M2)', () => {
  it('CreatePlanDto: fim < início é inválido; fim = início é válido', () => {
    const bad = plainToInstance(CreatePlanDto, { athleteId: '3f1c2b7e-5d4a-4c1b-9a2e-1b2c3d4e5f60', name: 'X', startDate: '2026-11-30', endDate: '2026-11-01', weeklyFrequency: 3 });
    const errs = validateSync(bad);
    expect(errs.some((e) => e.property === 'endDate')).toBe(true);
    const ok = plainToInstance(CreatePlanDto, { athleteId: '3f1c2b7e-5d4a-4c1b-9a2e-1b2c3d4e5f60', name: 'X', startDate: '2026-11-01', endDate: '2026-11-01', weeklyFrequency: 3 });
    expect(validateSync(ok)).toHaveLength(0);
  });

  it('UpdatePlanDto aceita só endDate (comparação feita no service)', () => {
    expect(validateSync(plainToInstance(UpdatePlanDto, { endDate: '2026-01-01' }))).toHaveLength(0);
  });

  it('PlanWorkoutDto valida tipo e pace m:ss', () => {
    expect(validateSync(plainToInstance(PlanWorkoutDto, { scheduledDate: '2026-11-03', type: 'EASY_RUN', targetPace: '5:30' }))).toHaveLength(0);
    const errs = validateSync(plainToInstance(PlanWorkoutDto, { scheduledDate: '2026-11-03', type: 'NOPE', targetPace: '5:75' }));
    expect(errs.map((e) => e.property).sort()).toEqual(['targetPace', 'type']);
  });
});

describe('TrainingPlansService — escopo de equipe (M3)', () => {
  it('coach lista planilhas dos atletas atribuídos a ele (inclusive as criadas pelo dono)', async () => {
    const { svc, prisma } = makePrisma();
    await svc.findAll(COACH, 1, 20);
    const where = prisma.trainingPlan.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ athlete: { athleteProfile: { coachId: 'coach-1' } }, deletedAt: null });
  });

  it('dono lista planilhas de todos os atletas da equipe (inclusive criadas por treinadores)', async () => {
    const { svc, prisma } = makePrisma();
    await svc.findAll(OWNER, 1, 20);
    const where = prisma.trainingPlan.findMany.mock.calls[0][0].where;
    expect(where.athlete.athleteProfile).toEqual({ OR: [{ coachId: 'owner-1' }, { teamId: { in: ['team-1'] } }] });
    expect(where.deletedAt).toBeNull();
  });

  it('atleta lista só as suas; filtros de atleta/status são aplicados', async () => {
    const { svc, prisma } = makePrisma();
    await svc.findAll(ATHLETE, 1, 20, { status: PlanStatus.ACTIVE });
    expect(prisma.trainingPlan.findMany.mock.calls[0][0].where).toEqual({ athleteId: 'athlete-1', deletedAt: null, status: 'ACTIVE' });
  });

  it('paginação e progresso por planilha', async () => {
    const { svc, prisma } = makePrisma();
    prisma.trainingPlan.findMany.mockResolvedValue([{ id: 'p1' }]);
    prisma.trainingPlan.count.mockResolvedValue(45);
    prisma.workout.groupBy.mockResolvedValue([{ planId: 'p1', _count: { _all: 7 } }]);
    const r = await svc.findAll(COACH, 2, 20);
    expect(r.totalPages).toBe(3);
    expect(r.page).toBe(2);
    expect(r.data[0].completedWorkouts).toBe(7);
  });

  it('treinador atribuído abre planilha criada pelo dono (antes: 403)', async () => {
    const { svc, prisma } = makePrisma();
    prisma.trainingPlan.findUnique.mockResolvedValueOnce({ id: 'plan-1', athleteId: 'athlete-1', coachId: 'owner-1', deletedAt: null })
      .mockResolvedValueOnce({ id: 'plan-1', athleteId: 'athlete-1', coachId: 'owner-1', workouts: [{ status: 'COMPLETED' }, { status: 'SCHEDULED' }] });
    const r: any = await svc.findById('plan-1', COACH);
    expect(r.completionPercentage).toBe(50);
    expect(r.canManage).toBe(true);
  });

  it('coach de outra equipe recebe 404; planilha excluída = 404', async () => {
    const { svc, prisma } = makePrisma();
    await expect(svc.findById('plan-1', OTHER)).rejects.toBeInstanceOf(NotFoundException);
    prisma.trainingPlan.findUnique.mockResolvedValueOnce({ id: 'plan-1', athleteId: 'athlete-1', deletedAt: new Date() });
    await expect(svc.findById('plan-1', COACH)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('atleta não vê planilha de outro atleta', async () => {
    const { svc, prisma } = makePrisma();
    prisma.trainingPlan.findUnique.mockResolvedValueOnce({ id: 'plan-1', athleteId: 'outro', deletedAt: null });
    await expect(svc.findById('plan-1', ATHLETE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('planilha ativa do atleta com progresso', async () => {
    const { svc, prisma } = makePrisma();
    prisma.trainingPlan.findFirst.mockResolvedValue({ id: 'p1', name: 'Ativa', _count: { workouts: 22 } });
    prisma.workout.count.mockResolvedValue(17);
    const r: any = await svc.findActiveForAthlete('athlete-1', COACH);
    expect(prisma.trainingPlan.findFirst.mock.calls[0][0].where).toEqual({ athleteId: 'athlete-1', status: 'ACTIVE', deletedAt: null });
    expect(r.totalWorkouts).toBe(22);
    expect(r.completedWorkouts).toBe(17);
    await expect(svc.findActiveForAthlete('athlete-1', OTHER)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TrainingPlansService — update / status', () => {
  it('não ativa planilha sem treinos', async () => {
    const { svc, prisma } = makePrisma();
    prisma.workout.count.mockResolvedValue(0);
    await expect(svc.update('plan-1', COACH, { status: PlanStatus.ACTIVE })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ativar pausa outras ativas do mesmo atleta', async () => {
    const { svc, prisma } = makePrisma();
    prisma.workout.count.mockResolvedValue(3);
    await svc.update('plan-1', COACH, { status: PlanStatus.ACTIVE });
    expect(prisma.trainingPlan.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ athleteId: 'athlete-1', status: 'ACTIVE', id: { not: 'plan-1' } }),
      data: { status: 'PAUSED' },
    }));
  });

  it('rejeita fim anterior ao início considerando a data já gravada', async () => {
    const { svc } = makePrisma();
    await expect(svc.update('plan-1', COACH, { endDate: '2026-10-01' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('coach de outra equipe não edita', async () => {
    const { svc, prisma } = makePrisma();
    await expect(svc.update('plan-1', OTHER, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.trainingPlan.update).not.toHaveBeenCalled();
  });

  it('STAFF vê mas não edita', async () => {
    const { svc, prisma } = makePrisma();
    await expect(svc.update('plan-1', STAFF, { name: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.trainingPlan.update).not.toHaveBeenCalled();
  });
});

describe('TrainingPlansService — delete / duplicate', () => {
  it('sem histórico: exclusão física (cascata)', async () => {
    const { svc, prisma } = makePrisma();
    const r = await svc.remove('plan-1', COACH);
    expect(r).toEqual({ deleted: true, soft: false });
    expect(prisma.trainingPlan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
  });

  it('com treinos realizados: exclusão lógica preservando histórico', async () => {
    const { svc, prisma } = makePrisma();
    prisma.workout.count.mockResolvedValue(5);
    const r = await svc.remove('plan-1', COACH);
    expect(r.soft).toBe(true);
    expect(prisma.trainingPlan.delete).not.toHaveBeenCalled();
    expect(prisma.trainingPlan.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    expect(prisma.workout.deleteMany.mock.calls[0][0].where).toEqual({ planId: 'plan-1', status: { not: 'COMPLETED' }, result: { is: null } });
  });

  it('outro coach não exclui', async () => {
    const { svc, prisma } = makePrisma();
    await expect(svc.remove('plan-1', OTHER)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.trainingPlan.delete).not.toHaveBeenCalled();
  });

  it('duplica como modelo, deslocando os treinos para a nova data de início', async () => {
    const { svc, prisma } = makePrisma();
    prisma.workout.findMany.mockResolvedValue([
      { scheduledDate: new Date('2026-11-03T12:00:00Z'), type: 'EASY_RUN', title: 'Leve', description: null, targetDistanceMeters: 5000, targetDurationSeconds: null, targetPace: '6:00', heartRateZone: null, coachNotes: null, status: 'COMPLETED' },
    ]);
    const r: any = await svc.duplicate('plan-1', COACH, { startDate: '2026-12-07' });
    const planData = prisma.trainingPlan.create.mock.calls[0][0].data;
    expect(planData.status).toBe('DRAFT');
    expect(planData.name).toBe('Plano (cópia)');
    expect(planData.startDate.toISOString()).toBe('2026-12-07T12:00:00.000Z');
    expect(planData.endDate.toISOString()).toBe('2027-01-03T12:00:00.000Z');
    const w = prisma.workout.createMany.mock.calls[0][0].data[0];
    expect(w.scheduledDate.toISOString()).toBe('2026-12-08T12:00:00.000Z');
    expect(w.status).toBe('SCHEDULED');
    expect(r.workoutsCopied).toBe(1);
  });

  it('duplicar para atleta alheio é bloqueado', async () => {
    const { svc, prisma } = makePrisma();
    prisma.athleteProfile.findUnique.mockImplementation(async ({ where }: any) =>
      where.userId === 'athlete-1' ? { coachId: 'coach-1', teamId: 'team-1' } : { coachId: 'x', teamId: 'team-x' });
    await expect(svc.duplicate('plan-1', COACH, { athleteId: 'victim' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.trainingPlan.create).not.toHaveBeenCalled();
  });
});

describe('TrainingPlansService — treinos da planilha', () => {
  it('adiciona treino com data de calendário e título padrão pelo tipo', async () => {
    const { svc, prisma } = makePrisma();
    const w: any = await svc.addWorkout('plan-1', COACH, { scheduledDate: '2026-11-03', type: 'LONG_RUN' as any, targetDistanceMeters: 15000, targetPace: '6:10/km' });
    const data = prisma.workout.create.mock.calls[0][0].data;
    expect(data.athleteId).toBe('athlete-1');
    expect(data.title).toBe('Longão');
    expect(data.targetPace).toBe('6:10');
    expect(data.scheduledDate.toISOString()).toBe('2026-11-03T12:00:00.000Z');
    expect(w.id).toBe('w-new');
  });

  it('edita treino da planilha (e só da planilha correta)', async () => {
    const { svc, prisma } = makePrisma();
    prisma.workout.findUnique.mockResolvedValue({ id: 'w1', planId: 'plan-1', result: null, status: 'SCHEDULED' });
    await svc.updateWorkout('plan-1', 'w1', COACH, { targetPace: null, title: 'Novo' });
    expect(prisma.workout.update.mock.calls[0][0].data).toEqual({ title: 'Novo', targetPace: null });
    prisma.workout.findUnique.mockResolvedValue({ id: 'w1', planId: 'outra', result: null });
    await expect(svc.updateWorkout('plan-1', 'w1', COACH, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('não exclui treino já realizado', async () => {
    const { svc, prisma } = makePrisma();
    prisma.workout.findUnique.mockResolvedValue({ id: 'w1', planId: 'plan-1', result: { id: 'r' }, status: 'COMPLETED' });
    await expect(svc.deleteWorkout('plan-1', 'w1', COACH)).rejects.toBeInstanceOf(BadRequestException);
    prisma.workout.findUnique.mockResolvedValue({ id: 'w1', planId: 'plan-1', result: null, status: 'SCHEDULED' });
    await expect(svc.deleteWorkout('plan-1', 'w1', COACH)).resolves.toEqual({ deleted: true });
  });

  it('coach de outra equipe não adiciona treino', async () => {
    const { svc, prisma } = makePrisma();
    await expect(svc.addWorkout('plan-1', OTHER, { scheduledDate: '2026-11-03', type: 'EASY_RUN' as any })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workout.create).not.toHaveBeenCalled();
  });
});
