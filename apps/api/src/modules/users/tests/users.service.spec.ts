import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
};

jest.mock('bcrypt', () => ({
  hash:    jest.fn().mockResolvedValue('$2b$12$hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update:     jest.fn(),
  },
  athleteProfile: {
    findMany:   jest.fn(),
    count:      jest.fn(),
    findUnique: jest.fn(),
    update:     jest.fn(),
    upsert:     jest.fn(),
  },
  workout: {
    findMany: jest.fn(),
    count:    jest.fn(),
  },
};

const mockUser = {
  id: 'user-1',
  email: 'coach@test.com',
  name: 'Coach Test',
  role: 'COACH',
  avatarUrl: null,
  phone: null,
  dateOfBirth: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  athleteProfile: null,
  coachProfile: null,
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('deve retornar usuário existente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findById('user-1');
      expect(result.id).toBe('user-1');
      expect(result.email).toBe('coach@test.com');
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('nao-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findPublicById', () => {
    it('deve retornar apenas campos públicos', async () => {
      const publicUser = { id: 'user-1', name: 'Coach Test', avatarUrl: null, role: 'COACH' };
      mockPrisma.user.findUnique.mockResolvedValue(publicUser);

      const result = await service.findPublicById('user-1');
      expect(result).not.toHaveProperty('email');
      expect(result.name).toBe('Coach Test');
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findPublicById('nao-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('deve atualizar perfil do usuário', async () => {
      const updated = { ...mockUser, name: 'Coach Atualizado', phone: '11999999999' };
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.updateProfile('user-1', {
        name: 'Coach Atualizado',
        phone: '11999999999',
        timezone: 'America/Sao_Paulo',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(result.name).toBe('Coach Atualizado');
    });
  });

  describe('getCoachAthletes', () => {
    it('deve retornar atletas paginados do coach', async () => {
      const athletes = [
        { id: 'ap-1', coachId: 'coach-1', user: { id: 'u-1', name: 'Atleta 1', email: 'a1@test.com', avatarUrl: null } },
        { id: 'ap-2', coachId: 'coach-1', user: { id: 'u-2', name: 'Atleta 2', email: 'a2@test.com', avatarUrl: null } },
      ];
      mockPrisma.athleteProfile.findMany.mockResolvedValue(athletes);
      mockPrisma.athleteProfile.count.mockResolvedValue(2);

      const result = await service.getCoachAthletes('coach-1', 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('deve retornar lista vazia quando coach não tem atletas', async () => {
      mockPrisma.athleteProfile.findMany.mockResolvedValue([]);
      mockPrisma.athleteProfile.count.mockResolvedValue(0);

      const result = await service.getCoachAthletes('coach-sem-atletas', 1, 20);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('deve calcular totalPages corretamente', async () => {
      mockPrisma.athleteProfile.findMany.mockResolvedValue([]);
      mockPrisma.athleteProfile.count.mockResolvedValue(25);

      const result = await service.getCoachAthletes('coach-1', 1, 10);

      expect(result.totalPages).toBe(3);
    });
  });

  describe('addAthleteByEmail', () => {
    it('deve vincular atleta ao coach pelo email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'athlete-99', name: 'New Athlete', email: 'new@test.com',
        role: 'ATHLETE', athleteProfile: null,
      });
      mockPrisma.athleteProfile.upsert.mockResolvedValue({ userId: 'athlete-99', coachId: 'coach-1' });

      const result = await service.addAthleteByEmail('coach-1', 'new@test.com');
      expect(result.success).toBe(true);
      expect(result.athlete.email).toBe('new@test.com');
      expect(mockPrisma.athleteProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { coachId: 'coach-1' } }),
      );
    });

    it('lança NotFoundException se email não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.addAthleteByEmail('coach-1', 'ghost@test.com')).rejects.toThrow(NotFoundException);
    });

    it('lança Error se usuário não é ATHLETE', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-99', name: 'Coach', email: 'coach2@test.com', role: 'COACH', athleteProfile: null,
      });
      await expect(service.addAthleteByEmail('coach-1', 'coach2@test.com')).rejects.toThrow('não é um atleta');
    });
  });

  describe('getCoachAlerts', () => {
    it('agrupa treinos perdidos por atleta', async () => {
      const since = new Date();
      mockPrisma.workout.findMany.mockResolvedValue([
        { athleteId: 'a-1', scheduledDate: since, athlete: { id: 'a-1', name: 'Atleta 1', avatarUrl: null } },
        { athleteId: 'a-1', scheduledDate: since, athlete: { id: 'a-1', name: 'Atleta 1', avatarUrl: null } },
        { athleteId: 'a-2', scheduledDate: since, athlete: { id: 'a-2', name: 'Atleta 2', avatarUrl: null } },
      ]);

      const alerts = await service.getCoachAlerts('coach-1');

      expect(alerts).toHaveLength(2);
      const a1 = alerts.find(a => a.athleteId === 'a-1');
      expect(a1?.missedCount).toBe(2);
      const a2 = alerts.find(a => a.athleteId === 'a-2');
      expect(a2?.missedCount).toBe(1);
    });

    it('retorna lista vazia quando sem treinos perdidos', async () => {
      mockPrisma.workout.findMany.mockResolvedValue([]);
      const alerts = await service.getCoachAlerts('coach-1');
      expect(alerts).toHaveLength(0);
    });
  });

  describe('changePassword', () => {
    it('troca senha quando senha atual está correta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: '$2b$12$current' });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.changePassword('user-1', 'currentPass', 'newPass123456');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { passwordHash: '$2b$12$hashed' } }),
      );
      expect(result.message).toContain('sucesso');
    });

    it('lança BadRequestException quando senha atual incorreta', async () => {
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValueOnce(false);
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: '$2b$12$current' });

      await expect(service.changePassword('user-1', 'wrongPass', 'new')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCoachStats', () => {
    it('retorna zeros quando coach não tem atletas', async () => {
      mockPrisma.athleteProfile.findMany.mockResolvedValue([]);
      const stats = await service.getCoachStats('coach-empty');
      expect(stats.totalAthletes).toBe(0);
      expect(stats.adherencePercent).toBe(0);
    });

    it('calcula aderência corretamente', async () => {
      mockPrisma.athleteProfile.findMany.mockResolvedValue([
        { userId: 'a-1' }, { userId: 'a-2' },
      ]);
      mockPrisma.workout.count
        .mockResolvedValueOnce(10) // scheduled
        .mockResolvedValueOnce(8)  // completed
        .mockResolvedValueOnce(1); // missed

      const stats = await service.getCoachStats('coach-1');
      expect(stats.totalAthletes).toBe(2);
      expect(stats.adherencePercent).toBe(80);
      expect(stats.alertCount).toBe(1);
    });
  });
});
