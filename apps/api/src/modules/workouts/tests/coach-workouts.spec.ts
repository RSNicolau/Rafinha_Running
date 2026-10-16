import { NotFoundException } from '@nestjs/common';
import { CoachWorkoutsService, paceToSeconds } from '../coach-workouts.service';

function setup(owner = 'coach-1') {
  const prisma: any = {
    athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: owner, teamId: null }) },
    teamMember: { findFirst: jest.fn().mockResolvedValue(null) },
    workout: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    workoutResult: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { svc: new CoachWorkoutsService(prisma), prisma };
}
const COACH = { id: 'coach-1', role: 'COACH' };

describe('A1 — GET /workouts/athlete/:id (coach)', () => {
  it('lista treinos realizados do atleta com campos para a UI (data, distância, duração, pace, fonte)', async () => {
    const { svc, prisma } = setup();
    prisma.workout.findMany.mockResolvedValue([
      { id: 'w1', scheduledDate: new Date('2026-10-10T12:00:00Z'), completedAt: new Date('2026-10-10T09:30:00Z'), type: 'EASY_RUN', status: 'COMPLETED',
        result: { source: 'STRAVA', distanceMeters: 10000, durationSeconds: 3300, avgPace: null, rpe: 6 } },
    ]);
    prisma.workout.count.mockResolvedValue(17);
    const r = await svc.listForAthlete(COACH, 'ath-1', { limit: 10 });
    expect(prisma.workout.findMany.mock.calls[0][0].where).toEqual({ athleteId: 'ath-1', status: 'COMPLETED' });
    expect(r.total).toBe(17);
    expect(r.data[0]).toMatchObject({ distance: 10000, duration: 3300, pace: 330, source: 'STRAVA', date: '2026-10-10T09:30:00.000Z' });
  });

  it('filtro por mês (relatório) e status ALL', async () => {
    const { svc, prisma } = setup();
    await svc.listForAthlete(COACH, 'ath-1', { status: 'ALL', from: '2026-10-01', to: '2026-10-31', limit: 100 });
    expect(prisma.workout.findMany.mock.calls[0][0].where).toEqual({
      athleteId: 'ath-1',
      scheduledDate: { gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-31T23:59:59.999Z') },
    });
  });

  it('coach sem acesso ao atleta → 404 (sem consultar treinos)', async () => {
    const { svc, prisma } = setup('other');
    await expect(svc.listForAthlete(COACH, 'ath-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.statsForAthlete(COACH, 'ath-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workout.findMany).not.toHaveBeenCalled();
  });
});

describe('A1 — GET /workouts/athlete/:id/stats (coach)', () => {
  it('total, km, pace médio (s/km) e 8 semanas', async () => {
    const { svc, prisma } = setup();
    prisma.workout.count.mockResolvedValue(17);
    prisma.workoutResult.findMany.mockResolvedValue([
      { distanceMeters: 10000, durationSeconds: 3000 },
      { distanceMeters: 5000, durationSeconds: 1500 },
    ]);
    const s = await svc.statsForAthlete(COACH, 'ath-1');
    expect(s.totalWorkouts).toBe(17);
    expect(s.totalKm).toBe(15);
    expect(s.avgPace).toBe(300);
    expect(s.weeklyKm).toHaveLength(8);
    expect(s.streak).toBe(0);
  });

  it('paceToSeconds', () => {
    expect(paceToSeconds('5:30')).toBe(330);
    expect(paceToSeconds('5:30/km')).toBe(330);
    expect(paceToSeconds(null)).toBeNull();
  });
});
