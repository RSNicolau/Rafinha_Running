import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { InvitesService } from '../../invites/invites.service';
import { TERMS_VERSION, PRIVACY_VERSION } from '../../legal/legal.constants';

process.env.API_KEY_ENCRYPTION_SECRET = process.env.API_KEY_ENCRYPTION_SECRET || 'test-secret-with-at-least-32-characters!!';

const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

const mockInvites = {
  createInvite: jest.fn(),
};

jest.mock('bcrypt', () => ({
  hash:    jest.fn().mockResolvedValue('$2b$12$hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst:  jest.fn(),
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
  conversation: { findFirst: jest.fn() },
  teamMember:   { findMany: jest.fn() },
  team:         { findMany: jest.fn() },
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
        { provide: InvitesService, useValue: mockInvites },
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
      expect(result.needsConsent).toBe(true);
    });

    it('needsConsent=false quando versões vigentes foram aceitas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
      const result = await service.findById('user-1');
      expect(result.needsConsent).toBe(false);
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('nao-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findPublicById (escopo — B11)', () => {
    const publicUser = { id: 'target', name: 'Alvo', avatarUrl: null, role: 'ATHLETE' };
    const noRelation = () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      mockPrisma.athleteProfile.findUnique.mockResolvedValue(null);
      mockPrisma.teamMember.findMany.mockResolvedValue([]);
      mockPrisma.team.findMany.mockResolvedValue([]);
    };

    it('o próprio usuário vê só campos públicos (sem e-mail)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ ...publicUser, id: 'me' });
      const result = await service.findPublicById('me', { id: 'me', role: 'ATHLETE' });
      expect(result).not.toHaveProperty('email');
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true, name: true, avatarUrl: true, role: true } }),
      );
    });

    it('admin da plataforma vê qualquer usuário', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(publicUser);
      await expect(service.findPublicById('target', { id: 'adm', role: 'SUPER_ADMIN' })).resolves.toEqual(publicUser);
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
    });

    it('usuário sem relação (outra equipe) → 404', async () => {
      noRelation();
      mockPrisma.user.findFirst.mockResolvedValue(publicUser);
      await expect(service.findPublicById('target', { id: 'stranger', role: 'COACH' })).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('sem chamador → 404', async () => {
      await expect(service.findPublicById('target', null)).rejects.toThrow(NotFoundException);
    });

    it('treinador responsável vê o atleta', async () => {
      noRelation();
      mockPrisma.athleteProfile.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.userId === 'target' ? { coachId: 'coach-1', teamId: null } : null),
      );
      mockPrisma.user.findFirst.mockResolvedValue(publicUser);
      await expect(service.findPublicById('target', { id: 'coach-1', role: 'COACH' })).resolves.toEqual(publicUser);
    });

    it('atleta vê o próprio treinador', async () => {
      noRelation();
      mockPrisma.athleteProfile.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.userId === 'ath' ? { coachId: 'target', teamId: null } : null),
      );
      mockPrisma.user.findFirst.mockResolvedValue({ ...publicUser, role: 'COACH' });
      await expect(service.findPublicById('target', { id: 'ath', role: 'ATHLETE' })).resolves.toBeTruthy();
    });

    it('equipe técnica vê atleta da equipe; atleta de outra equipe não', async () => {
      noRelation();
      mockPrisma.teamMember.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where.userId === 'staff' ? [{ teamId: 'team-A' }] : []),
      );
      mockPrisma.athleteProfile.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.userId === 'target' ? { coachId: 'other', teamId: 'team-A' } : null),
      );
      mockPrisma.user.findFirst.mockResolvedValue(publicUser);
      await expect(service.findPublicById('target', { id: 'staff', role: 'COACH' })).resolves.toEqual(publicUser);

      mockPrisma.athleteProfile.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.userId === 'target' ? { coachId: 'other', teamId: 'team-B' } : null),
      );
      await expect(service.findPublicById('target', { id: 'staff', role: 'COACH' })).rejects.toThrow(NotFoundException);
    });

    it('atletas da mesma equipe não se veem (sem relação direta)', async () => {
      noRelation();
      mockPrisma.athleteProfile.findUnique.mockResolvedValue({ coachId: 'c', teamId: 'team-A' });
      await expect(service.findPublicById('target', { id: 'ath2', role: 'ATHLETE' })).rejects.toThrow(NotFoundException);
    });

    it('conversa existente libera o par', async () => {
      noRelation();
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv' });
      mockPrisma.user.findFirst.mockResolvedValue(publicUser);
      await expect(service.findPublicById('target', { id: 'x', role: 'COACH' })).resolves.toEqual(publicUser);
    });

    it('usuário excluído/inexistente → 404', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findPublicById('me', { id: 'me', role: 'ATHLETE' })).rejects.toThrow(NotFoundException);
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

    it('nunca repassa coachId/niche do corpo para o athleteProfile (C2c)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'ATHLETE' });
      mockPrisma.user.update.mockResolvedValue({});
      await service.updateProfile('ath-1', {
        athleteProfile: { weight: 70, coachId: 'evil-coach', niche: 'CYCLING' } as any,
      });
      const data = mockPrisma.user.update.mock.calls[0][0].data;
      expect(data.athleteProfile.upsert.update).toEqual({ weight: 70 });
      expect(JSON.stringify(data)).not.toContain('evil-coach');
    });
  });

  describe('updateAiSettings', () => {
    it('criptografa a chave BYOK antes de gravar', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'c1', aiProvider: 'openai', aiModel: null, aiByok: true, aiApiKey: 'x' });
      const res: any = await service.updateAiSettings('c1', { aiProvider: 'openai', aiByok: true, aiApiKey: 'sk-plain-123' });
      const stored = mockPrisma.user.update.mock.calls[0][0].data.aiApiKey;
      expect(stored).not.toContain('sk-plain-123');
      expect(stored).toMatch(/^[a-f0-9]{32}:[a-f0-9]+$/);
      expect(res.aiApiKey).toBeUndefined();
      expect(res.hasApiKey).toBe(true);
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
    it('NÃO rouba atleta de outro coach: cria convite pendente em vez de alterar coachId (C2a)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'athlete-99', role: 'ATHLETE', athleteProfile: { coachId: 'other-coach' },
      });
      mockInvites.createInvite.mockResolvedValue({ id: 'inv-1', email: 'new@test.com', status: 'PENDING', expiresAt: new Date() });

      const result = await service.addAthleteByEmail('coach-1', 'New@test.com');
      expect(result.invited).toBe(true);
      expect(mockInvites.createInvite).toHaveBeenCalledWith('coach-1', { email: 'new@test.com' });
      expect(mockPrisma.athleteProfile.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.athleteProfile.update).not.toHaveBeenCalled();
    });

    it('e-mail sem conta → convite', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockInvites.createInvite.mockResolvedValue({ id: 'inv-2', email: 'ghost@test.com', status: 'PENDING', expiresAt: new Date() });
      const result = await service.addAthleteByEmail('coach-1', 'ghost@test.com');
      expect(result.invite.id).toBe('inv-2');
    });

    it('rejeita conta que não é ATHLETE', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-99', role: 'COACH', athleteProfile: null });
      await expect(service.addAthleteByEmail('coach-1', 'coach2@test.com')).rejects.toThrow(BadRequestException);
    });

    it('rejeita atleta já vinculado ao mesmo coach', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'a', role: 'ATHLETE', athleteProfile: { coachId: 'coach-1' } });
      await expect(service.addAthleteByEmail('coach-1', 'a@test.com')).rejects.toThrow(ConflictException);
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
        expect.objectContaining({ data: { passwordHash: '$2b$12$hashed', tokenVersion: { increment: 1 } } }),
      );
      expect(result.message).toContain('sucesso');
    });

    it('rejeita nova senha com menos de 8 caracteres', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: '$2b$12$current' });
      await expect(service.changePassword('user-1', 'currentPass', 'short')).rejects.toThrow(BadRequestException);
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
