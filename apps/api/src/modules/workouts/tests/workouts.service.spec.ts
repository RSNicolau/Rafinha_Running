import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { WorkoutsService } from '../workouts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { WorkoutStatus } from '@prisma/client';

const mockNotifications = {
  createNotification: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  trainingPlan: { findUnique: jest.fn() },
  workout: {
    create:   jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update:   jest.fn(),
    delete:   jest.fn(),
    count:    jest.fn(),
  },
  workoutResult: {
    create:   jest.fn(),
    update:   jest.fn(),
    findMany: jest.fn(),
    upsert:   jest.fn(),
  },
  user: { findUnique: jest.fn() },
};

const mockPlan = {
  id: 'plan-1',
  coachId: 'coach-1',
  athleteId: 'athlete-1',
  name: 'Plano Base',
};

const mockWorkout = {
  id: 'workout-1',
  planId: 'plan-1',
  athleteId: 'athlete-1',
  scheduledDate: new Date('2026-04-10'),
  type: 'EASY_RUN',
  title: 'Corrida leve',
  description: '5km em ritmo confortável',
  targetDistanceMeters: 5000,
  targetDurationSeconds: 1800,
  targetPace: '6:00',
  heartRateZone: null,
  status: WorkoutStatus.SCHEDULED,
  result: null,
};

