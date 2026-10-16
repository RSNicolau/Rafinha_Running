import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  assertCoachOwnsAthlete,
  athleteProfileScopeWhere,
  athleteScopeWhere,
  canManageCoachContent,
  coachIdsWhere,
  coachOwnsAthlete,
  isPlatformAdmin,
  managedCoachIds,
  primaryTeamIdForCoach,
  teamContentCoachIds,
  teamContentWhere,
  assertCanCreateTeamContent,
  redactHealthFields,
} from './ownership';

describe('ownership helpers', () => {
  const prisma = { athleteProfile: { findUnique: jest.fn() } };
  beforeEach(() => jest.resetAllMocks());

  it('ADMIN e SUPER_ADMIN passam sem consulta', async () => {
    await expect(assertCoachOwnsAthlete(prisma, { id: 'a', role: 'ADMIN' }, 'x')).resolves.toBeUndefined();
    await expect(assertCoachOwnsAthlete(prisma, { id: 'a', role: 'SUPER_ADMIN' }, 'x')).resolves.toBeUndefined();
    expect(prisma.athleteProfile.findUnique).not.toHaveBeenCalled();
    expect(isPlatformAdmin({ id: 'a', role: 'COACH' })).toBe(false);
  });

  it('atleta acessa a si mesmo, mas não outro atleta', async () => {
    await expect(assertCoachOwnsAthlete(prisma, { id: 'ath1', role: 'ATHLETE' }, 'ath1')).resolves.toBeUndefined();
    await expect(assertCoachOwnsAthlete(prisma, { id: 'ath1', role: 'ATHLETE' }, 'ath2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allowSelf=false bloqueia o próprio atleta', async () => {
    await expect(
      assertCoachOwnsAthlete(prisma, { id: 'ath1', role: 'ATHLETE' }, 'ath1', { allowSelf: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('coach acessa somente os próprios atletas', async () => {
    prisma.athleteProfile.findUnique.mockResolvedValueOnce({ coachId: 'coach1' });
    await expect(assertCoachOwnsAthlete(prisma, { id: 'coach1', role: 'COACH' }, 'ath1')).resolves.toBeUndefined();

    prisma.athleteProfile.findUnique.mockResolvedValueOnce({ coachId: 'coach2' });
    await expect(assertCoachOwnsAthlete(prisma, { id: 'coach1', role: 'COACH' }, 'ath1')).rejects.toBeInstanceOf(NotFoundException);

    prisma.athleteProfile.findUnique.mockResolvedValueOnce(null);
    await expect(assertCoachOwnsAthlete(prisma, { id: 'coach1', role: 'COACH' }, 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sem usuário → 403', async () => {
    await expect(assertCoachOwnsAthlete(prisma, null, 'ath1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('coachOwnsAthlete retorna boolean', async () => {
    prisma.athleteProfile.findUnique.mockResolvedValueOnce({ coachId: 'other' });
    await expect(coachOwnsAthlete(prisma, { id: 'c', role: 'COACH' }, 'a')).resolves.toBe(false);
  });

  it('athleteScopeWhere', () => {
    expect(athleteScopeWhere({ id: 'c', role: 'COACH' })).toEqual({ athleteProfile: { coachId: 'c' } });
    expect(athleteScopeWhere({ id: 'c', role: 'ADMIN' })).toEqual({});
    expect(athleteScopeWhere({ id: 'c', role: 'COACH' }, { teamId: 't1', role: 'OWNER' })).toEqual({ athleteProfile: { teamId: 't1' } });
    expect(athleteScopeWhere({ id: 'c', role: 'COACH' }, { teamId: 't1', role: 'ADMIN' })).toEqual({ athleteProfile: { teamId: 't1' } });
    expect(athleteScopeWhere({ id: 'c', role: 'COACH' }, { teamId: 't1', role: 'STAFF' })).toEqual({ athleteProfile: { teamId: 't1' } });
    // treinador (COACH) da equipe continua restrito aos atribuídos a ele
    expect(athleteScopeWhere({ id: 'c', role: 'COACH' }, { teamId: 't1', role: 'COACH' })).toEqual({ athleteProfile: { coachId: 'c' } });
  });
});

/** Fake de teamMember para as consultas de conteúdo (userId/teamId string|{in}, isActive, role.in, ordem por createdAt). */
function contentFake(rows: Array<{ teamId: string; userId: string; role: string; isActive?: boolean; at?: number }>) {
  const all = rows.map((r, i) => ({ isActive: true, ...r, createdAt: new Date(2026, 0, 1 + (r.at ?? i)), team: { status: 'ACTIVE' } }));
  const match = (v: any, x: any) => v === undefined || (typeof v === 'object' && v !== null && 'in' in v ? v.in.includes(x) : v === x);
  const filter = (where: any = {}) =>
    all
      .filter((m) => match(where.userId, m.userId) && match(where.teamId, m.teamId) && (where.isActive === undefined || m.isActive === where.isActive) && (!where.role?.in || where.role.in.includes(m.role)))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    findMany: jest.fn(async ({ where }: any = {}) => filter(where)),
    findFirst: jest.fn(async ({ where }: any = {}) => filter(where)[0] ?? null),
  };
}

describe('ownership — acesso pela equipe (team-aware)', () => {
  /** Prisma fake: perfis de atletas + memberships de equipe. */
  function fakePrisma(profiles: Record<string, { coachId: string | null; teamId: string | null }>, members: Array<{ teamId: string; userId: string; role: string; isActive?: boolean }>) {
    const active = (m: any) => m.isActive !== false;
    return {
      athleteProfile: { findUnique: jest.fn(async ({ where }: any) => profiles[where.userId] ?? null) },
      teamMember: {
        findFirst: jest.fn(async ({ where }: any) =>
          members.find((m) => m.teamId === where.teamId && m.userId === where.userId && active(m) && where.role.in.includes(m.role)) ?? null),
        findMany: jest.fn(async ({ where }: any) =>
          members.filter((m) => {
            if (!active(m)) return false;
            if (where.userId && m.userId !== where.userId) return false;
            if (where.role?.in && !where.role.in.includes(m.role)) return false;
            if (where.teamId?.in && !where.teamId.in.includes(m.teamId)) return false;
            return true;
          })),
      },
    };
  }

  const members = [
    { teamId: 'T1', userId: 'owner1', role: 'OWNER' },
    { teamId: 'T1', userId: 'admin1', role: 'ADMIN' },
    { teamId: 'T1', userId: 'coachA', role: 'COACH' },
    { teamId: 'T1', userId: 'coachB', role: 'COACH' },
    { teamId: 'T1', userId: 'staff1', role: 'STAFF' },
    { teamId: 'T1', userId: 'exstaff', role: 'STAFF', isActive: false },
    { teamId: 'T2', userId: 'owner2', role: 'OWNER' },
  ];
  const profiles = { ath1: { coachId: 'coachA', teamId: 'T1' }, solo: { coachId: 'coachA', teamId: null } };
  const COACH = (id: string) => ({ id, role: 'COACH' });

  it('(a) próprio atleta', async () => {
    const p = fakePrisma(profiles, members);
    await expect(assertCoachOwnsAthlete(p, { id: 'ath1', role: 'ATHLETE' }, 'ath1', { healthData: true })).resolves.toBeUndefined();
  });

  it('(b) ADMIN/SUPER_ADMIN da plataforma (cross-tenant)', async () => {
    const p = fakePrisma(profiles, members);
    await expect(assertCoachOwnsAthlete(p, { id: 'x', role: 'SUPER_ADMIN' }, 'ath1', { healthData: true })).resolves.toBeUndefined();
  });

  it('(c) treinador responsável (coachId), inclusive dados de saúde', async () => {
    const p = fakePrisma(profiles, members);
    await expect(assertCoachOwnsAthlete(p, COACH('coachA'), 'ath1', { allowSelf: false, healthData: true })).resolves.toBeUndefined();
  });

  it('(d) OWNER/ADMIN da equipe do atleta acessam tudo', async () => {
    const p = fakePrisma(profiles, members);
    await expect(assertCoachOwnsAthlete(p, COACH('owner1'), 'ath1', { healthData: true })).resolves.toBeUndefined();
    await expect(assertCoachOwnsAthlete(p, COACH('admin1'), 'ath1', { healthData: true })).resolves.toBeUndefined();
  });

  it('(d) STAFF lê dados básicos, mas NÃO dados de saúde (403)', async () => {
    const p = fakePrisma(profiles, members);
    await expect(assertCoachOwnsAthlete(p, COACH('staff1'), 'ath1')).resolves.toBeUndefined();
    await expect(assertCoachOwnsAthlete(p, COACH('staff1'), 'ath1', { healthData: true })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('outro treinador da MESMA equipe não acessa atleta não atribuído a ele (404)', async () => {
    const p = fakePrisma(profiles, members);
    await expect(assertCoachOwnsAthlete(p, COACH('coachB'), 'ath1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dono de OUTRA equipe não acessa (404) e membro inativo também não', async () => {
    const p = fakePrisma(profiles, members);
    await expect(assertCoachOwnsAthlete(p, COACH('owner2'), 'ath1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertCoachOwnsAthlete(p, COACH('exstaff'), 'ath1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('atleta sem equipe: só o treinador responsável', async () => {
    const p = fakePrisma(profiles, members);
    await expect(assertCoachOwnsAthlete(p, COACH('owner1'), 'solo')).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertCoachOwnsAthlete(p, COACH('coachA'), 'solo')).resolves.toBeUndefined();
  });

  it('managedCoachIds: OWNER/ADMIN → conteúdo da equipe ativa; COACH → só ele; plataforma → null', async () => {
    const p = fakePrisma(profiles, members) as any;
    p.teamMember = contentFake(members);
    const owner = await managedCoachIds(p, COACH('owner1'));
    expect(new Set(owner)).toEqual(new Set(['owner1', 'admin1', 'coachA', 'coachB', 'staff1', 'exstaff']));
    expect(await managedCoachIds(p, COACH('coachA'))).toEqual(['coachA']);
    expect(await managedCoachIds(p, COACH('staff1'))).toEqual(['staff1']);
    expect(await managedCoachIds(p, { id: 'x', role: 'ADMIN' })).toBeNull();
    expect(await managedCoachIds(p, { id: 'x', role: 'ADMIN' }, { teamId: 'T2', role: 'OWNER', platformAdmin: true })).toEqual(['owner2']);
  });

  it('coachIdsWhere / canManageCoachContent', async () => {
    expect(coachIdsWhere(null)).toEqual({});
    expect(coachIdsWhere(['a'])).toEqual({ coachId: 'a' });
    expect(coachIdsWhere(['a', 'b'], 'createdById')).toEqual({ createdById: { in: ['a', 'b'] } });
    expect(coachIdsWhere([])).toEqual({ coachId: { in: [] } });
    const p = fakePrisma(profiles, members) as any;
    p.teamMember = contentFake(members);
    await expect(canManageCoachContent(p, COACH('owner1'), 'coachB')).resolves.toBe(true);
    await expect(canManageCoachContent(p, COACH('coachA'), 'coachB')).resolves.toBe(false);
    await expect(canManageCoachContent(p, COACH('owner2'), 'coachB')).resolves.toBe(false);
    await expect(canManageCoachContent(p, COACH('coachB'), 'coachB')).resolves.toBe(true);
    await expect(canManageCoachContent(p, COACH('owner1'), 'coachB', { teamId: 'T2', role: 'OWNER' })).resolves.toBe(false);
  });

  // ── Regressão QA C1 ─────────────────────────────────────────────────────────
  describe('C1 — conteúdo atribuído à equipe principal do autor', () => {
    const rows = [
      { teamId: 'RR', userId: 'rafinha', role: 'OWNER', at: 0 },
      { teamId: 'RR', userId: 'x', role: 'COACH', at: 1 },
      { teamId: 'E2', userId: 'dono2', role: 'OWNER', at: 2 },
      { teamId: 'E2', userId: 'x', role: 'COACH', at: 3 },
    ];
    const prisma = () => ({ teamMember: contentFake(rows) });

    it('equipe principal: OWNER > membership mais antiga', async () => {
      const p = prisma();
      expect(await primaryTeamIdForCoach(p, 'x')).toBe('RR');
      expect(await primaryTeamIdForCoach(p, 'dono2')).toBe('E2');
      expect(await primaryTeamIdForCoach(p, 'ninguem')).toBeNull();
      const owns = { teamMember: contentFake([{ teamId: 'RR', userId: 'y', role: 'COACH', at: 0 }, { teamId: 'Y', userId: 'y', role: 'OWNER', at: 5 }]) };
      expect(await primaryTeamIdForCoach(owns, 'y')).toBe('Y');
    });

    it('conteúdo de X aparece só para a Rafinha', async () => {
      const p = prisma();
      expect(new Set(await teamContentCoachIds(p, 'RR'))).toEqual(new Set(['rafinha', 'x']));
      expect(await teamContentCoachIds(p, 'E2')).toEqual(['dono2']);
      expect(await managedCoachIds(p, COACH('dono2'), { teamId: 'E2', role: 'OWNER' })).toEqual(['dono2']);
      await expect(teamContentWhere(p, COACH('dono2'), { teamId: 'E2', role: 'OWNER' }, 'createdById')).resolves.toEqual({ createdById: 'dono2' });
    });

    it('dono da equipe 2 não gerencia item de X; dono da Rafinha sim', async () => {
      const p = prisma();
      await expect(canManageCoachContent(p, COACH('dono2'), 'x')).resolves.toBe(false);
      await expect(canManageCoachContent(p, COACH('dono2'), 'x', { teamId: 'E2', role: 'OWNER' })).resolves.toBe(false);
      await expect(canManageCoachContent(p, COACH('rafinha'), 'x', { teamId: 'RR', role: 'OWNER' })).resolves.toBe(true);
    });

    it('X na equipe 2 (COACH) não vê nem cria conteúdo lá', async () => {
      const p = prisma();
      expect(await managedCoachIds(p, COACH('x'), { teamId: 'E2', role: 'COACH' })).toEqual([]);
      expect(await managedCoachIds(p, COACH('x'), { teamId: 'RR', role: 'COACH' })).toEqual(['x']);
      await expect(assertCanCreateTeamContent(p, COACH('x'), { teamId: 'E2', role: 'COACH' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(assertCanCreateTeamContent(p, COACH('x'), { teamId: 'RR', role: 'COACH' })).resolves.toEqual({ canPublish: false });
      await expect(assertCanCreateTeamContent(p, COACH('rafinha'), { teamId: 'RR', role: 'OWNER' })).resolves.toEqual({ canPublish: true });
      await expect(assertCanCreateTeamContent(p, COACH('s'), { teamId: 'RR', role: 'STAFF' })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('A4 — dados de saúde por papel', () => {
    const rows = [
      { teamId: 'T1', userId: 'owner1', role: 'OWNER' },
      { teamId: 'T1', userId: 'staff1', role: 'STAFF' },
    ];
    const prof = { coachId: 'coachA', teamId: 'T1', weight: 70, height: 175, vo2max: 50, restingHR: 50, maxHR: 190, level: 'BEGINNER' };
    it('STAFF recebe o perfil sem peso/altura/FC/VO2max; dono e treinador recebem completo', async () => {
      const p = { teamMember: contentFake(rows) };
      const [s] = await redactHealthFields(p, COACH('staff1'), [prof]);
      expect(s).toMatchObject({ weight: null, height: null, vo2max: null, restingHR: null, maxHR: null, level: 'BEGINNER', healthDataHidden: true });
      const [o] = await redactHealthFields(p, COACH('owner1'), [prof]);
      expect(o.weight).toBe(70);
      const [c] = await redactHealthFields(p, COACH('coachA'), [prof]);
      expect(c.maxHR).toBe(190);
      const [a] = await redactHealthFields(p, { id: 'adm', role: 'SUPER_ADMIN' }, [prof]);
      expect(a.vo2max).toBe(50);
    });
  });

  it('athleteProfileScopeWhere: gestão/STAFF → equipe inteira + atribuídos; COACH → atribuídos', async () => {
    const p = fakePrisma(profiles, members);
    expect(await athleteProfileScopeWhere(p, COACH('owner1'))).toEqual({ OR: [{ coachId: 'owner1' }, { teamId: { in: ['T1'] } }] });
    expect(await athleteProfileScopeWhere(p, COACH('staff1'))).toEqual({ OR: [{ coachId: 'staff1' }, { teamId: { in: ['T1'] } }] });
    expect(await athleteProfileScopeWhere(p, COACH('coachB'))).toEqual({ coachId: 'coachB' });
    expect(await athleteProfileScopeWhere(p, { id: 'x', role: 'SUPER_ADMIN' })).toEqual({});
  });
});
