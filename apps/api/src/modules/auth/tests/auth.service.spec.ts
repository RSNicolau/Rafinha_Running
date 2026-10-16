import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService, maskEmail, needsConsent } from '../auth.service';
import { LoginAttemptsService } from '../login-attempts.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
  compare: jest.fn(),
}));

const verifyIdTokenMock = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: verifyIdTokenMock })),
}));

jest.mock('apple-signin-auth', () => ({
  verifyIdToken: jest.fn(),
}));

import * as bcrypt from 'bcrypt';
import * as appleSignin from 'apple-signin-auth';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { LegalService } from '../../legal/legal.service';
import { TwoFactorService } from '../../users/two-factor.service';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../legal/legal.constants';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: '$2b$12$hashedpassword',
  role: 'ATHLETE' as const,
  avatarUrl: null,
  isActive: true,
  deletedAt: null,
  totpEnabled: false,
  tokenVersion: 3,
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  appConfig: {
    create: jest.fn().mockResolvedValue({}),
    upsert: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  coachProfile: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  team: { findUnique: jest.fn(), create: jest.fn() },
  teamMember: { upsert: jest.fn(), findMany: jest.fn() },
  athleteProfile: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('mock-token'),
  verifyAsync: jest.fn(),
  verify: jest.fn(),
};

const mockLegal = {
  assertCurrentVersions: jest.fn(),
  recordConsent: jest.fn().mockResolvedValue(undefined),
};

const mockTwoFactor = {
  verifyToken: jest.fn(),
};

const mockEmail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

const validRegister = {
  email: 'new@example.com',
  password: 'Abc12345!',
  name: 'New User',
  acceptTerms: true,
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
};