describe('WorkoutsService', () => {
  let service: WorkoutsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<WorkoutsService>(WorkoutsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      planId: 'plan-1',
      scheduledDate: '2026-04-10',
      type: 'EASY_RUN',
      title: 'Corrida leve',
      description: '5km',
      targetDistanceMeters: 5000,
      targetDurationSeconds: 1800,
      targetPace: '6:00',
      heartRateZone: null,
    };

    it('deve criar treino quando coach é dono do plano', async () => {
      mockPrisma.trainingPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrisma.workout.create.mockResolvedValue(mockWorkout);

      const result = await service.create('coach-1', dto as any);

      expect(mockPrisma.workout.create).toHaveBeenCalled();
      expect(result.id).toBe('workout-1');
    });

    it('deve lançar NotFoundException quando plano não existe', async () => {
      mockPrisma.trainingPlan.findUnique.mockResolvedValue(null);

      await expect(service.create('coach-1', dto as any)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando coach não é dono do plano', async () => {
      mockPrisma.trainingPlan.findUnique.mockResolvedValue({ ...mockPlan, coachId: 'outro-coach' });

      await expect(service.create('coach-1', dto as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getWeeklyWorkouts', () => {
    it('deve retornar treinos da semana com totais calculados', async () => {
      const workouts = [
        { ...mockWorkout, status: WorkoutStatus.COMPLETED, result: { distanceMeters: 5000 } },
        { ...mockWorkout, id: 'w2', status: WorkoutStatus.SCHEDULED, result: null },
      ];
      mockPrisma.workout.findMany.mockResolvedValue(workouts);

      const result = await service.getWeeklyWorkouts('athlete-1', '2026-04-07');

      expect(result.totalDistanceMeters).toBe(5000);
      expect(result.completedCount).toBe(1);
      expect(result.totalCount).toBe(2);
    });

    it('deve retornar totais zerados quando não há treinos', async () => {
      mockPrisma.workout.findMany.mockResolvedValue([]);

      const result = await service.getWeeklyWorkouts('athlete-1', '2026-04-07');

      expect(result.totalDistanceMeters).toBe(0);
      expect(result.completedCount).toBe(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('findById', () => {
    it('deve retornar treino existente', async () => {
      mockPrisma.workout.findUnique.mockResolvedValue({ ...mockWorkout, plan: mockPlan });

      const result = await service.findById('workout-1');
      expect(result.id).toBe('workout-1');
    });

    it('deve lançar NotFoundException quando treino não existe', async () => {
      mockPrisma.workout.findUnique.mockResolvedValue(null);

      await expect(service.findById('nao-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markComplete', () => {
    it('deve marcar treino como completo para o atleta dono', async () => {
      mockPrisma.workout.findUnique.mockResolvedValue(mockWorkout);
      mockPrisma.workout.update.mockResolvedValue({ ...mockWorkout, status: WorkoutStatus.COMPLETED });

      const result = await service.markComplete('workout-1', 'athlete-1');
      expect(mockPrisma.workout.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'workout-1' } }),
      );
      expect(result.status).toBe(WorkoutStatus.COMPLETED);
    });

    it('deve lançar ForbiddenException quando atleta não é dono', async () => {
      mockPrisma.workout.findUnique.mockResolvedValue(mockWorkout);

      await expect(service.markComplete('workout-1', 'outro-atleta')).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException quando treino não existe', async () => {
      mockPrisma.workout.findUnique.mockResolvedValue(null);

      await expect(service.markComplete('nao-existe', 'athlete-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitResult', () => {
    it('deve criar resultado e marcar treino como completo', async () => {
      const workoutWithPlan = { ...mockWorkout, plan: { coachId: 'coach-1' } };
      mockPrisma.workout.findUnique.mockResolvedValue(workoutWithPlan);
      mockPrisma.workoutResult.create.mockResolvedValue({ id: 'result-1', distanceMeters: 5000 });
      mockPrisma.workout.update.mockResolvedValue({ ...mockWorkout, status: WorkoutStatus.COMPLETED });
      mockPrisma.user.findUnique.mockResolvedValue({ name: 'Atleta 1' });

      const dto = { distanceMeters: 5000, durationSeconds: 1800, avgPace: '6:00', source: 'MANUAL' };
      const result = await service.submitResult('workout-1', 'athlete-1', dto as any);

      expect(mockPrisma.workoutResult.create).toHaveBeenCalled();
      expect(mockPrisma.workout.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: WorkoutStatus.COMPLETED }) }),
      );
      expect(result.id).toBe('result-1');
    });

    it('deve lançar ForbiddenException quando atleta não é dono', async () => {
      mockPrisma.workout.findUnique.mockResolvedValue(mockWorkout);
      await expect(
        service.submitResult('workout-1', 'outro-atleta', {} as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getHistory', () => {
    it('deve retornar histórico paginado de treinos completados', async () => {
      const completedWorkouts = [{ ...mockWorkout, status: WorkoutStatus.COMPLETED, result: {} }];
      mockPrisma.workout.findMany.mockResolvedValue(completedWorkouts);
      mockPrisma.workout.count.mockResolvedValue(1);

      const result = await service.getHistory('athlete-1', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('getAthleteStats', () => {
    it('deve calcular totalKm e weeklyKm corretamente', async () => {
      mockPrisma.workoutResult.findMany
        .mockResolvedValueOnce([
          { distanceMeters: 10000, durationSeconds: 3600 },
          { distanceMeters: 5000,  durationSeconds: 1800 },
        ])
        .mockResolvedValueOnce([{ distanceMeters: 10000 }]);
      mockPrisma.workout.count.mockResolvedValue(2);

      const result = await service.getAthleteStats('athlete-1');

      expect(result.totalKm).toBe(15);
      expect(result.weeklyKm).toBe(10);
      expect(result.totalWorkouts).toBe(2);
    });

    it('deve retornar avgPace como "--" quando sem dados', async () => {
      mockPrisma.workoutResult.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.workout.count.mockResolvedValue(0);

      const result = await service.getAthleteStats('athlete-1');
      expect(result.avgPace).toBe('--');
    });
  });

  describe('submitFeedback', () => {
    it('deve salvar RPE e sensação para treino do atleta', async () => {
      mockPrisma.workout.findUnique.mockResolvedValue(mockWorkout);
      mockPrisma.workoutResult.upsert.mockResolvedValue({ id: 'wr-1', rpe: 7, sensationScore: 4 });

      const result = await service.submitFeedback('workout-1', 'athlete-1', {
        rpe: 7, sensationScore: 4, athleteFeedback: 'Treino pesado',
      });

      expect(mockPrisma.workoutResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where:  { workoutId: 'workout-1' },
          update: expect.objectContaining({ rpe: 7, sensationScore: 4 }),
        }),
      );
      expect(result.rpe).toBe(7);
    });

    it('deve lançar ForbiddenException quando atleta não é dono', async () => {
      mockPrisma.workout.findUnique.mockResolvedValue(mockWorkout);
      await expect(
        service.submitFeedback('workout-1', 'outro-atleta', { rpe: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
