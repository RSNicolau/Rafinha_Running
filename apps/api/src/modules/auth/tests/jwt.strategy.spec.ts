import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../strategies/jwt.strategy';

describe('JwtStrategy.validate', () => {
  const prisma: any = { user: { findUnique: jest.fn() } };
  let strategy: JwtStrategy;
  const user = {
    id: 'u1',
    email: 'a@b.com',
    name: 'A',
    role: 'COACH',
    avatarUrl: null,
    isActive: true,
    deletedAt: null,
    tokenVersion: 2,
  };

  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    strategy = new JwtStrategy(prisma);
  });

  beforeEach(() => jest.clearAllMocks());

  it('aceita quando tv confere e não expõe campos internos', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    const res: any = await strategy.validate({ sub: 'u1', role: 'COACH', tv: 2 });
    expect(res.id).toBe('u1');
    expect(res.tokenVersion).toBeUndefined();
    expect(res.deletedAt).toBeUndefined();
  });

  it('rejeita token de sessão revogada (tv diferente) ou sem tv', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    await expect(strategy.validate({ sub: 'u1', role: 'COACH', tv: 1 })).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate({ sub: 'u1', role: 'COACH' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita usuário inativo ou removido', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(strategy.validate({ sub: 'u1', role: 'COACH', tv: 2 })).rejects.toThrow(UnauthorizedException);
    prisma.user.findUnique.mockResolvedValue({ ...user, deletedAt: new Date() });
    await expect(strategy.validate({ sub: 'u1', role: 'COACH', tv: 2 })).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita tokens de propósito específico (mfa)', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    await expect(strategy.validate({ sub: 'u1', role: 'COACH', tv: 2, purpose: 'mfa' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