describe('AuthService', () => {
  let service: AuthService;
  let attempts: LoginAttemptsService;
  const OLD_ENV = { ...process.env };

  beforeEach(async () => {
    process.env = { ...OLD_ENV, JWT_SECRET: 'test-secret', JWT_REFRESH_SECRET: 'test-refresh' };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        LoginAttemptsService, // sem CacheService → fallback em memória
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: EmailService, useValue: mockEmail },
        { provide: LegalService, useValue: mockLegal },
        { provide: TwoFactorService, useValue: mockTwoFactor },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    attempts = module.get(LoginAttemptsService);
    jest.clearAllMocks();
    mockJwt.signAsync.mockResolvedValue('mock-token');
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.appConfig.create.mockResolvedValue({});
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('helpers', () => {
    it('needsConsent compara com as versões vigentes', () => {
      expect(needsConsent({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION })).toBe(false);
      expect(needsConsent({ termsVersion: null, privacyVersion: null })).toBe(true);
      expect(needsConsent({ termsVersion: '2020-01-01', privacyVersion: PRIVACY_VERSION })).toBe(true);
    });

    it('maskEmail não expõe o e-mail completo', () => {
      const masked = maskEmail('joaosilva@example.com');
      expect(masked).not.toContain('joaosilva');
      expect(masked).not.toContain('example');
      expect(masked).toMatch(/^jo\*\*\*@ex\*\*\*\.com$/);
    });
  });

  describe('register', () => {
    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.register({ ...validRegister, email: 'test@example.com' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('cria usuário + consentimento na mesma transação e retorna tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, tokenVersion: 0 });

      const result = await service.register(validRegister, { ip: '1.2.3.4', userAgent: 'jest' });

      expect(mockLegal.assertCurrentVersions).toHaveBeenCalledWith(
        expect.objectContaining({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION }),
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      expect(mockLegal.recordConsent).toHaveBeenCalledWith(
        mockUser.id,
        { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, marketingOptIn: false },
        { ip: '1.2.3.4', userAgent: 'jest' },
        mockPrisma,
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.needsConsent).toBe(false);
      // tv no payload do JWT
      expect(mockJwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sub: mockUser.id, tv: 0 }));
    });

    it('valida versões dos termos ANTES de criar o usuário', async () => {
      mockLegal.assertCurrentVersions.mockImplementationOnce(() => {
        throw new BadRequestException('desatualizado');
      });
      await expect(service.register({ ...validRegister, termsVersion: 'old' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('nunca permite auto-cadastro como ADMIN/SUPER_ADMIN (defesa em profundidade)', async () => {
      await expect(service.register({ ...validRegister, role: 'SUPER_ADMIN' as any })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.register({ ...validRegister, role: 'ADMIN' as any })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('exige acceptTerms = true', async () => {
      await expect(service.register({ ...validRegister, acceptTerms: false })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('cria COACH com coachProfile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, role: 'COACH' });
      mockPrisma.team.create.mockResolvedValue({ id: 'team-1', name: 'Test User', slug: 'test-user' });
      await service.register({ ...validRegister, role: 'COACH' });
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'COACH', coachProfile: { create: {} } }) }),
      );
    });

    describe('equipe (team)', () => {
      beforeEach(() => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        mockPrisma.coachProfile.findUnique.mockResolvedValue({ slug: null });
        mockPrisma.coachProfile.findFirst.mockResolvedValue(null);
        mockPrisma.coachProfile.update.mockResolvedValue({});
        mockPrisma.team.findUnique.mockResolvedValue(null);
        mockPrisma.team.create.mockResolvedValue({ id: 'team-1', name: 'Assessoria X', slug: 'assessoria-x' });
      });

      it('COACH auto-cadastrado vira OWNER de uma equipe nova (nome = teamName) na mesma transação', async () => {
        mockPrisma.user.create.mockResolvedValue({ ...mockUser, role: 'COACH', name: 'Joana' });
        mockPrisma.teamMember.findMany.mockResolvedValue([
          { teamId: 'team-1', role: 'OWNER', createdAt: new Date(), team: { id: 'team-1', name: 'Assessoria X', slug: 'assessoria-x', logoUrl: null, primaryColor: null } },
        ]);
        const res: any = await service.register({ ...validRegister, role: 'COACH', teamName: 'Assessoria X' });
        expect(mockPrisma.team.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              name: 'Assessoria X',
              slug: 'assessoria-x',
              ownerId: mockUser.id,
              members: { create: { userId: mockUser.id, role: 'OWNER' } },
            }),
          }),
        );
        // slug também vira o slug legado do treinador (links /onboarding/:slug)
        expect(mockPrisma.coachProfile.update).toHaveBeenCalledWith({ where: { userId: mockUser.id }, data: { slug: 'assessoria-x' } });
        expect(res.team).toEqual(expect.objectContaining({ id: 'team-1', slug: 'assessoria-x', role: 'OWNER' }));
        expect(res.user.team).toEqual(res.team);
      });

      it('sem teamName usa o nome do usuário e gera slug único', async () => {
        mockPrisma.user.create.mockResolvedValue({ ...mockUser, role: 'COACH', name: 'João Treinador' });
        mockPrisma.teamMember.findMany.mockResolvedValue([]);
        mockPrisma.team.findUnique.mockResolvedValueOnce({ id: 'outra' }).mockResolvedValue(null); // 1º slug ocupado
        await service.register({ ...validRegister, role: 'COACH' });
        expect(mockPrisma.team.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ name: 'João Treinador', slug: 'joao-treinador-2' }) }),
        );
      });

      it('ATHLETE não cria equipe', async () => {
        mockPrisma.user.create.mockResolvedValue({ ...mockUser });
        mockPrisma.athleteProfile.findUnique.mockResolvedValue(null);
        const res: any = await service.register({ ...validRegister });
        expect(mockPrisma.team.create).not.toHaveBeenCalled();
        expect(res.team).toBeNull();
      });

      it('com teamInviteToken: entra na equipe do convite com o papel do convite e NÃO cria equipe', async () => {
        mockJwt.verifyAsync.mockResolvedValue({ purpose: 'team-invite', teamId: 'team-9', email: 'new@example.com', role: 'COACH', inviterId: 'o1' });
        mockPrisma.team.findUnique.mockResolvedValue({ status: 'ACTIVE' });
        mockPrisma.user.create.mockResolvedValue({ ...mockUser, role: 'COACH' });
        mockPrisma.teamMember.findMany.mockResolvedValue([]);
        await service.register({ ...validRegister, role: 'COACH', teamInviteToken: 'tok' });
        expect(mockJwt.verifyAsync).toHaveBeenCalledWith('tok', { secret: 'test-secret:team-invite' });
        expect(mockPrisma.teamMember.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ create: { teamId: 'team-9', userId: mockUser.id, role: 'COACH', isActive: true } }),
        );
        expect(mockPrisma.team.create).not.toHaveBeenCalled();
      });

      it('teamInviteToken de outro e-mail é recusado antes de criar a conta', async () => {
        mockJwt.verifyAsync.mockResolvedValue({ purpose: 'team-invite', teamId: 'team-9', email: 'outro@example.com', role: 'COACH' });
        await expect(service.register({ ...validRegister, role: 'COACH', teamInviteToken: 'tok' })).rejects.toThrow(BadRequestException);
        expect(mockPrisma.user.create).not.toHaveBeenCalled();
      });

      it('teamInviteToken com propósito errado (ex.: access token) é recusado', async () => {
        mockJwt.verifyAsync.mockResolvedValue({ sub: 'x', role: 'COACH' });
        await expect(service.register({ ...validRegister, role: 'COACH', teamInviteToken: 'tok' })).rejects.toThrow('Convite inválido');
        expect(mockPrisma.user.create).not.toHaveBeenCalled();
      });

      it('teamInviteToken exige papel COACH', async () => {
        mockJwt.verifyAsync.mockResolvedValue({ purpose: 'team-invite', teamId: 'team-9', email: 'new@example.com', role: 'COACH' });
        await expect(service.register({ ...validRegister, role: 'ATHLETE', teamInviteToken: 'tok' })).rejects.toThrow(BadRequestException);
        expect(mockPrisma.user.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException for unknown email (e ainda roda bcrypt para tempo uniforme)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ email: 'ghost@example.com', password: 'password' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(bcrypt.compare).toHaveBeenCalledWith('password', expect.stringMatching(/^\$2b\$12\$/));
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ email: 'test@example.com', password: 'wrongpass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return tokens + needsConsent on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result: any = await service.login({ email: 'test@example.com', password: 'Abc12345!' });

      expect(result).toHaveProperty('accessToken');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.needsConsent).toBe(false);
      expect(mockJwt.signAsync).toHaveBeenCalledWith({ sub: 'user-1', role: 'ATHLETE', tv: 3 });
    });

    it('needsConsent = true quando o usuário não aceitou a versão vigente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, termsVersion: null, privacyVersion: null });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const result: any = await service.login({ email: 'test@example.com', password: 'Abc12345!' });
      expect(result.user.needsConsent).toBe(true);
    });

    it('should throw UnauthorizedException for inactive or deleted user', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
      await expect(service.login({ email: 'test@example.com', password: 'Abc12345!' })).rejects.toThrow(
        UnauthorizedException,
      );
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, deletedAt: new Date() });
      await expect(service.login({ email: 'test@example.com', password: 'Abc12345!' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('bloqueia a conta (429) após 5 falhas em 15 min, mesmo com a senha correta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      for (let i = 0; i < 5; i++) {
        await expect(service.login({ email: 'Test@Example.com', password: 'x' })).rejects.toThrow(
          UnauthorizedException,
        );
      }
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const err = await service.login({ email: 'test@example.com', password: 'Abc12345!' }).catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      await attempts.reset('test@example.com');
    });

    it('com 2FA ativo retorna mfaRequired + mfaToken (sem access token)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, totpEnabled: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwt.signAsync.mockResolvedValueOnce('mfa-token');

      const result: any = await service.login({ email: 'test@example.com', password: 'Abc12345!' });

      expect(result).toEqual({ mfaRequired: true, mfaToken: 'mfa-token' });
      expect(result.accessToken).toBeUndefined();
      expect(mockJwt.signAsync).toHaveBeenCalledTimes(1);
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', purpose: 'mfa', tv: 3 }),
        expect.objectContaining({ expiresIn: '5m', secret: 'test-secret:mfa' }),
      );
    });
  });

  describe('loginWithMfa', () => {
    it('emite tokens com código TOTP válido', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'user-1', purpose: 'mfa', tv: 3 });
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, totpEnabled: true });
      mockTwoFactor.verifyToken.mockResolvedValue(true);

      const result = await service.loginWithMfa('mfa-token', '123456');

      expect(mockJwt.verifyAsync).toHaveBeenCalledWith('mfa-token', { secret: 'test-secret:mfa' });
      expect(mockTwoFactor.verifyToken).toHaveBeenCalledWith('user-1', '123456');
      expect(result).toHaveProperty('accessToken');
      expect(result.user.id).toBe('user-1');
    });

    it('rejeita código inválido', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'user-1', purpose: 'mfa', tv: 3 });
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, totpEnabled: true });
      mockTwoFactor.verifyToken.mockResolvedValue(false);
      await expect(service.loginWithMfa('mfa-token', '000000')).rejects.toThrow(BadRequestException);
      await attempts.reset('test@example.com');
    });

    it('rejeita token sem purpose mfa (ex.: access token comum)', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'user-1', role: 'ATHLETE', tv: 3 });
      await expect(service.loginWithMfa('access-token', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita mfaToken expirado', async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      await expect(service.loginWithMfa('x', '123456')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rejeita quando tokenVersion mudou (sessões revogadas)', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 2 });
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, tokenVersion: 3 });
      await expect(service.refresh('rt')).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita usuário removido', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3 });
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, deletedAt: new Date() });
      await expect(service.refresh('rt')).rejects.toThrow(UnauthorizedException);
    });

    it('emite novos tokens quando tv confere', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3 });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      const result = await service.refresh('rt');
      expect(result).toEqual({ accessToken: 'mock-token', refreshToken: 'mock-token' });
    });
  });

  describe('revokeSessions (logout-all)', () => {
    it('incrementa tokenVersion', async () => {
      await service.revokeSessions('user-1');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });

  describe('logout (revogação do refresh token — M8/M6)', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;

    it('emite refresh token com jti único', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3 });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      await service.refresh('rt');
      const refreshCall = mockJwt.signAsync.mock.calls.find((c: any[]) => c[1]?.secret === process.env.JWT_REFRESH_SECRET);
      expect(refreshCall?.[0]).toEqual(expect.objectContaining({ sub: 'user-1', tv: 3, jti: expect.any(String) }));
      const accessCall = mockJwt.signAsync.mock.calls.find((c: any[]) => c.length === 1);
      expect(accessCall?.[0]).not.toHaveProperty('jti');
    });

    it('revoga o jti do refresh enviado (sem derrubar outros dispositivos)', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, jti: 'jti-1', exp });
      mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 3 });
      const res = await service.logout('rt');
      expect(res.message).toBe('Sessão encerrada.');
      expect(mockPrisma.appConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'revoked_refresh:jti-1' } }),
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('refresh com jti revogado → 401', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, jti: 'jti-1', exp });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue({ key: 'revoked_refresh:jti-1' });
      await expect(service.refresh('rt')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.appConfig.findUnique).toHaveBeenCalledWith({ where: { key: 'revoked_refresh:jti-1' } });
    });

    it('refresh com jti não revogado continua funcionando', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, jti: 'jti-2', exp });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue(null);
      await expect(service.refresh('rt')).resolves.toEqual({ accessToken: 'mock-token', refreshToken: 'mock-token' });
    });

    it('allDevices=true incrementa tokenVersion (todas as sessões)', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, jti: 'jti-1', exp });
      mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 3 });
      await service.logout('rt', { allDevices: true });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { tokenVersion: { increment: 1 } } });
      expect(mockPrisma.appConfig.upsert).not.toHaveBeenCalled();
    });

    it('refresh legado (sem jti) → revoga todas as sessões', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, exp });
      mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 3 });
      await service.logout('rt');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { tokenVersion: { increment: 1 } } });
    });

    it('token inválido/ausente → 200 idempotente, sem gravar nada', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      await expect(service.logout('lixo')).resolves.toEqual({ message: 'Sessão encerrada.' });
      await expect(service.logout(undefined)).resolves.toEqual({ message: 'Sessão encerrada.' });
      expect(mockPrisma.appConfig.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      mockJwt.verify.mockReset();
    });

    it('refresh de geração já revogada (tv antigo) → nada a fazer', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 1, jti: 'jti-x', exp });
      mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 3 });
      await service.logout('rt', { allDevices: true });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.appConfig.upsert).not.toHaveBeenCalled();
    });
  });

  describe('política de senha no service (defesa em profundidade — B1)', () => {
    it('register rejeita senha sem número', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.register({ ...validRegister, password: 'somenteletras' } as any)).rejects.toThrow(BadRequestException);
    });
    it('resetPassword rejeita senha só com números', async () => {
      await expect(
        service.resetPassword({ email: 'test@example.com', token: 'tok', newPassword: '12345678' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('googleLogin', () => {
    it('503 quando GOOGLE_CLIENT_ID não está configurado', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      await expect(service.googleLogin('t')).rejects.toThrow(ServiceUnavailableException);
    });

    it('exige email_verified', async () => {
      process.env.GOOGLE_CLIENT_ID = 'gid';
      verifyIdTokenMock.mockResolvedValue({ getPayload: () => ({ email: 'a@b.com', email_verified: false }) });
      await expect(service.googleLogin('t')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('novo usuário via Google recebe needsConsent = true', async () => {
      process.env.GOOGLE_CLIENT_ID = 'gid';
      verifyIdTokenMock.mockResolvedValue({
        getPayload: () => ({ email: 'a@b.com', email_verified: true, name: 'A' }),
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        ...mockUser,
        email: 'a@b.com',
        termsVersion: null,
        privacyVersion: null,
        tokenVersion: 0,
      });
      const result = await service.googleLogin('t');
      expect(result.user.needsConsent).toBe(true);
    });
  });

  describe('appleLogin', () => {
    it('503 quando APPLE_CLIENT_ID não está configurado (sem fallback fixo)', async () => {
      delete process.env.APPLE_CLIENT_ID;
      await expect(service.appleLogin('t')).rejects.toThrow(ServiceUnavailableException);
      expect(appleSignin.verifyIdToken).not.toHaveBeenCalled();
    });

    it('usa APPLE_CLIENT_ID como audience', async () => {
      process.env.APPLE_CLIENT_ID = 'com.example.app';
      (appleSignin.verifyIdToken as jest.Mock).mockResolvedValue({ sub: 'apple-1', email: undefined });
      mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, appleId: 'apple-1' });
      await service.appleLogin('t');
      expect(appleSignin.verifyIdToken).toHaveBeenCalledWith('t', expect.objectContaining({ audience: 'com.example.app' }));
    });
  });

  describe('forgotPassword', () => {
    it('não retorna o token fora de NODE_ENV=test e não loga o e-mail em claro', async () => {
      process.env.NODE_ENV = 'development';
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

      const result: any = await service.forgotPassword('test@example.com');

      expect(result.token).toBeUndefined();
      expect(mockEmail.sendPasswordReset).toHaveBeenCalled();
      const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).not.toContain('test@example.com');
    });

    it('retorna o token apenas em NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      const result: any = await service.forgotPassword('test@example.com');
      expect(typeof result.token).toBe('string');
    });

    it('resposta genérica para e-mail inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const result: any = await service.forgotPassword('ghost@example.com');
      expect(result.token).toBeUndefined();
      expect(mockPrisma.appConfig.upsert).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const dto = { email: 'test@example.com', token: 'tok', newPassword: 'novaSenha123' };

    it('redefine a senha, consome o token (uso único) e revoga sessões', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue({
        value: { tokenHash: 'h', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.appConfig.deleteMany.mockResolvedValue({ count: 1 });

      const res = await service.resetPassword(dto);

      expect(res.message).toContain('sucesso');
      expect(mockPrisma.appConfig.deleteMany).toHaveBeenCalledWith({ where: { key: 'password_reset:user-1' } });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String), tokenVersion: { increment: 1 } },
      });
    });

    it('falha se o token já foi consumido por outra requisição', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue({
        value: { tokenHash: 'h', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.appConfig.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('falha com token expirado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue({
        value: { tokenHash: 'h', expiresAt: new Date(Date.now() - 1000).toISOString() },
      });
      mockPrisma.appConfig.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('falha com token incorreto', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue({
        value: { tokenHash: 'h', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.appConfig.deleteMany).not.toHaveBeenCalled();
    });

    it('falha sem newPassword', async () => {
      await expect(service.resetPassword({ ...dto, newPassword: undefined as any })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
  describe('e-mail case-insensitive (reteste M)', () => {
    it('login com maiúsculas/espaços busca pelo e-mail normalizado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await service.login({ email: '  Test@EXAMPLE.com ', password: 'Abc12345!' });
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });

    it('fallback insensitive para linha legada com maiúsculas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, email: 'Test@Example.com' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const r: any = await service.login({ email: 'test@example.com', password: 'Abc12345!' });
      expect(r.accessToken).toBe('mock-token');
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({ where: { email: { equals: 'test@example.com', mode: 'insensitive' } } });
    });

    it('bloqueio usa a chave normalizada (falhas com caixas diferentes somam)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const variants = ['A@x.com', 'a@X.com', ' a@x.com', 'A@X.COM', 'a@x.com'];
      for (const email of variants) {
        await expect(service.login({ email, password: 'x' })).rejects.toThrow(UnauthorizedException);
      }
      const err = await service.login({ email: 'a@x.COM', password: 'x' }).catch((e) => e);
      expect(err.getStatus()).toBe(429);
      await attempts.reset('a@x.com');
    });

    it('register grava o e-mail normalizado e detecta duplicado com outra caixa', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockImplementation(async ({ data }: any) => ({ ...mockUser, ...data, id: 'u-new' }));
      await service.register({ ...validRegister, email: ' New@Example.COM ' } as any);
      expect(mockPrisma.user.create.mock.calls[0][0].data.email).toBe('new@example.com');

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'legacy' });
      await expect(service.register({ ...validRegister, email: 'NEW@example.com' } as any)).rejects.toThrow(ConflictException);
    });

    it('forgotPassword normaliza o e-mail', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await service.forgotPassword(' Ghost@Example.com');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'ghost@example.com' } });
    });
  });

  describe('rotação do refresh token (reteste M)', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;

    it('refresh revoga o jti usado e devolve um novo par', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, jti: 'jti-a', exp });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue(null);
      const r = await service.refresh('rt');
      expect(r).toEqual({ accessToken: 'mock-token', refreshToken: 'mock-token' });
      expect(mockPrisma.appConfig.create).toHaveBeenCalledWith({
        data: { key: 'revoked_refresh:jti-a', value: expect.objectContaining({ userId: 'user-1', reason: 'ROTATED' }) },
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('reuso de refresh já rotacionado → 401 e tokenVersion++ (família encerrada)', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, jti: 'jti-a', exp });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue({
        key: 'revoked_refresh:jti-a',
        value: { reason: 'ROTATED', rotatedAt: new Date(Date.now() - 60_000).toISOString() },
      });
      await expect(service.refresh('rt')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { tokenVersion: { increment: 1 } } });
      expect(mockPrisma.appConfig.create).not.toHaveBeenCalled();
    });

    it('reuso de refresh encerrado no logout → 401 e família encerrada', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, jti: 'jti-l', exp });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue({ key: 'revoked_refresh:jti-l', value: { reason: 'LOGOUT' } });
      await expect(service.refresh('rt')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('corrida benigna (mesmo token rotacionado há < 10 s) → 401 sem derrubar as sessões', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, jti: 'jti-a', exp });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue({ value: { reason: 'ROTATED', rotatedAt: new Date().toISOString() } });
      await expect(service.refresh('rt')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('duas renovações simultâneas com o mesmo token: só uma vence (claim atômico)', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', tv: 3, jti: 'jti-a', exp });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.appConfig.findUnique.mockResolvedValue(null);
      mockPrisma.appConfig.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(service.refresh('rt')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
