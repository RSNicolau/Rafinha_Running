import { BadRequestException } from '@nestjs/common';
import { WorkoutStatus } from '@prisma/client';
import {
  WorkoutsService,
  assertNotFutureWorkout,
  completionDateFor,
  computePace,
  parseLocalDate,
} from '../workouts.service';

function makeService() {
  const prisma: any = {
    workout: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    workoutResult: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({ id: 'r1' }) },
    user: { findUnique: jest.fn() },
  };
  const notifications: any = { createNotification: jest.fn().mockResolvedValue(undefined) };
  const badges: any = { checkAndAwardBadges: jest.fn().mockResolvedValue([]) };
  return { service: new WorkoutsService(prisma, notifications, badges), prisma };
}

describe('Workouts — datas no fuso de SP (M1/M3)', () => {
  it('weeklyKm filtra pela data do treino na semana seg→dom (não pela criação do registro)', async () => {
    const { service, prisma } = makeService();
    await service.getAthleteStats('a1', new Date('2026-10-15T12:00:00Z'));
    const weeklyWhere = prisma.workoutResult.findMany.mock.calls[1][0].where;
    expect(weeklyWhere.createdAt).toBeUndefined();
    const [byCompleted, byScheduled] = weeklyWhere.workout.OR;
    expect(byCompleted.completedAt.gte.toISOString()).toBe('2026-10-12T03:00:00.000Z');
    expect(byCompleted.completedAt.lt.toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(byScheduled.completedAt).toBeNull();
    expect(byScheduled.scheduledDate.gte.toISOString()).toBe('2026-10-12T03:00:00.000Z');
  });

  it('getWeeklyWorkouts normaliza para a segunda-feira', async () => {
    const { service, prisma } = makeService();
    const res = await service.getWeeklyWorkouts('a1', '2026-10-15');
    const where = prisma.workout.findMany.mock.calls[0][0].where;
    expect(where.scheduledDate.gte.toISOString()).toBe('2026-10-12T03:00:00.000Z');
    expect(where.scheduledDate.lt.toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(res.week).toBe('2026-10-12');
  });

  it('getCalendar: padrão mês; limita a 62 dias', async () => {
    const { service, prisma } = makeService();
    await service.getCalendar('a1', '2026-10-01', '2026-10-31');
    const where = prisma.workout.findMany.mock.calls[0][0].where;
    expect(where.athleteId).toBe('a1');
    expect(where.scheduledDate.gte.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(where.scheduledDate.lt.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    await expect(service.getCalendar('a1', '2026-01-01', '2026-06-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não aceita resultado de treino futuro', async () => {
    const { service, prisma } = makeService();
    const tomorrow = new Date(Date.now() + 2 * 86400000);
    prisma.workout.findUnique.mockResolvedValue({ id: 'w1', athleteId: 'a1', scheduledDate: tomorrow, plan: null });
    await expect(
      service.submitResult('w1', 'a1', { distanceMeters: 5000, durationSeconds: 1800 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.workoutResult.upsert).not.toHaveBeenCalled();
    await expect(service.markComplete('w1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resultado manual calcula o pace e usa upsert (feedback pode existir antes)', async () => {
    const { service, prisma } = makeService();
    const past = new Date('2026-10-10T10:00:00Z');
    prisma.workout.findUnique.mockResolvedValue({ id: 'w1', athleteId: 'a1', scheduledDate: past, plan: null, title: 'x' });
    await service.submitResult('w1', 'a1', { distanceMeters: 10000, durationSeconds: 3000 } as any);
    const args = prisma.workoutResult.upsert.mock.calls[0][0];
    expect(args.create.avgPace).toBe('5:00');
    expect(args.update.avgPace).toBe('5:00');
    const upd = prisma.workout.update.mock.calls[0][0];
    expect(upd.data.status).toBe(WorkoutStatus.COMPLETED);
    // treino de dia anterior → conclusão no dia agendado (não infla a semana atual)
    expect(upd.data.completedAt).toEqual(past);
  });

  it('rejeita resultado sem distância e sem duração', async () => {
    const { service, prisma } = makeService();
    prisma.workout.findUnique.mockResolvedValue({ id: 'w1', athleteId: 'a1', scheduledDate: new Date('2026-10-10'), plan: null });
    await expect(service.submitResult('w1', 'a1', { distanceMeters: 0, durationSeconds: 0 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('helpers', () => {
    expect(computePace(5000, 1500)).toBe('5:00');
    expect(computePace(0, 100)).toBeNull();
    expect(parseLocalDate('2026-10-15')!.toISOString()).toBe('2026-10-15T03:00:00.000Z');
    expect(parseLocalDate('lixo')).toBeNull();
    const now = new Date('2026-10-15T15:00:00Z');
    expect(() => assertNotFutureWorkout(new Date('2026-10-15T20:00:00Z'), now)).not.toThrow(); // hoje
    expect(() => assertNotFutureWorkout(new Date('2026-10-16T04:00:00Z'), now)).toThrow(BadRequestException); // amanhã SP
    expect(completionDateFor(new Date('2026-10-15T10:00:00Z'), now)).toBe(now);
  });
});
