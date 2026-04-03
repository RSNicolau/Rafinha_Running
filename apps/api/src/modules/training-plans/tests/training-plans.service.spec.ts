import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TrainingPlansService } from '../training-plans.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { UserRole, PlanStatus } from '@prisma/client';

const mockNotifications = {
  createNotification: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  trainingPlan: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workout: {
    deleteMany: jest.fn(),
  },
};

const mockPlan = {
  id: 'plan-1',
  coachId: 'coach-1',
  athleteId: 'athlete-1',
  name: 'Plano Maratona',
  description: 'Preparação para maratona',
  startDate: new Date('2026-04-01'),
  endDate: new Date('2026-10-01'),
  weeklyFrequency: 4,
  status: PlanStatus.DRAFT,
  athlete: { id: 'athlete-1', name: 'João Atleta', avatarUrl: null },
  coach: { id: 'coach-1', name: 'Rafinha Coach' },
  workouts: [],
};

describe('TrainingPlansService', () => {
  let service: TrainingPlansService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingPlansService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<TrainingPlansService>(TrainingPlansService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      athleteId: 'athlete-1',
      name: 'Plano Maratona',
      description: 'Preparação',
      startDate: '2026-04-01',
      endDate: '2026-10-01',
      weeklyFrequency: 4,
    };

    it('deve criar plano e notificar atleta', async () => {
      mockPrisma.trainingPlan.create.mockResolvedValue(mockPlan);

      const result = await service.create('coach-1', dto as any);

      expect(mockPrisma.trainingPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            coachId: 'coach-1',
            status: PlanStatus.DRAFT,
          }),
        }),
      );
      expect(result.id).toBe('plan-1');
      // Notificação é fire-and-forget, não bloqueia
      expect(mockNotifications.createNotification).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('deve retornar planos paginados para coach', async () => {
      mockPrisma.trainingPlan.findMany.mockResolvedValue([mockPlan]);
      mockPrisma.trainingPlan.count.mockResolvedValue(1);

      const result = await service.findAll('coach-1', UserRole.COACH, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      // coach vê apenas seus planos
      expect(mockPrisma.trainingPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coachId: 'coach-1' } }),
      );
    });

    it('deve retornar planos paginados para atleta', async () => {
      mockPrisma.trainingPlan.findMany.mockResolvedValue([mockPlan]);
      mockPrisma.trainingPlan.count.mockResolvedValue(1);

      await service.findAll('athlete-1', UserRole.ATHLETE, 1, 20);

      expect(mockPrisma.trainingPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { athleteId: 'athlete-1' } }),
      );
    });

    it('deve paginar corretamente', async () => {
      mockPrisma.trainingPlan.findMany.mockResolvedValue([]);
      mockPrisma.trainingPlan.count.mockResolvedValue(45);

      const result = await service.findAll('coach-1', UserRole.COACH, 2, 20);

      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(2);
    });
  });

  describe('findById', () => {
    it('deve retornar plano com estatísticas', async () => {
      const planWithWorkouts = {
        ...mockPlan,
        workouts: [
          { status: 'COMPLETED' },
          { status: 'SCHEDULED' },
          { status: 'COMPLETED' },
        ],
      };
      mockPrisma.trainingPlan.findUnique.mockResolvedValue(planWithWorkouts);

      const result = await service.findById('plan-1', 'coach-1', UserRole.COACH);

      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException quando plano não existe', async () => {
      mockPrisma.trainingPlan.findUnique.mockResolvedValue(null);

      await expect(service.findById('nao-existe', 'coach-1', UserRole.COACH))
        .rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando atleta tenta ver plano de outro', async () => {
      mockPrisma.trainingPlan.findUnique.mockResolvedValue({ ...mockPlan, athleteId: 'outro-atleta' });

      await expect(service.findById('plan-1', 'athlete-1', UserRole.ATHLETE))
        .rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException quando coach tenta ver plano de outro', async () => {
      mockPrisma.trainingPlan.findUnique.mockResolvedValue({ ...mockPlan, coachId: 'outro-coach' });

      await expect(service.findById('plan-1', 'coach-1', UserRole.COACH))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
