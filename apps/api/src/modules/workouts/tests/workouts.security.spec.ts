import { NotFoundException } from '@nestjs/common';
import { WorkoutsService } from '../workouts.service';
import { WorkoutsController } from '../workouts.controller';

function setup(workout: any, ownerCoach: string | null) {
  const prisma: any = {
    workout: { findUnique: jest.fn().mockResolvedValue(workout) },
    athleteProfile: { findUnique: jest.fn().mockResolvedValue(ownerCoach ? { coachId: ownerCoach } : null) },
  };
  const svc = new WorkoutsService(prisma, {} as any, {} as any);
  return { prisma, svc };
}

const w = { id: 'w1', athleteId: 'ath-1', plan: { id: 'p1', name: 'P', coachId: 'coach-1' }, result: null };

describe('H2 — GET /workouts/:id ownership', () => {
  it('atleta não lê treino de outro atleta', async () => {
    const { svc } = setup(w, 'coach-1');
    await expect(svc.findByIdForUser('w1', { id: 'ath-2', role: 'ATHLETE' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('coach não lê treino de atleta de outro coach', async () => {
    const { svc } = setup({ ...w, plan: { ...w.plan, coachId: 'coach-1' } }, 'coach-1');
    await expect(svc.findByIdForUser('w1', { id: 'coach-2', role: 'COACH' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dono, coach do atleta e ADMIN leem', async () => {
    const { svc } = setup(w, 'coach-1');
    await expect(svc.findByIdForUser('w1', { id: 'ath-1', role: 'ATHLETE' })).resolves.toBeTruthy();
    await expect(svc.findByIdForUser('w1', { id: 'coach-1', role: 'COACH' })).resolves.toBeTruthy();
    await expect(svc.findByIdForUser('w1', { id: 'x', role: 'SUPER_ADMIN' })).resolves.toBeTruthy();
  });
});

describe('H2 — GET /workouts/training-load/:athleteId', () => {
  it('coach não acessa carga de atleta alheio', async () => {
    const prisma: any = { athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'other' }) } };
    const tl = { getTrainingLoad: jest.fn() };
    const ctrl = new WorkoutsController({} as any, tl as any, prisma, {} as any, {} as any);
    await expect(ctrl.getAthleteTrainingLoad('victim', { id: 'coach-1', role: 'COACH' }, 30)).rejects.toBeInstanceOf(NotFoundException);
    expect(tl.getTrainingLoad).not.toHaveBeenCalled();
  });
});
