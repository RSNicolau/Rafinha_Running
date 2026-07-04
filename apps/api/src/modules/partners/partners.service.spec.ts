/**
 * Unit tests for PartnersService.
 *
 * Uses a mocked PrismaService so no database connection is required — safe to run in CI.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrismaMock() {
  return {
    partner: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    athleteProfile: {
      findUnique: jest.fn(),
    },
    coachProfile: {
      findFirst: jest.fn(),
    },
  };
}

describe('PartnersService', () => {
  let service: PartnersService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PartnersService>(PartnersService);
  });

  describe('getForAthlete()', () => {
    it('returns active partners of the athlete coach', async () => {
      prisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'coach-1' });
      const partners = [{ id: 'p1', name: 'Garmin' }];
      prisma.partner.findMany.mockResolvedValue(partners);

      const result = await service.getForAthlete('athlete-1');

      expect(prisma.partner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coachId: 'coach-1', isActive: true } }),
      );
      expect(result).toEqual(partners);
    });

    it('returns empty list when athlete has no coach', async () => {
      prisma.athleteProfile.findUnique.mockResolvedValue(null);

      const result = await service.getForAthlete('athlete-1');

      expect(result).toEqual([]);
      expect(prisma.partner.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getPublic()', () => {
    it('resolves coach by slug before querying', async () => {
      prisma.coachProfile.findFirst.mockResolvedValue({ userId: 'coach-9' });
      prisma.partner.findMany.mockResolvedValue([]);

      await service.getPublic('rafinha');

      expect(prisma.partner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coachId: 'coach-9', isActive: true } }),
      );
    });

    it('falls back to treating the param as coachId when no slug matches', async () => {
      prisma.coachProfile.findFirst.mockResolvedValue(null);
      prisma.partner.findMany.mockResolvedValue([]);

      await service.getPublic('coach-id-123');

      expect(prisma.partner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coachId: 'coach-id-123', isActive: true } }),
      );
    });
  });

  describe('create()', () => {
    it('creates a partner scoped to the coach', async () => {
      const created = { id: 'p1', name: 'Gatorade' };
      prisma.partner.create.mockResolvedValue(created);

      const result = await service.create('coach-1', { name: '  Gatorade ', category: 'Hidratação' });

      expect(prisma.partner.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ coachId: 'coach-1', name: 'Gatorade', category: 'Hidratação' }),
        }),
      );
      expect(result).toEqual(created);
    });

    it('rejects empty name', async () => {
      await expect(service.create('coach-1', { name: '  ' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update()', () => {
    it('updates own partner', async () => {
      prisma.partner.findUnique.mockResolvedValue({ id: 'p1', coachId: 'coach-1' });
      prisma.partner.update.mockResolvedValue({ id: 'p1', isActive: false });

      const result = await service.update('p1', 'coach-1', { isActive: false });

      expect(prisma.partner.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1' }, data: { isActive: false } }),
      );
      expect(result).toEqual({ id: 'p1', isActive: false });
    });

    it('throws NotFound for unknown partner', async () => {
      prisma.partner.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', 'coach-1', {})).rejects.toThrow(NotFoundException);
    });

    it("throws Forbidden when updating another coach's partner", async () => {
      prisma.partner.findUnique.mockResolvedValue({ id: 'p1', coachId: 'other-coach' });
      await expect(service.update('p1', 'coach-1', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove()', () => {
    it('deletes own partner', async () => {
      prisma.partner.findUnique.mockResolvedValue({ id: 'p1', coachId: 'coach-1' });
      prisma.partner.delete.mockResolvedValue({});

      const result = await service.remove('p1', 'coach-1');

      expect(prisma.partner.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(result).toEqual({ deleted: true });
    });

    it("throws Forbidden when deleting another coach's partner", async () => {
      prisma.partner.findUnique.mockResolvedValue({ id: 'p1', coachId: 'other-coach' });
      await expect(service.remove('p1', 'coach-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
