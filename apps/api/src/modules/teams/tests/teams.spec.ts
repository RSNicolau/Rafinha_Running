import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { TeamContextService } from '../team-context.service';
import { TeamRolesGuard } from '../team-roles.guard';
import { TeamsService } from '../teams.service';
import { pickDefaultMembership, signTeamInvite, slugify, verifyTeamInvite } from '../team-scope';
import { UpdateTeamDto } from '../dto/teams.dto';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

function membership(teamId: string, role: string, createdAt = new Date('2026-01-01')) {
  return { teamId, role, createdAt, team: { id: teamId, name: `Equipe ${teamId.slice(0, 2)}`, slug: teamId.slice(0, 4), logoUrl: null, primaryColor: null } };
}

describe('team-scope helpers', () => {
  it('slugify remove acentos e caracteres', () => {
    expect(slugify('Assessoria Corrida São João!')).toBe('assessoria-corrida-sao-joao');
    expect(slugify('   ')).toBe('equipe');
  });

  it('pickDefaultMembership: prefere OWNER/ADMIN; senão o primeiro', () => {
    expect(pickDefaultMembership([membership(T1, 'COACH'), membership(T2, 'ADMIN')])!.teamId).toBe(T2);
    expect(pickDefaultMembership([membership(T1, 'STAFF'), membership(T2, 'COACH')])!.teamId).toBe(T1);
    expect(pickDefaultMembership([])).toBeNull();
  });

  describe('token de convite', () => {
    const OLD = process.env.JWT_SECRET;
    beforeAll(() => { process.env.JWT_SECRET = 'segredo-teste'; });
    afterAll(() => { process.env.JWT_SECRET = OLD; });
    const jwt = new JwtService({});

    it('assina e verifica (e-mail normalizado)', async () => {
      const tok = await signTeamInvite(jwt, { teamId: T1, email: 'Fulano@X.com ', role: 'COACH', inviterId: 'o' });
      const p = await verifyTeamInvite(jwt, tok);
      expect(p).toEqual(expect.objectContaining({ purpose: 'team-invite', teamId: T1, email: 'fulano@x.com', role: 'COACH' }));
    });

    it('access token (segredo principal) não vale como convite', async () => {
      const access = await jwt.signAsync({ sub: 'u', purpose: 'team-invite', teamId: T1, email: 'a@b.c', role: 'COACH' }, { secret: 'segredo-teste' });
      await expect(verifyTeamInvite(jwt, access)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('papel OWNER nunca vem de convite', async () => {
      const forged = await jwt.signAsync({ purpose: 'team-invite', teamId: T1, email: 'a@b.c', role: 'OWNER' }, { secret: 'segredo-teste:team-invite' });
      await expect(verifyTeamInvite(jwt, forged)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

describe('TeamContextService', () => {
  const prisma: any = { teamMember: { findMany: jest.fn() }, team: { findUnique: jest.fn() } };
  const svc = new TeamContextService(prisma);
  beforeEach(() => jest.resetAllMocks());

  it('sem membership → null', async () => {
    prisma.teamMember.findMany.mockResolvedValue([]);
    await expect(svc.resolve({ id: 'u', role: 'COACH' }, { headers: {} })).resolves.toBeNull();
  });

  it('padrão: primeira equipe OWNER/ADMIN', async () => {
    prisma.teamMember.findMany.mockResolvedValue([membership(T1, 'COACH'), membership(T2, 'OWNER')]);
    await expect(svc.resolve({ id: 'u', role: 'COACH' }, { headers: {} })).resolves.toEqual({ teamId: T2, role: 'OWNER' });
  });

  it('header x-team-id escolhe entre as equipes do usuário', async () => {
    prisma.teamMember.findMany.mockResolvedValue([membership(T1, 'COACH'), membership(T2, 'OWNER')]);
    await expect(svc.resolve({ id: 'u', role: 'COACH' }, { headers: { 'x-team-id': T1 } })).resolves.toEqual({ teamId: T1, role: 'COACH' });
  });

  it('header de equipe da qual NÃO é membro → 403', async () => {
    prisma.teamMember.findMany.mockResolvedValue([membership(T1, 'COACH')]);
    await expect(svc.resolve({ id: 'u', role: 'COACH' }, { headers: { 'x-team-id': T2 } })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ADMIN da plataforma pode atuar em qualquer equipe existente via header (como OWNER)', async () => {
    prisma.teamMember.findMany.mockResolvedValue([]);
    prisma.team.findUnique.mockResolvedValue({ id: T2 });
    await expect(svc.resolve({ id: 'adm', role: 'SUPER_ADMIN' }, { headers: { 'x-team-id': T2 } }))
      .resolves.toEqual({ teamId: T2, role: 'OWNER', platformAdmin: true });
  });
});

describe('TeamRolesGuard', () => {
  function ctxFor(user: any, roles: string[] | undefined, headers: any = {}) {
    const req: any = { user, headers };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(roles) } as unknown as Reflector;
    const exec: any = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => req }) };
    return { req, reflector, exec };
  }

  it('permite papel listado e anexa req.team', async () => {
    const teamContext: any = { resolve: jest.fn().mockResolvedValue({ teamId: T1, role: 'ADMIN' }) };
    const { req, reflector, exec } = ctxFor({ id: 'u', role: 'COACH' }, ['OWNER', 'ADMIN']);
    await expect(new TeamRolesGuard(reflector, teamContext).canActivate(exec)).resolves.toBe(true);
    expect(req.team).toEqual({ teamId: T1, role: 'ADMIN' });
  });

  it('recusa papel não listado (COACH em rota de gestão) com 403', async () => {
    const teamContext: any = { resolve: jest.fn().mockResolvedValue({ teamId: T1, role: 'COACH' }) };
    const { reflector, exec } = ctxFor({ id: 'u', role: 'COACH' }, ['OWNER', 'ADMIN']);
    await expect(new TeamRolesGuard(reflector, teamContext).canActivate(exec)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sem equipe → 404', async () => {
    const teamContext: any = { resolve: jest.fn().mockResolvedValue(null) };
    const { reflector, exec } = ctxFor({ id: 'u', role: 'COACH' }, ['OWNER']);
    await expect(new TeamRolesGuard(reflector, teamContext).canActivate(exec)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ADMIN/SUPER_ADMIN da plataforma ignora o papel', async () => {
    const teamContext: any = { resolve: jest.fn().mockResolvedValue({ teamId: T1, role: 'STAFF' }) };
    const { reflector, exec } = ctxFor({ id: 'adm', role: 'ADMIN' }, ['OWNER']);
    await expect(new TeamRolesGuard(reflector, teamContext).canActivate(exec)).resolves.toBe(true);
  });

  it('sem usuário autenticado → false', async () => {
    const teamContext: any = { resolve: jest.fn() };
    const { reflector, exec } = ctxFor(undefined, ['OWNER']);
    await expect(new TeamRolesGuard(reflector, teamContext).canActivate(exec)).resolves.toBe(false);
  });
});

describe('TeamsService', () => {
  const OLD_ENV = { ...process.env };
  let prisma: any;
  let email: any;
  let svc: TeamsService;
  const jwt = new JwtService({});
  const owner = { id: 'owner-1', role: 'COACH', email: 'dono@x.com' };
  const OWNER_CTX = { teamId: T1, role: 'OWNER' as const };
  const ADMIN_CTX = { teamId: T1, role: 'ADMIN' as const };

  beforeEach(() => {
    process.env = { ...OLD_ENV, JWT_SECRET: 'segredo-teste', NODE_ENV: 'test' };
    prisma = {
      team: { findUnique: jest.fn().mockResolvedValue({ id: T1, name: 'Equipe X', status: 'ACTIVE', ownerId: 'owner-1', slug: 'x' }), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      coachSubscription: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
      teamMember: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      user: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ name: 'Dono' }) },
      coachProfile: { upsert: jest.fn() },
      athleteProfile: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      teamPlan: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
      athleteMembership: { count: jest.fn() },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    email = { sendTransactional: jest.fn().mockResolvedValue(undefined) };
    svc = new TeamsService(prisma, jwt, email);
  });
  afterAll(() => { process.env = OLD_ENV; });

  describe('convites de membro', () => {
    it('OWNER convida COACH: envia e-mail com link /register?teamInvite e devolve token só em test', async () => {
      const res: any = await svc.inviteMember(owner, OWNER_CTX, { email: 'Novo@Coach.com', role: 'COACH' });
      expect(res.invited).toBe(true);
      expect(res.email).toBe('novo@coach.com');
      expect(typeof res.token).toBe('string');
      expect(email.sendTransactional).toHaveBeenCalledWith('novo@coach.com', expect.stringContaining('Equipe X'), expect.stringContaining('/register?teamInvite='));
      const p = await verifyTeamInvite(jwt, res.token);
      expect(p).toEqual(expect.objectContaining({ teamId: T1, role: 'COACH', email: 'novo@coach.com', inviterId: 'owner-1' }));

      process.env.NODE_ENV = 'production';
      const prod: any = await svc.inviteMember(owner, OWNER_CTX, { email: 'outro@coach.com', role: 'STAFF' });
      expect(prod.token).toBeUndefined();
    });

    it('ADMIN não convida ADMIN', async () => {
      await expect(svc.inviteMember({ id: 'adm-1', role: 'COACH' }, ADMIN_CTX, { email: 'a@b.com', role: 'ADMIN' }))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.inviteMember({ id: 'adm-1', role: 'COACH' }, ADMIN_CTX, { email: 'a@b.com', role: 'COACH' })).resolves.toBeTruthy();
    });

    it('recusa quem já é membro ativo e contas de atleta', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u2', role: 'COACH', teamMemberships: [{ isActive: true }] });
      await expect(svc.inviteMember(owner, OWNER_CTX, { email: 'ja@x.com', role: 'COACH' })).rejects.toBeInstanceOf(ConflictException);
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u3', role: 'ATHLETE', teamMemberships: [] });
      await expect(svc.inviteMember(owner, OWNER_CTX, { email: 'atleta@x.com', role: 'COACH' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aceite: e-mail precisa bater e conta precisa ser COACH; ATHLETE recebe mensagem clara', async () => {
      const tok = await signTeamInvite(jwt, { teamId: T1, email: 'coach@x.com', role: 'COACH', inviterId: 'owner-1' });

      prisma.user.findUnique.mockResolvedValueOnce({ id: 'c1', email: 'outro@x.com', role: 'COACH' });
      await expect(svc.acceptInvite({ id: 'c1' }, tok)).rejects.toBeInstanceOf(ForbiddenException);

      prisma.user.findUnique.mockResolvedValueOnce({ id: 'a1', email: 'coach@x.com', role: 'ATHLETE' });
      await expect(svc.acceptInvite({ id: 'a1' }, tok)).rejects.toThrow(/conta de treinador/);

      prisma.user.findUnique.mockResolvedValueOnce({ id: 'c1', email: 'COACH@x.com', role: 'COACH' });
      const ok: any = await svc.acceptInvite({ id: 'c1' }, tok);
      expect(ok.team).toEqual(expect.objectContaining({ id: T1, role: 'COACH' }));
      expect(prisma.teamMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { teamId_userId: { teamId: T1, userId: 'c1' } },
        update: { role: 'COACH', isActive: true },
      }));
    });
  });

  describe('membros', () => {
    it('não altera o OWNER por PATCH (usar transferência)', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ userId: 'owner-1', role: 'OWNER', isActive: true });
      await expect(svc.updateMember(owner, OWNER_CTX, 'owner-1', { isActive: false })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ADMIN não promove a ADMIN nem altera outro ADMIN', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ userId: 'c1', role: 'COACH', isActive: true });
      await expect(svc.updateMember({ id: 'adm-1' }, ADMIN_CTX, 'c1', { role: 'ADMIN' })).rejects.toBeInstanceOf(ForbiddenException);
      prisma.teamMember.findUnique.mockResolvedValue({ userId: 'adm-2', role: 'ADMIN', isActive: true });
      await expect(svc.updateMember({ id: 'adm-1' }, ADMIN_CTX, 'adm-2', { role: 'COACH' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('desativar treinador devolve os atletas dele ao dono da equipe', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ userId: 'c1', role: 'COACH', isActive: true });
      prisma.teamMember.update.mockResolvedValue({ userId: 'c1', role: 'COACH', isActive: false });
      await svc.deactivateMember(owner, OWNER_CTX, 'c1');
      expect(prisma.athleteProfile.updateMany).toHaveBeenCalledWith({ where: { teamId: T1, coachId: 'c1' }, data: { coachId: 'owner-1' } });
    });

    it('transferência de propriedade: novo OWNER, antigo vira ADMIN', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ userId: 'c1', role: 'COACH', isActive: true });
      await svc.transferOwnership(owner, OWNER_CTX, 'c1');
      expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: T1 }, data: { ownerId: 'c1' } });
      expect(prisma.teamMember.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'OWNER' } }));
      expect(prisma.teamMember.updateMany).toHaveBeenCalledWith({ where: { teamId: T1, userId: 'owner-1' }, data: { role: 'ADMIN' } });
    });

    it('M4: plano da plataforma acompanha a equipe quando o novo dono não tem plano', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ userId: 'c1', role: 'COACH', isActive: true });
      prisma.coachSubscription.findUnique.mockImplementation(async ({ where }: any) => (where.coachId === 'owner-1' ? { id: 'sub-1' } : null));
      const r: any = await svc.transferOwnership(owner, OWNER_CTX, 'c1');
      expect(prisma.coachSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { coachId: 'c1' } });
      expect(r.subscriptionTransferred).toBe(true);
    });

    it('M4: não move o plano quando o dono antigo possui outra equipe (explica)', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ userId: 'c1', role: 'COACH', isActive: true });
      prisma.coachSubscription.findUnique.mockImplementation(async ({ where }: any) => (where.coachId === 'owner-1' ? { id: 'sub-1' } : null));
      prisma.team.count.mockResolvedValue(1);
      const r: any = await svc.transferOwnership(owner, OWNER_CTX, 'c1');
      expect(prisma.coachSubscription.update).not.toHaveBeenCalled();
      expect(r.subscriptionNote).toMatch(/precisa assinar/);
    });

    it('M5: nome só com espaços ou curto demais é recusado; espaços extras são removidos', async () => {
      await expect(svc.updateTeam(owner, OWNER_CTX, { name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.updateTeam(owner, OWNER_CTX, { name: 'A' })).rejects.toBeInstanceOf(BadRequestException);
      prisma.team.update.mockResolvedValue({ id: T1, name: 'Equipe Nova', slug: 'x' });
      await svc.updateTeam(owner, OWNER_CTX, { name: '  Equipe   Nova ' });
      expect(prisma.team.update.mock.calls[0][0].data.name).toBe('Equipe Nova');
    });

    it('B8: convite registrado no AuditLog e listado até a pessoa entrar', async () => {
      await svc.inviteMember(owner, OWNER_CTX, { email: 'pendente@x.com', role: 'COACH' });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'TEAM_INVITE', entityId: T1 }) });
      prisma.auditLog.findMany.mockResolvedValue([
        { createdAt: new Date(), metadata: { email: 'pendente@x.com', role: 'COACH' } },
        { createdAt: new Date(), metadata: { email: 'entrou@x.com', role: 'STAFF' } },
      ]);
      prisma.teamMember.findMany.mockResolvedValue([{ user: { email: 'entrou@x.com' } }]);
      const list = await svc.listRecentInvites(OWNER_CTX);
      expect(list.map((i: any) => i.email)).toEqual(['pendente@x.com']);
    });

    it('transferência exige membro ativo e não-STAFF', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ userId: 's1', role: 'STAFF', isActive: true });
      await expect(svc.transferOwnership(owner, OWNER_CTX, 's1')).rejects.toBeInstanceOf(BadRequestException);
      prisma.teamMember.findUnique.mockResolvedValue({ userId: 'c9', role: 'COACH', isActive: false });
      await expect(svc.transferOwnership(owner, OWNER_CTX, 'c9')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('atletas e treinador responsável', () => {
    it('COACH só lista os atletas atribuídos a ele (ignora filtro coachId do cliente)', async () => {
      prisma.athleteProfile.findMany.mockResolvedValue([]);
      prisma.athleteProfile.count.mockResolvedValue(0);
      await svc.listAthletes({ id: 'c1', role: 'COACH' }, { teamId: T1, role: 'COACH' }, { coachId: 'c2' });
      expect(prisma.athleteProfile.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ teamId: T1, coachId: 'c1' }));
    });

    it('OWNER lista a equipe inteira e pode filtrar por treinador / status de mensalidade', async () => {
      prisma.athleteProfile.findMany.mockResolvedValue([]);
      prisma.athleteProfile.count.mockResolvedValue(0);
      await svc.listAthletes(owner, OWNER_CTX, {});
      expect(prisma.athleteProfile.findMany.mock.calls[0][0].where.coachId).toBeUndefined();
      await svc.listAthletes(owner, OWNER_CTX, { coachId: 'c2', membershipStatus: 'PAST_DUE' });
      const w = prisma.athleteProfile.findMany.mock.calls[1][0].where;
      expect(w.coachId).toBe('c2');
      expect(w.user.athleteMemberships).toEqual({ some: { teamId: T1, status: 'PAST_DUE' } });
    });

    it('atribuir treinador: atleta precisa ser da equipe e treinador membro ativo (não STAFF)', async () => {
      prisma.athleteProfile.findUnique.mockResolvedValue({ teamId: T2 });
      await expect(svc.assignCoach(OWNER_CTX, 'a1', { coachId: 'c1' })).rejects.toBeInstanceOf(NotFoundException);

      prisma.athleteProfile.findUnique.mockResolvedValue({ teamId: T1 });
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'STAFF', isActive: true });
      await expect(svc.assignCoach(OWNER_CTX, 'a1', { coachId: 's1' })).rejects.toBeInstanceOf(BadRequestException);

      prisma.teamMember.findUnique.mockResolvedValue({ role: 'COACH', isActive: true });
      await svc.assignCoach(OWNER_CTX, 'a1', { coachId: 'c1' });
      expect(prisma.athleteProfile.update).toHaveBeenCalledWith({ where: { userId: 'a1' }, data: { coachId: 'c1' } });
    });
  });

  describe('configurações e planos', () => {
    it('ADMIN não altera a carteira Asaas; OWNER altera', async () => {
      await expect(svc.updateTeam({ id: 'adm' }, ADMIN_CTX, { asaasWalletId: '33333333-3333-4333-8333-333333333333' }))
        .rejects.toBeInstanceOf(ForbiddenException);
      prisma.team.update.mockResolvedValue({ id: T1, asaasWalletId: 'x', platformFeePercent: 0 });
      await svc.updateTeam(owner, OWNER_CTX, { asaasWalletId: '33333333-3333-4333-8333-333333333333', graceDays: 7 });
      expect(prisma.team.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { asaasWalletId: '33333333-3333-4333-8333-333333333333', graceDays: 7 },
      }));
    });

    it('DTO: walletId precisa ser UUID, graceDays 0–30 e platformFeePercent é rejeitado', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      const meta = { type: 'body' as const, metatype: UpdateTeamDto };
      await expect(pipe.transform({ asaasWalletId: 'nao-uuid' }, meta)).rejects.toBeDefined();
      await expect(pipe.transform({ graceDays: 31 }, meta)).rejects.toBeDefined();
      await expect(pipe.transform({ platformFeePercent: 0 }, meta)).rejects.toBeDefined();
      await expect(pipe.transform({ graceDays: 30, name: 'Equipe' }, meta)).resolves.toBeTruthy();
    });

    it('excluir plano com mensalidades → apenas desativa', async () => {
      prisma.teamPlan.findFirst.mockResolvedValue({ id: 'p1', teamId: T1 });
      prisma.athleteMembership.count.mockResolvedValue(3);
      const r: any = await svc.deletePlan(OWNER_CTX, 'p1');
      expect(r.deactivated).toBe(true);
      expect(prisma.teamPlan.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { isActive: false } });
      expect(prisma.teamPlan.delete).not.toHaveBeenCalled();

      prisma.athleteMembership.count.mockResolvedValue(0);
      const r2: any = await svc.deletePlan(OWNER_CTX, 'p1');
      expect(r2.deleted).toBe(true);
    });

    it('plano de outra equipe → 404', async () => {
      prisma.teamPlan.findFirst.mockResolvedValue(null);
      await expect(svc.updatePlan(OWNER_CTX, 'p-x', { priceInCents: 1000 })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
