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
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InvitesService } from '../invites.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EmailService } from '../../email/email.service';
import { LegalService } from '../../legal/legal.service';
import { TERMS_VERSION, PRIVACY_VERSION } from '../../legal/legal.constants';

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
    findFirst:  jest.fn(),
    create:     jest.fn(),
  },
  athleteProfile: {
    upsert:  jest.fn(),
    create:  jest.fn(),
  },
  teamMember: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  team: {
    findFirst: jest.fn().mockResolvedValue({ name: 'Rafinha Running', logoUrl: null, primaryColor: null }),
  },
  $transaction: jest.fn(),
};

const mockLegal = {
  assertCurrentVersions: jest.fn((input: any) => {
    if (input.termsVersion !== TERMS_VERSION || input.privacyVersion !== PRIVACY_VERSION) {
      throw new BadRequestException('versão');
    }
  }),
  recordConsent: jest.fn().mockResolvedValue(undefined),
};

const consent = { acceptTerms: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION };

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
        { provide: PrismaService,        useValue: mockPrisma        },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: LegalService, useValue: mockLegal },
        { provide: EmailService, useValue: { sendAthleteInvite: jest.fn().mockResolvedValue(undefined), sendInviteEmail: jest.fn().mockResolvedValue(undefined), sendWelcome: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<InvitesService>(InvitesService);
    jest.clearAllMocks();
    mockPrisma.user.findFirst.mockReset();

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

      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const result: any = await service.createInvite('coach-1', { email: 'athlete@test.com' });
      process.env.NODE_ENV = prev;
      // token só vai por e-mail — nunca na resposta da API
      expect(result.token).toBeUndefined();
      expect(result.id).toBe('inv-new');
      expect(mockPrisma.coachInvite.create).toHaveBeenCalled();
    });
  });

  // ── getInviteByToken ───────────────────────────────────────────────────────

  describe('getInviteByToken', () => {
    it('token ausente/vazio → 400 (antes: 500 do Prisma)', async () => {
      await expect(service.getInviteByToken(undefined as any)).rejects.toThrow(BadRequestException);
      await expect(service.getInviteByToken('   ')).rejects.toThrow(BadRequestException);
    });

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
    it('BLOCKS public accept for an email that already has an account (no relink)', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue({
        id: 'inv-1', token: 'tok-1', status: 'PENDING', coachId: 'coach-attacker',
        email: 'existing@test.com', expiresAt: new Date(Date.now() + 86_400_000),
      });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-existing' });

      await expect(
        service.acceptInvite({ token: 'tok-1', name: 'X', password: 'pass12345', ...consent }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.athleteProfile.upsert).not.toHaveBeenCalled();
    });

    it('rejects outdated legal versions', async () => {
      await expect(
        service.acceptInvite({ token: 't', name: 'X', password: 'pass12345', acceptTerms: true, termsVersion: 'old', privacyVersion: 'old' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates new athlete account when email not registered', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue({
        id: 'inv-2', token: 'tok-2', status: 'PENDING', coachId: 'coach-1',
        email: 'brand-new@test.com', expiresAt: new Date(Date.now() + 86_400_000),
      });
      mockPrisma.user.findFirst.mockResolvedValue(null); // no existing user

      const newUser = { id: 'u-new', name: 'New Athlete' };
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          athleteProfile: { create: jest.fn().mockResolvedValue({}) },
          coachInvite: { update: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.acceptInvite({ token: 'tok-2', name: 'New Athlete', password: 'Pass12345', ...consent });
      expect(result.userId).toBe('u-new');
      expect(result.message).toContain('criada');
      expect(mockLegal.recordConsent).toHaveBeenCalledWith(
        'u-new',
        expect.objectContaining({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('acceptInvite — consentimento de saúde e senha (B16/B1)', () => {
    const pending = {
      id: 'inv-3', token: 'tok-3', status: 'PENDING', coachId: 'coach-1',
      email: 'novo@test.com', expiresAt: new Date(Date.now() + 86_400_000),
    };
    beforeEach(() => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue(pending);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          user: { create: jest.fn().mockResolvedValue({ id: 'u-3', name: 'N' }) },
          athleteProfile: { create: jest.fn().mockResolvedValue({}) },
          coachInvite: { update: jest.fn().mockResolvedValue({}) },
        }),
      );
    });

    it('registra HEALTH_DATA junto com os Termos quando enviado (ConsentGate não pergunta de novo)', async () => {
      await service.acceptInvite({ token: 'tok-3', name: 'N', password: 'Pass12345', ...consent, healthDataConsent: true });
      expect(mockLegal.recordConsent).toHaveBeenCalledWith(
        'u-3', expect.objectContaining({ healthDataConsent: true }), expect.anything(), expect.anything(),
      );
    });

    it('sem o campo (clientes antigos) não grava HEALTH_DATA', async () => {
      await service.acceptInvite({ token: 'tok-3', name: 'N', password: 'Pass12345', ...consent });
      const input = mockLegal.recordConsent.mock.calls.at(-1)[1];
      expect(input).not.toHaveProperty('healthDataConsent');
    });

    it('senha fraca → 400', async () => {
      await expect(
        service.acceptInvite({ token: 'tok-3', name: 'N', password: '12345678', ...consent }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptInviteAsExistingUser', () => {
    const invite = {
      id: 'inv-1', token: 'tok-1', status: 'PENDING', coachId: 'coach-1',
      email: 'victim@test.com', expiresAt: new Date(Date.now() + 86_400_000),
    };

    it('rejects when logged-in user email differs from invite email', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue(invite);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-other', email: 'other@test.com', name: 'O', role: 'ATHLETE' });
      await expect(service.acceptInviteAsExistingUser({ id: 'u-other' }, 'tok-1')).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.athleteProfile.upsert).not.toHaveBeenCalled();
    });

    it('links when e-mails match', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue(invite);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-v', email: 'Victim@test.com', name: 'V', role: 'ATHLETE' });
      mockPrisma.athleteProfile.upsert.mockResolvedValue({});
      mockPrisma.coachInvite.update.mockResolvedValue({});
      const res = await service.acceptInviteAsExistingUser({ id: 'u-v' }, 'tok-1');
      expect(res.userId).toBe('u-v');
      expect(mockPrisma.athleteProfile.upsert).toHaveBeenCalled();
    });
  });

  // ── Equipe: atleta entra na equipe de quem convidou ─────────────────────────

  describe('vínculo com a equipe (team)', () => {
    const TEAM_M = [{ teamId: 'team-1', role: 'OWNER', createdAt: new Date(), team: { id: 'team-1', name: 'E', slug: 'e' } }];

    it('conta nova: athleteProfile recebe teamId da equipe padrão do treinador que convidou', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue({
        id: 'inv-3', token: 'tok-3', status: 'PENDING', coachId: 'coach-1',
        email: 'nova@test.com', expiresAt: new Date(Date.now() + 86_400_000),
      });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.teamMember.findMany.mockResolvedValue(TEAM_M);
      const createProfile = jest.fn().mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          user: { create: jest.fn().mockResolvedValue({ id: 'u-n', name: 'N' }) },
          athleteProfile: { create: createProfile },
          coachInvite: { update: jest.fn().mockResolvedValue({}) },
        }),
      );
      await service.acceptInvite({ token: 'tok-3', name: 'N', password: 'Pass12345', ...consent });
      expect(createProfile).toHaveBeenCalledWith({ data: { userId: 'u-n', coachId: 'coach-1', teamId: 'team-1' } });
      expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'coach-1', isActive: true }) }));
    });

    it('conta existente: upsert grava coachId = quem convidou e teamId da equipe', async () => {
      mockPrisma.coachInvite.findUnique.mockResolvedValue({
        id: 'inv-4', token: 'tok-4', status: 'PENDING', coachId: 'coach-1',
        email: 'v@test.com', expiresAt: new Date(Date.now() + 86_400_000),
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-v', email: 'v@test.com', name: 'V', role: 'ATHLETE' });
      mockPrisma.teamMember.findMany.mockResolvedValue(TEAM_M);
      mockPrisma.athleteProfile.upsert.mockResolvedValue({});
      mockPrisma.coachInvite.update.mockResolvedValue({});
      mockPrisma.$transaction.mockResolvedValue([]);
      await service.acceptInviteAsExistingUser({ id: 'u-v' }, 'tok-4');
      expect(mockPrisma.athleteProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'u-v' },
        update: { coachId: 'coach-1', teamId: 'team-1' },
        create: { userId: 'u-v', coachId: 'coach-1', teamId: 'team-1' },
      });
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
