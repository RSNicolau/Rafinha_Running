import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { TwoFactorService } from '../two-factor.service';

function makeUsers(prisma: any) {
  return new UsersService(prisma, {} as any, {} as any);
}

describe('A7 — /users/athletes: busca e paginação', () => {
  it('aplica busca por nome/e-mail (insensível a maiúsculas), ordena e devolve total', async () => {
    const prisma: any = {
      teamMember: { findMany: jest.fn().mockResolvedValue([]) },
      athleteProfile: {
        findMany: jest.fn().mockResolvedValue([{ coachId: 'coach-1', teamId: null, user: { id: 'a', name: 'Ana' } }]),
        count: jest.fn().mockResolvedValue(26),
      },
    };
    const svc = makeUsers(prisma);
    const r: any = await svc.getCoachAthletes('coach-1', 2, 20, 'ana');
    const args = prisma.athleteProfile.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      AND: [
        { coachId: 'coach-1' },
        { user: { OR: [{ name: { contains: 'ana', mode: 'insensitive' } }, { email: { contains: 'ana', mode: 'insensitive' } }] } },
      ],
    });
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual([{ user: { name: 'asc' } }, { userId: 'asc' }]);
    expect(r.total).toBe(26);
    expect(r.totalPages).toBe(2);
  });
});

describe('A1 — GET /users/athletes/:id (coach)', () => {
  it('treinador do atleta recebe o perfil; outro treinador 404', async () => {
    const prisma: any = {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'coach-1', teamId: null }) },
      teamMember: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'ath-1', name: 'Gustavo', athleteProfile: { coachId: 'coach-1', teamId: null, level: 'INTERMEDIATE', weight: 70 } }) },
    };
    const svc = makeUsers(prisma);
    const a: any = await svc.getAthleteForCoach({ id: 'coach-1', role: 'COACH' }, 'ath-1');
    expect(a.name).toBe('Gustavo');
    expect(a.athleteProfile.weight).toBe(70);
    await expect(svc.getAthleteForCoach({ id: 'intruso', role: 'COACH' }, 'ath-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('M5 — 2FA', () => {
  const saved = { ...process.env };
  beforeAll(() => { process.env.API_KEY_ENCRYPTION_SECRET = 'test-secret-for-totp-123456'; });
  afterAll(() => { process.env = saved; });

  it('código errado devolve 400 (não 401 — não derruba a sessão no front)', async () => {
    const { encryptTotpSecret } = await import('../../coach-brain/byok-crypto');
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ totpSecret: encryptTotpSecret('JBSWY3DPEHPK3PXP'), totpEnabled: true }),
        update: jest.fn(),
      },
    };
    const svc = new TwoFactorService(prisma);
    await expect(svc.enableTotp('u1', '000000')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.disableTotp('u1', '000000')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('setup não sobrescreve o segredo de um 2FA já ativo', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ totpEnabled: true }), update: jest.fn() } };
    const svc = new TwoFactorService(prisma);
    await expect(svc.generateSetup('u1', 'a@b.c')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
