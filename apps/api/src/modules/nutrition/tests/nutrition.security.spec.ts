import { NotFoundException } from '@nestjs/common';
import { NutritionController } from '../nutrition.controller';

describe('H2 — GET /nutrition/coach/:athleteId', () => {
  it('coach não lê nutrição de atleta de outro coach', async () => {
    const prisma: any = { athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'other' }) } };
    const svc: any = { getDaySummary: jest.fn() };
    const ctrl = new NutritionController(svc, prisma);
    await expect(ctrl.getAthleteLogsForCoach({ id: 'coach-1', role: 'COACH' }, 'victim', '')).rejects.toBeInstanceOf(NotFoundException);
    expect(svc.getDaySummary).not.toHaveBeenCalled();
  });

  it('coach lê o próprio atleta', async () => {
    const prisma: any = { athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1' }) } };
    const svc: any = { getDaySummary: jest.fn().mockResolvedValue({ ok: 1 }) };
    const ctrl = new NutritionController(svc, prisma);
    await expect(ctrl.getAthleteLogsForCoach({ id: 'coach-1', role: 'COACH' }, 'mine', '2026-01-01')).resolves.toEqual({ ok: 1 });
  });
});
