import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BadgesController } from './badges.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { isRoleAllowed } from '../../common/guards/roles.guard';

describe('H2 — badges', () => {
  const prisma: any = { athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'other' }) } };
  const svc: any = { getAthleteBadges: jest.fn(), checkAndAwardBadges: jest.fn() };
  const ctrl = new BadgesController(svc, prisma);
  const coach = { id: 'coach-1', role: 'COACH' };

  it('coach não lê/concede badges de atleta alheio', async () => {
    await expect(ctrl.getAthleteBadges('victim', coach)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctrl.checkAthleteBadges('victim', coach)).rejects.toBeInstanceOf(NotFoundException);
    expect(svc.getAthleteBadges).not.toHaveBeenCalled();
    expect(svc.checkAndAwardBadges).not.toHaveBeenCalled();
  });

  it('POST /badges/seed é somente SUPER_ADMIN', () => {
    const roles = new Reflector().get(ROLES_KEY, BadgesController.prototype.seedBadges);
    expect(roles).toEqual(['SUPER_ADMIN']);
    expect(isRoleAllowed('COACH', roles)).toBe(false);
    expect(isRoleAllowed('ADMIN', roles)).toBe(false);
    expect(isRoleAllowed('SUPER_ADMIN', roles)).toBe(true);
  });
});
