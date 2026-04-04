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
import { NotFoundException } from '@nestjs/common';
import { AdminService } from '../admin.service';
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
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

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

      const result = await service.deleteUser('u1', 'admin-1');
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

      const result = await service.hardDeleteUser('u1', 'admin-1');
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ── updateUserRole ─────────────────────────────────────────────────────────

  describe('updateUserRole', () => {
    it('atualiza role do usuário', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'COACH' });
      const result = await service.updateUserRole('u1', 'COACH' as any);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: 'COACH' } }),
      );
      expect(result.role).toBe('COACH');
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
});
