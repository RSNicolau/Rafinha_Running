import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  athleteProfile: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
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
        avatarUrl: null,
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
});
