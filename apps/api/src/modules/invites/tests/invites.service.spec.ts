/**
 * Unit tests for InvitesService
 *
 * Critical paths:
 *  - createInvite: throws ConflictException on duplicate pending invite
 *  - getInviteByToken: throws for unknown/expired/non-pending token
 *  - acceptInvite: links existing user OR creates new athlete account
 *  - cancelInvite: throws for non-existent or non-pending invite
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InvitesService } from '../invites.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

jest.mock('bcrypt', () => ({
  hash:    jest.fn().mockResolvedValue('$2b$10$hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

// ── Prisma mock ────────────────────────────────────────────────────────────────

const mockPrisma = {
  coachInvite: {
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    findMany:   jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create:     jest.fn(),
  },
  athleteProfile: {
    upsert:  jest.fn(),
    create:  jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockNotifications = {
  createNotification: jest.fn().mockResolvedValue({}),
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('InvitesService', () => {
  let service: InvitesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        { provide: PrismaService,       useValue: mockPrisma        },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<InvitesService>(InvitesService);
    jest.clearAllMocks();

    // Default $transaction: execute callback or array
    mockPrisma.$transaction.mockImplementation((ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(mockPrisma),
    );
  });

  // ── createInvite ───────────────────────────────────────────────────────────

  describe('createInvite', () => {
    it('throws ConflictException when a pending invite already exists for that email', async () => {
      mockPrisma.coachInvite.findFirst.mockResolvedValue({ id: 'inv-existing' });
      await expect(
        service.createInvite('coach-1', { email: 'athlete@test.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a new invite when none pending', async () => {
      mockPrisma.coachInvite.findFirst.mockResolvedValue(null);
      mockPrisma.coachInvite.create.mockResolvedValue({
        id: 'inv-new', email: 'athlete@test.com', token: 'tok_abc',
        coachId: 'coach-1', status: 'PENDING', coach: { name: 'Coach', tenantBranding: null },
      });

      const result = await service.createInvite('coach-1', { email: 'athlete@test.com' });
      expect(result.token).toBe('tok_abc');
      expect(mockPrisma.coachInvite.create).toHaveBeenCalled();
    });
  });

  // ── getInviteByToken ───────────────────────────────────────────────────────

  describe('getInviteByToken', () => {
    it('throws NotFoundException for unknown token', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue(null);
      await expect(service.getInviteByToken('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for already accepted invite', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'ACCEPTED', expiresAt: new Date(Date.now() + 60_000),
        email: 'a@test.com', coach: { name: 'Coach', tenantBranding: null },
      });
      await expect(service.getInviteByToken('tok-accepted')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for expired invite', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'PENDING', expiresAt: new Date(Date.now() - 60_000),
        email: 'a@test.com', token: 'tok-expired',
        coach: { name: 'Coach', tenantBranding: null },
      });
      mockPrisma.coachInvite.update.mockResolvedValue({});
      await expect(service.getInviteByToken('tok-expired')).rejects.toThrow(BadRequestException);
    });

    it('returns invite info for valid pending invite', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'PENDING', expiresAt: new Date(Date.now() + 86_400_000),
        email: 'new@test.com',
        coach: { name: 'Rafinha', tenantBranding: { tenantName: 'RR', primaryColor: '#DC2626', logoUrl: null } },
      });

      const result = await service.getInviteByToken('tok-valid');
      expect(result.email).toBe('new@test.com');
      expect(result.coachName).toBe('Rafinha');
      expect(result.tenantName).toBe('RR');
    });
  });

  // ── acceptInvite ───────────────────────────────────────────────────────────

  describe('acceptInvite', () => {
    it('links existing user to coach when email already registered', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue({
        id: 'inv-1', token: 'tok-1', status: 'PENDING', coachId: 'coach-1',
        email: 'existing@test.com', expiresAt: new Date(Date.now() + 86_400_000),
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-existing', name: 'Existing User' });
      mockPrisma.athleteProfile.upsert.mockResolvedValue({});
      mockPrisma.coachInvite.update.mockResolvedValue({});

      const result = await service.acceptInvite({ token: 'tok-1', name: 'Existing User', password: 'pass123' });
      expect(result.userId).toBe('u-existing');
      expect(result.message).toContain('vinculada');
    });

    it('creates new athlete account when email not registered', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue({
        id: 'inv-2', token: 'tok-2', status: 'PENDING', coachId: 'coach-1',
        email: 'brand-new@test.com', expiresAt: new Date(Date.now() + 86_400_000),
      });
      mockPrisma.user.findUnique.mockResolvedValue(null); // no existing user

      const newUser = { id: 'u-new', name: 'New Athlete' };
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          athleteProfile: { create: jest.fn().mockResolvedValue({}) },
          coachInvite: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.acceptInvite({ token: 'tok-2', name: 'New Athlete', password: 'Pass12345' });
      expect(result.userId).toBe('u-new');
      expect(result.message).toContain('criada');
    });
  });

  // ── cancelInvite ───────────────────────────────────────────────────────────

  describe('cancelInvite', () => {
    it('throws NotFoundException when invite not found', async () => {
      mockPrisma.coachInvite.findFirst.mockResolvedValue(null);
      await expect(service.cancelInvite('coach-1', 'inv-999')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when invite is not pending', async () => {
      mockPrisma.coachInvite.findFirst.mockResolvedValue({ id: 'inv-1', status: 'ACCEPTED' });
      await expect(service.cancelInvite('coach-1', 'inv-1')).rejects.toThrow(BadRequestException);
    });

    it('cancels a pending invite', async () => {
      mockPrisma.coachInvite.findFirst.mockResolvedValue({ id: 'inv-1', status: 'PENDING' });
      mockPrisma.coachInvite.update.mockResolvedValue({ id: 'inv-1', status: 'CANCELLED' });

      const result = await service.cancelInvite('coach-1', 'inv-1') as any;
      expect(result.status).toBe('CANCELLED');
    });
  });
});
