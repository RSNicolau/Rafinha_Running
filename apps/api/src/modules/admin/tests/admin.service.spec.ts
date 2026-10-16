/**
 * Unit tests for AdminService
 *
 * Critical paths:
 *  - getUsers: search, pagination, total count
 *  - getAnalytics: aggregates across users/subscriptions/workouts
 *  - deleteUser / hardDeleteUser: soft-delete + audit log in transaction
 *  - updateUserRole: delegates to prisma.user.update
 *  - getPlansConfig / updatePlansConfig: read/write AppConfig
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AdminService, COACH_WHERE } from '../admin.service';
import { ConflictException } from '@nestjs/common';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetCoachPlatformFeeDto } from '../dto/admin.dto';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Prisma mock ────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findMany:  jest.fn(),
    count:     jest.fn(),
    findUnique: jest.fn(),
    update:    jest.fn(),
  },
  subscription: {
    count:      jest.fn(),
    updateMany: jest.fn(),
  },
  payment: {
    aggregate: jest.fn(),
  },
  workout: {
    count: jest.fn(),
  },
  appConfig: {
    findUnique: jest.fn(),
    upsert:     jest.fn(),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
  coachProfile: {
    findUnique: jest.fn(),
    findFirst:  jest.fn(),
    update:     jest.fn(),
    create:     jest.fn(),
    upsert:     jest.fn(),
  },
  $transaction: jest.fn(),
};

const ADMIN = { id: 'admin-1', role: 'ADMIN' as const };
const SUPER = { id: 'super-1', role: 'SUPER_ADMIN' as const };

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();

    // Default: $transaction executes its callback array
    mockPrisma.$transaction.mockImplementation((ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(mockPrisma),
    );
  });

  // ── getUsers ───────────────────────────────────────────────────────────────

  describe('getUsers', () => {
    it('retorna usuários paginados sem filtro', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'a@test.com', name: 'A', role: 'ATHLETE', isActive: true, subscriptions: [] },
      ]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.getUsers();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('passa filtro de busca para prisma', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.getUsers(1, 20, 'joão');
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });

    it('calcula totalPages corretamente', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(50);

      const result = await service.getUsers(1, 20);
      expect(result.totalPages).toBe(3);
    });
  });

  // ── getAnalytics ───────────────────────────────────────────────────────────

  describe('getAnalytics', () => {
    it('retorna métricas corretas', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100) // totalUsers
        .mockResolvedValueOnce(80)  // athletes
        .mockResolvedValueOnce(20); // coaches
      mockPrisma.subscription.count.mockResolvedValue(40);
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 200000 } });
      mockPrisma.workout.count.mockResolvedValue(300);

      const result = await service.getAnalytics();
      expect(result.totalUsers).toBe(100);
      expect(result.athletes).toBe(80);
      expect(result.coaches).toBe(20);
      expect(result.activeSubscriptions).toBe(40);
      expect(result.totalRevenueCents).toBe(200000);
      expect(result.workoutsCompleted).toBe(300);
    });

    it('retorna conversionRate 0 quando totalUsers é 0', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.subscription.count.mockResolvedValue(0);
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
      mockPrisma.workout.count.mockResolvedValue(0);

      const result = await service.getAnalytics();
      expect(result.conversionRate).toBe(0);
    });
  });

  // ── deleteUser ─────────────────────────────────────────────────────────────

  describe('deleteUser', () => {
    it('lança NotFoundException quando usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.deleteUser('not-exists')).rejects.toThrow(NotFoundException);
    });

    it('desativa usuário e cria audit log em transação', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@test.com', role: 'ATHLETE' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.deleteUser('u1', ADMIN);
      expect(result.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ── hardDeleteUser ─────────────────────────────────────────────────────────

  describe('hardDeleteUser', () => {
    it('lança NotFoundException quando usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.hardDeleteUser('not-exists')).rejects.toThrow(NotFoundException);
    });

    it('desativa usuário, cancela assinaturas e cria audit log', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'b@test.com', role: 'COACH' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.subscription.updateMany.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.hardDeleteUser('u1', ADMIN);
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ── updateUserRole ─────────────────────────────────────────────────────────

  describe('updateUserRole', () => {
    it('SUPER_ADMIN atualiza role do usuário e revoga as sessões', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ATHLETE' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'COACH' });
      const result = await service.updateUserRole('u1', 'COACH' as any, SUPER);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: 'COACH', tokenVersion: { increment: 1 } } }),
      );
      expect(result.role).toBe('COACH');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('ADMIN não pode alterar roles (nem promover a SUPER_ADMIN)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ATHLETE' });
      await expect(service.updateUserRole('u1', 'SUPER_ADMIN' as any, ADMIN)).rejects.toThrow(ForbiddenException);
      await expect(service.updateUserRole('u1', 'COACH' as any, ADMIN)).rejects.toThrow(ForbiddenException);
      await expect(service.updateUserRole('u1', 'COACH' as any)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejeita role inválida', async () => {
      await expect(service.updateUserRole('u1', 'ROOT' as any, SUPER)).rejects.toThrow(BadRequestException);
    });

    it('SUPER_ADMIN não pode rebaixar a si mesmo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'super-1', role: 'SUPER_ADMIN' });
      await expect(service.updateUserRole('super-1', 'ADMIN' as any, SUPER)).rejects.toThrow(BadRequestException);
    });
  });

  describe('proteção de contas SUPER_ADMIN', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 's2', email: 's@x.com', role: 'SUPER_ADMIN' });
    });

    it('ADMIN não pode desativar/excluir SUPER_ADMIN', async () => {
      await expect(service.deleteUser('s2', ADMIN)).rejects.toThrow(ForbiddenException);
      await expect(service.hardDeleteUser('s2', ADMIN)).rejects.toThrow(ForbiddenException);
      await expect(service.setUserActiveStatus('s2', false, ADMIN)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('SUPER_ADMIN pode desativar outro SUPER_ADMIN (com revogação de sessão)', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      await service.setUserActiveStatus('s2', false, SUPER);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 's2' },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      });
    });
  });

  describe('setUserPassword / setUserPasswordByEmail', () => {
    it('exigem SUPER_ADMIN', async () => {
      await expect(service.setUserPassword('u1', 'senhaforte1', ADMIN)).rejects.toThrow(ForbiddenException);
      await expect(service.setUserPasswordByEmail('a@b.com', 'senhaforte1', ADMIN)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejeita senha curta', async () => {
      await expect(service.setUserPassword('u1', '123', SUPER)).rejects.toThrow(BadRequestException);
    });

    it('SUPER_ADMIN redefine senha por e-mail e revoga sessões', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'COACH' });
      mockPrisma.user.update.mockResolvedValue({});
      const res = await service.setUserPasswordByEmail('a@b.com', 'senhaforte1', SUPER);
      expect(res.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tokenVersion: { increment: 1 } }) }),
      );
    });
  });

  // ── getPlansConfig / updatePlansConfig ────────────────────────────────────

  describe('getPlansConfig', () => {
    it('retorna planos do banco quando configurados', async () => {
      const customPlans = { coach: [{ id: 'PRO', name: 'Pro', price: 9900 }] };
      mockPrisma.appConfig.findUnique.mockResolvedValue({ value: customPlans });

      const result = await service.getPlansConfig();
      expect(result).toEqual(customPlans);
    });

    it('retorna planos padrão quando AppConfig não existe', async () => {
      mockPrisma.appConfig.findUnique.mockResolvedValue(null);

      const result = await service.getPlansConfig() as any;
      expect(Array.isArray(result.coach)).toBe(true);
      expect(result.coach.length).toBeGreaterThan(0);
    });
  });

  describe('updatePlansConfig', () => {
    it('salva planos no AppConfig', async () => {
      const plans = { coach: [], athlete: [] };
      mockPrisma.appConfig.upsert.mockResolvedValue({ key: 'plans', value: plans });

      await service.updatePlansConfig(plans);
      expect(mockPrisma.appConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'plans' } }),
      );
    });
  });

  // ── coach slug / taxa / métricas (QA plataforma M2, B1, B6) ────────────────
  describe('setCoachSlug', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'c1', role: 'COACH' });
      mockPrisma.coachProfile.findFirst.mockResolvedValue(null);
      mockPrisma.coachProfile.findUnique.mockResolvedValue({ userId: 'c1', slug: 'velho' });
      mockPrisma.coachProfile.update.mockResolvedValue({});
    });

    it('normaliza e grava slug válido', async () => {
      await expect(service.setCoachSlug('c1', '  Equipe-Run ')).resolves.toEqual({ success: true, userId: 'c1', slug: 'equipe-run' });
      expect(mockPrisma.coachProfile.update).toHaveBeenCalledWith({ where: { userId: 'c1' }, data: { slug: 'equipe-run' } });
    });

    it('rejeita slug com caracteres inválidos (400) sem tocar no banco', async () => {
      await expect(service.setCoachSlug('c1', '../<script>alert(1)</script>')).rejects.toThrow(BadRequestException);
      await expect(service.setCoachSlug('c1', 'admin')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.coachProfile.update).not.toHaveBeenCalled();
    });

    it('slug de outro treinador → 409', async () => {
      mockPrisma.coachProfile.findFirst.mockResolvedValue({ id: 'outro' });
      await expect(service.setCoachSlug('c1', 'rafinha')).rejects.toThrow(ConflictException);
      expect(mockPrisma.coachProfile.update).not.toHaveBeenCalled();
    });

    it('corrida na unique (P2002) → 409', async () => {
      mockPrisma.coachProfile.update.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(service.setCoachSlug('c1', 'rafinha')).rejects.toThrow(ConflictException);
    });
  });

  describe('setCoachPlatformFee', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.coachProfile.upsert.mockResolvedValue({});
    });

    it('aceita 0–50', async () => {
      await expect(service.setCoachPlatformFee('c1', 12.5)).resolves.toEqual({ success: true, coachId: 'c1', platformFeePercent: 12.5 });
    });

    it.each([NaN, -1, 51, 'abc' as any])('rejeita %p com 400 (antes: 500)', async (v) => {
      await expect(service.setCoachPlatformFee('c1', v)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.coachProfile.upsert).not.toHaveBeenCalled();
    });

    it('DTO valida número 0–50 (como /admin/teams/:id/fee)', async () => {
      const errs = async (body: any) => validate(plainToInstance(SetCoachPlatformFeeDto, body));
      expect(await errs({ platformFeePercent: 5 })).toHaveLength(0);
      expect(await errs({ platformFeePercent: 'abc' })).not.toHaveLength(0);
      expect(await errs({ platformFeePercent: 60 })).not.toHaveLength(0);
      expect(await errs({ platformFeePercent: -1 })).not.toHaveLength(0);
      expect(await errs({})).not.toHaveLength(0);
    });
  });

  describe('getPlatformStats / getCoaches — só treinadores (sem ADMIN)', () => {
    it('conta apenas COACH dono/membro de equipe', async () => {
      mockPrisma.user.count.mockResolvedValue(3);
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
      await service.getPlatformStats();
      const wheres = mockPrisma.user.count.mock.calls.map((c: any[]) => c[0].where);
      expect(wheres[0]).toEqual(COACH_WHERE);
      expect(wheres[1]).toEqual({ ...COACH_WHERE, isActive: true });
      expect(JSON.stringify(wheres[0])).not.toContain('ADMIN');
    });

    it('listagem usa o mesmo critério', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await service.getCoaches();
      expect(mockPrisma.user.findMany.mock.calls[0][0].where).toEqual(COACH_WHERE);
    });
  });
});
