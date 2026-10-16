import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { MembershipsService, membershipAccess } from './memberships.service';
import { TeamContextResolver } from './team-context.resolver';
import { TeamContextService } from '../teams/team-context.service';
import { derivedPaymentToken, sha256 } from '../payments/checkout/checkout.service';

const VALID_CPF = '529.982.247-25';
const buyer = { name: 'Maria Atleta', email: 'maria@x.com', cpf: VALID_CPF };

const team = { id: 'team-1', name: 'Equipe RR', slug: 'rr', ownerId: 'owner-1', logoUrl: null, asaasWalletId: 'wal_team', platformFeePercent: 10, graceDays: 5 };
const plan = { id: 'plan-1', teamId: 'team-1', name: 'Mensal', interval: 'MONTHLY', priceInCents: 17400, isActive: true, benefits: [], sortOrder: 0, description: null };

function asMember(prisma: any, role: string) {
  prisma.teamMember.findMany.mockResolvedValue([{ teamId: 'team-1', role, createdAt: new Date(), team }]);
}

function setup(opts: { asaas?: boolean; team?: any } = {}) {
  const prisma: any = {
    athleteProfile: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1', coachId: 'coach-1' }), count: jest.fn().mockResolvedValue(0) },
    team: { findUnique: jest.fn().mockResolvedValue(opts.team ?? team), findFirst: jest.fn().mockResolvedValue(null) },
    teamMember: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    teamPlan: { findFirst: jest.fn().mockResolvedValue(plan), findMany: jest.fn().mockResolvedValue([plan]), count: jest.fn().mockResolvedValue(1) },
    athleteMembership: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: 'mem-1', createdAt: new Date(), currentPeriodEnd: null, externalSubscriptionId: null, ...data, plan, team: opts.team ?? team })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, teamId: 'team-1', athleteId: 'ath-1', priceInCents: 17400, provider: 'ASAAS', status: 'PENDING', currentPeriodEnd: null, ...data, plan, team: opts.team ?? team })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ ...data, createdAt: new Date() })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, provider: 'ASAAS', method: 'PIX', amount: 17400, status: 'PENDING', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ asaasCustomerId: null, email: 'maria@x.com', name: 'Maria' }), update: jest.fn().mockResolvedValue({}) },
    subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const asaas: any = {
    isConfigured: opts.asaas ?? true,
    findOrCreateCustomer: jest.fn().mockResolvedValue('cus_1'),
    createSubscription: jest.fn().mockResolvedValue({ id: 'sub_1', status: 'ACTIVE' }),
    listSubscriptionPayments: jest.fn().mockResolvedValue([
      { id: 'pay_a1', status: 'PENDING', value: 174, dueDate: '2026-10-15', subscription: 'sub_1', invoiceUrl: 'https://asaas/i/1', billingType: 'PIX' },
    ]),
    getPixQrCode: jest.fn().mockResolvedValue({ encodedImage: 'IMG', payload: '000201PIX', expirationDate: '2026-10-16 23:59:59' }),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
    getSubscription: jest.fn(),
    updateSubscription: jest.fn().mockResolvedValue({}),
  };
  const checkout: any = {
    upsertMembershipPayment: jest.fn(async (_m: any, remote: any, extra: any) => ({
      id: extra.id, provider: 'ASAAS', method: remote.billingType, amount: 17400, status: 'PENDING', checkoutUrl: remote.invoiceUrl, expiresAt: new Date('2026-10-15T03:00:00Z'),
    })),
    ingestMembershipRemotePayment: jest.fn().mockResolvedValue({ action: 'none' }),
  };
  const email: any = {
    sendMembershipReminder: jest.fn().mockResolvedValue(undefined),
    sendMembershipPastDue: jest.fn().mockResolvedValue(undefined),
    sendMembershipPastDueSummary: jest.fn().mockResolvedValue(undefined),
  };
  const resolver = new TeamContextResolver(prisma, new TeamContextService(prisma));
  const svc = new MembershipsService(prisma, asaas, checkout, resolver, email);
  return { svc, prisma, asaas, checkout, email };
}

describe('MembershipsService', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, NODE_ENV: 'test', JWT_SECRET: 'test-secret' };
    delete process.env.PAYMENTS_FAKE_PROVIDER;
    delete process.env.ASAAS_BASE_URL;
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('subscribe', () => {
    it('creates the Asaas subscription with split (100 - fee)%, first charge today, price locked; CPF never stored', async () => {
      const { svc, prisma, asaas, checkout } = setup();
      const r = await svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer, billingType: 'PIX' });

      expect(prisma.athleteMembership.create.mock.calls[0][0].data).toMatchObject({
        teamId: 'team-1', athleteId: 'ath-1', planId: 'plan-1', status: 'PENDING', provider: 'ASAAS', priceInCents: 17400,
      });
      const sub = asaas.createSubscription.mock.calls[0][0];
      expect(sub).toMatchObject({ customer: 'cus_1', billingType: 'PIX', valueInCents: 17400, cycle: 'MONTHLY', externalReference: 'mem-1' });
      expect(sub.split).toEqual([{ walletId: 'wal_team', percentualValue: 90 }]);
      expect(sub.nextDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // somente o id do cliente Asaas vai para o banco
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'ath-1' }, data: { asaasCustomerId: 'cus_1' } });
      expect(JSON.stringify(prisma.athleteMembership.create.mock.calls)).not.toContain('52998224725');
      // 1ª cobrança vira Payment MEMBERSHIP consultável pela tela /pedido
      const extra = checkout.upsertMembershipPayment.mock.calls[0][2];
      expect(extra.accessTokenHash).toBe(sha256(derivedPaymentToken(extra.id)!));
      expect(r).toMatchObject({ membershipId: 'mem-1', paymentId: extra.id, accessToken: derivedPaymentToken(extra.id), amountInCents: 17400 });
      expect(r.pix).toMatchObject({ copyPaste: '000201PIX' });
      expect(r.payPath).toContain(`/pedido/${extra.id}?token=`);
    });

    it('quarterly plan → QUARTERLY cycle', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.teamPlan.findFirst.mockResolvedValue({ ...plan, interval: 'QUARTERLY', priceInCents: 49500 });
      prisma.athleteMembership.create.mockImplementation(async ({ data }: any) => ({ id: 'mem-1', ...data, plan: { ...plan, interval: 'QUARTERLY' }, team }));
      asaas.listSubscriptionPayments.mockResolvedValue([]);
      await svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer });
      expect(asaas.createSubscription.mock.calls[0][0]).toMatchObject({ cycle: 'QUARTERLY', valueInCents: 49500 });
    });

    it('team without wallet → subscription WITHOUT split (never walletId undefined)', async () => {
      const noWallet = { ...team, asaasWalletId: null };
      const { svc, asaas } = setup({ team: noWallet });
      await svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer });
      expect(asaas.createSubscription.mock.calls[0][0].split).toBeUndefined();
    });

    it('plan of another team (or inactive) is rejected', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.teamPlan.findFirst.mockResolvedValue(null);
      await expect(svc.subscribe({ id: 'ath-1' }, { planId: 'plan-x', buyer })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.teamPlan.findFirst).toHaveBeenCalledWith({ where: { id: 'plan-x', teamId: 'team-1', isActive: true } });
      expect(asaas.createSubscription).not.toHaveBeenCalled();
    });

    it('invalid CPF → 400 before any gateway call', async () => {
      const { svc, asaas } = setup();
      await expect(svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer: { ...buyer, cpf: '111.111.111-11' } })).rejects.toBeInstanceOf(BadRequestException);
      expect(asaas.findOrCreateCustomer).not.toHaveBeenCalled();
    });

    it('athlete without team → 404', async () => {
      const { svc, prisma } = setup();
      prisma.athleteProfile.findUnique.mockResolvedValue({ teamId: null, coachId: null });
      await expect(svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ACTIVE on the same plan → 409; ACTIVE on another plan → 409 (use change-plan)', async () => {
      const { svc, prisma } = setup();
      prisma.athleteMembership.findFirst.mockResolvedValue({ id: 'mem-1', teamId: 'team-1', planId: 'plan-1', status: 'ACTIVE', plan, team });
      await expect(svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer })).rejects.toThrow('Você já tem esta mensalidade ativa');
      prisma.athleteMembership.findFirst.mockResolvedValue({ id: 'mem-1', teamId: 'team-1', planId: 'plan-2', status: 'ACTIVE', plan, team });
      await expect(svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer })).rejects.toBeInstanceOf(ConflictException);
    });

    it('reuses a non-canceled PENDING membership: stops old subscription, updates the same row', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.athleteMembership.findFirst.mockResolvedValue({
        id: 'mem-old', teamId: 'team-1', athleteId: 'ath-1', planId: 'plan-2', status: 'PENDING', provider: 'ASAAS', externalSubscriptionId: 'sub_old', plan, team,
      });
      await svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer });
      expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_old');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({ where: { membershipId: 'mem-old', status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'REPLACED' } });
      expect(prisma.athleteMembership.create).not.toHaveBeenCalled();
      expect(prisma.athleteMembership.update.mock.calls[0][0]).toMatchObject({ where: { id: 'mem-old' }, data: { planId: 'plan-1', priceInCents: 17400, status: 'PENDING' } });
    });

    it('gateway failure on a new membership → marked CANCELED (GATEWAY_ERROR) and error propagates', async () => {
      const { svc, prisma, asaas } = setup();
      asaas.createSubscription.mockRejectedValue(new Error('asaas down'));
      await expect(svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer })).rejects.toThrow('asaas down');
      expect(prisma.athleteMembership.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELED', cancelReason: 'GATEWAY_ERROR' }) }));
    });

    it('FAKE provider (dev/test, no Asaas key): FAKE membership + first PIX payment payable via fake-pay', async () => {
      process.env.PAYMENTS_FAKE_PROVIDER = 'true';
      const { svc, prisma, asaas } = setup({ asaas: false });
      const r = await svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer, billingType: 'BOLETO' });
      expect(prisma.athleteMembership.create.mock.calls[0][0].data.provider).toBe('FAKE');
      expect(asaas.createSubscription).not.toHaveBeenCalled();
      const pay = prisma.payment.create.mock.calls[0][0].data;
      expect(pay).toMatchObject({ purpose: 'MEMBERSHIP', membershipId: 'mem-1', teamId: 'team-1', provider: 'FAKE', method: 'PIX', amount: 17400, status: 'PENDING' });
      expect(pay.externalPaymentId).toBe(`fake_${pay.id}`);
      expect(pay.accessTokenHash).toBe(sha256(r.accessToken!));
      expect(r.provider).toBe('FAKE');
      expect(r.pix?.copyPaste).toContain('FAKE-PIX');
    });

    it('no gateway and no fake → 503', async () => {
      const { svc } = setup({ asaas: false });
      await expect(svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer })).rejects.toThrow('Cobrança recorrente indisponível');
    });
  });

  describe('cancel / change plan', () => {
    it('athlete cancel: cancels at Asaas, CANCELED but keeps access until period end', async () => {
      const { svc, prisma, asaas } = setup();
      const end = new Date(Date.now() + 10 * 86400000);
      prisma.athleteMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE', provider: 'ASAAS', externalSubscriptionId: 'sub_1', plan, team });
      prisma.athleteMembership.update.mockResolvedValue({ id: 'mem-1', status: 'CANCELED', canceledAt: new Date(), currentPeriodEnd: end });
      const r = await svc.cancelMine('ath-1', 'mudança de cidade');
      expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_1');
      expect(prisma.athleteMembership.update.mock.calls[0][0].data).toMatchObject({ status: 'CANCELED', cancelReason: 'mudança de cidade', nextDueDate: null });
      expect(r.accessUntil).toEqual(end);
      expect(membershipAccess({ status: 'CANCELED' as any, currentPeriodEnd: end })).toBe(true);
      expect(membershipAccess({ status: 'CANCELED' as any, currentPeriodEnd: new Date(Date.now() - 1000) })).toBe(false);
    });

    it('change plan: updates Asaas value/cycle from next cycle and local pending charges', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.athleteMembership.findFirst.mockResolvedValue({ id: 'mem-1', teamId: 'team-1', planId: 'plan-1', status: 'ACTIVE', provider: 'ASAAS', externalSubscriptionId: 'sub_1', plan, team });
      prisma.teamPlan.findFirst.mockResolvedValue({ ...plan, id: 'plan-q', interval: 'QUARTERLY', priceInCents: 49500 });
      await svc.changePlan('ath-1', 'plan-q');
      expect(asaas.updateSubscription).toHaveBeenCalledWith('sub_1', expect.objectContaining({ valueInCents: 49500, cycle: 'QUARTERLY', updatePendingPayments: true }));
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({ where: { membershipId: 'mem-1', status: 'PENDING', failureReason: null }, data: { amount: 49500 } });
    });

    it('change plan on PENDING → 409', async () => {
      const { svc, prisma } = setup();
      prisma.athleteMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'PENDING', planId: 'plan-1', plan, team });
      await expect(svc.changePlan('ath-1', 'plan-2')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('team management access', () => {
    it('COACH team role → 403; no team → 404; STAFF → ok (via TeamContextService)', async () => {
      const { svc, prisma } = setup();
      asMember(prisma, 'COACH');
      await expect(svc.summary({ id: 'coach-1', role: 'COACH' })).rejects.toBeInstanceOf(ForbiddenException);

      prisma.teamMember.findMany.mockResolvedValue([]);
      await expect(svc.summary({ id: 'x', role: 'COACH' })).rejects.toBeInstanceOf(NotFoundException);

      asMember(prisma, 'STAFF');
      await expect(svc.summary({ id: 'staff-1', role: 'COACH' })).resolves.toMatchObject({ team: { id: 'team-1' } });
    });

    it('x-team-id header is honoured; non-member team via ?teamId → 404', async () => {
      const { svc, prisma } = setup();
      asMember(prisma, 'ADMIN');
      await expect(svc.summary({ id: 'a', role: 'COACH' }, undefined, { headers: { 'x-team-id': 'team-1' } })).resolves.toMatchObject({ team: { id: 'team-1' } });
      await expect(svc.summary({ id: 'a', role: 'COACH' }, 'other-team')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('platform ADMIN can target any team via ?teamId', async () => {
      const { svc, prisma } = setup();
      const id = '11111111-1111-1111-1111-111111111111';
      await expect(svc.summary({ id: 'admin', role: 'ADMIN' }, id)).resolves.toMatchObject({ team: { id: 'team-1' } });
      expect(prisma.team.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id } }));
    });
  });

  it('summary: MRR normalizes quarterly/3, semiannual/6, annual/12; counts and money KPIs', async () => {
    const { svc, prisma } = setup();
    prisma.athleteMembership.groupBy.mockResolvedValue([
      { status: 'ACTIVE', _count: { _all: 4 } },
      { status: 'PAST_DUE', _count: { _all: 2 } },
      { status: 'PENDING', _count: { _all: 1 } },
    ]);
    prisma.athleteMembership.count.mockResolvedValue(3);
    prisma.athleteMembership.findMany
      .mockResolvedValueOnce([
        { priceInCents: 17400, plan: { interval: 'MONTHLY' } },
        { priceInCents: 49500, plan: { interval: 'QUARTERLY' } },
        { priceInCents: 96000, plan: { interval: 'SEMIANNUAL' } },
        { priceInCents: 180000, plan: { interval: 'ANNUAL' } },
      ])
      .mockResolvedValueOnce([{ id: 'm9', priceInCents: 17400, nextDueDate: new Date(), athlete: { id: 'a9', name: 'Ana' }, plan: { name: 'Mensal' } }]);
    prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 66900 } }).mockResolvedValueOnce({ _sum: { amount: 34800 } });
    const s = await svc.computeSummary(team, new Date('2026-10-15T15:00:00Z'));
    expect(s).toMatchObject({
      activeCount: 4,
      pastDueCount: 2,
      pendingCount: 1,
      canceledLast30: 3,
      mrrInCents: 17400 + 16500 + 16000 + 15000,
      receivedThisMonthInCents: 66900,
      overdueAmountInCents: 34800,
      hasPlans: true,
    });
    expect(s.upcoming7Days[0]).toMatchObject({ athleteName: 'Ana', amountInCents: 17400 });
    // recebido no mês desde 01/10 00:00 (SP)
    expect(prisma.payment.aggregate.mock.calls[0][0].where.paidAt.gte.toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });

  describe('scheduler: markPastDue', () => {
    it('only memberships past due date + team graceDays become PAST_DUE; athlete e-mail + owner summary', async () => {
      const { svc, prisma, email } = setup();
      const now = new Date('2026-10-20T12:00:00-03:00');
      const base = {
        teamId: 'team-1', priceInCents: 17400,
        team: { id: 'team-1', name: 'Equipe RR', graceDays: 5, owner: { email: 'dono@x.com', name: 'Dono' } },
        athlete: { email: 'a@x.com', name: 'Atleta' }, plan: { name: 'Mensal' },
      };
      prisma.athleteMembership.findMany.mockResolvedValue([
        { ...base, id: 'late', nextDueDate: new Date('2026-10-10T03:00:00Z') }, // 10/10 + 5 → inadimplente desde 16/10
        { ...base, id: 'grace', nextDueDate: new Date('2026-10-17T03:00:00Z') }, // ainda na carência
      ]);
      prisma.payment.findFirst.mockResolvedValue({ id: 'p-open', amount: 17400, checkoutUrl: 'https://asaas/i/x' });
      const r = await svc.markPastDue(now);
      expect(r).toEqual({ marked: 1, teams: 1 });
      expect(prisma.athleteMembership.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.athleteMembership.updateMany).toHaveBeenCalledWith({
        where: { id: 'late', status: 'ACTIVE', nextDueDate: new Date('2026-10-10T03:00:00Z') },
        data: { status: 'PAST_DUE' },
      });
      expect(email.sendMembershipPastDue).toHaveBeenCalledWith('a@x.com', expect.objectContaining({ invoiceUrl: 'https://asaas/i/x' }));
      expect(email.sendMembershipPastDueSummary).toHaveBeenCalledWith('dono@x.com', expect.objectContaining({ athletes: [expect.objectContaining({ name: 'Atleta' })] }));
    });

    it('lost race (already paid/changed) → not counted, no e-mail', async () => {
      const { svc, prisma, email } = setup();
      prisma.athleteMembership.findMany.mockResolvedValue([
        { id: 'x', teamId: 't', priceInCents: 1, nextDueDate: new Date('2026-01-01T03:00:00Z'), team: { id: 't', name: 'T', graceDays: 0, owner: null }, athlete: { email: 'a@x', name: 'A' }, plan: { name: 'P' } },
      ]);
      prisma.athleteMembership.updateMany.mockResolvedValue({ count: 0 });
      expect(await svc.markPastDue(new Date('2026-10-20T12:00:00Z'))).toEqual({ marked: 0, teams: 0 });
      expect(email.sendMembershipPastDue).not.toHaveBeenCalled();
    });
  });

  it('reconcileOpen: throttled by MEMBERSHIP_RECONCILE_MINUTES and ingests each subscription payment', async () => {
    const { svc, prisma, asaas, checkout } = setup();
    prisma.athleteMembership.findMany.mockResolvedValue([
      { id: 'mem-1', teamId: 'team-1', athleteId: 'a', status: 'PENDING', priceInCents: 17400, provider: 'ASAAS', externalSubscriptionId: 'sub_1', plan, team },
    ]);
    asaas.listSubscriptionPayments.mockResolvedValue([{ id: 'p1', status: 'RECEIVED', value: 174, dueDate: '2026-10-15' }]);
    const now = new Date();
    await svc.reconcileOpen(now);
    expect(checkout.ingestMembershipRemotePayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mem-1', externalSubscriptionId: 'sub_1', team: { graceDays: 5 } }),
      expect.objectContaining({ id: 'p1', subscription: 'sub_1' }),
      'RECONCILE',
    );
    expect(await svc.reconcileOpen(new Date(now.getTime() + 60_000))).toMatchObject({ skipped: 'throttled' });
  });

  describe('remind', () => {
    it('sends the invoice link once per day per membership (429 after)', async () => {
      const { svc, prisma, email } = setup();
      asMember(prisma, 'OWNER');
      prisma.athleteMembership.findFirst.mockResolvedValue({ id: 'mem-1', teamId: 'team-1', athleteId: 'ath-1', status: 'PAST_DUE', plan, team });
      prisma.payment.findFirst.mockResolvedValue({ id: 'p-open', amount: 17400, checkoutUrl: 'https://asaas/i/1', expiresAt: new Date('2026-10-01T03:00:00Z') });
      const r = await svc.remind({ id: 'owner-1', role: 'COACH' }, 'mem-1');
      expect(r.sent).toBe(true);
      expect(email.sendMembershipReminder).toHaveBeenCalledWith('maria@x.com', expect.objectContaining({ invoiceUrl: 'https://asaas/i/1', overdue: true }));
      expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'MEMBERSHIP_REMINDER', entityId: 'mem-1' }) });

      prisma.auditLog.findFirst.mockResolvedValue({ createdAt: new Date() });
      const err = await svc.remind({ id: 'owner-1', role: 'COACH' }, 'mem-1').catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(email.sendMembershipReminder).toHaveBeenCalledTimes(1);
    });

    it('membership of another team → 404', async () => {
      const { svc, prisma } = setup();
      asMember(prisma, 'OWNER');
      prisma.athleteMembership.findFirst.mockResolvedValue(null);
      await expect(svc.remind({ id: 'owner-1', role: 'COACH' }, 'mem-x')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.athleteMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'mem-x', teamId: 'team-1' } }));
    });
  });

  describe('pause / resume', () => {
    it('pause cancels at the gateway and sets PAUSED; resume creates a new subscription due at period end', async () => {
      const { svc, prisma, asaas } = setup();
      asMember(prisma, 'OWNER');
      const end = new Date(Date.now() + 20 * 86400000);
      prisma.athleteMembership.findFirst.mockResolvedValue({ id: 'mem-1', teamId: 'team-1', athleteId: 'ath-1', status: 'ACTIVE', provider: 'ASAAS', externalSubscriptionId: 'sub_1', currentPeriodEnd: end, plan, team, priceInCents: 17400 });
      prisma.athleteMembership.update.mockResolvedValueOnce({ id: 'mem-1', status: 'PAUSED', currentPeriodEnd: end });
      const p = await svc.pause({ id: 'owner-1', role: 'COACH' }, 'mem-1');
      expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_1');
      expect(p).toMatchObject({ status: 'PAUSED', accessUntil: end });

      prisma.athleteMembership.findFirst.mockResolvedValue({ id: 'mem-1', teamId: 'team-1', athleteId: 'ath-1', status: 'PAUSED', provider: 'ASAAS', externalSubscriptionId: 'sub_1', currentPeriodEnd: end, plan, team, priceInCents: 17400 });
      prisma.user.findUnique.mockResolvedValue({ asaasCustomerId: 'cus_saved' });
      await svc.resume({ id: 'owner-1', role: 'COACH' }, 'mem-1');
      const sub = asaas.createSubscription.mock.calls[0][0];
      expect(sub).toMatchObject({ customer: 'cus_saved', billingType: 'UNDEFINED', valueInCents: 17400 });
      expect(sub.nextDueDate).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(end));
      expect(prisma.athleteMembership.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
    });

    it('resume without a saved Asaas customer → 409 (athlete must subscribe again)', async () => {
      const { svc, prisma } = setup();
      asMember(prisma, 'OWNER');
      prisma.athleteMembership.findFirst.mockResolvedValue({ id: 'mem-1', teamId: 'team-1', athleteId: 'ath-1', status: 'PAUSED', provider: 'ASAAS', currentPeriodEnd: null, plan, team, priceInCents: 17400 });
      prisma.user.findUnique.mockResolvedValue({ asaasCustomerId: null });
      await expect(svc.resume({ id: 'owner-1', role: 'COACH' }, 'mem-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.athleteMembership.update).toHaveBeenLastCalledWith({ where: { id: 'mem-1' }, data: { status: 'PAUSED' } });
    });
  });

  it('isActive: ACTIVE, or canceled/paused within the paid period, or legacy subscription', async () => {
    const { svc, prisma } = setup();
    prisma.athleteMembership.findMany.mockResolvedValueOnce([{ status: 'ACTIVE', currentPeriodEnd: null }]);
    expect(await svc.isActive('a')).toBe(true);
    prisma.athleteMembership.findMany.mockResolvedValueOnce([{ status: 'CANCELED', currentPeriodEnd: new Date(Date.now() - 1000) }]);
    expect(await svc.isActive('a')).toBe(false);
    prisma.athleteMembership.findMany.mockResolvedValueOnce([]);
    prisma.subscription.findFirst.mockResolvedValueOnce({ id: 'legacy' });
    expect(await svc.isActive('a')).toBe(true);
  });

  it('getMine: athlete team plans, PAST_DUE banner, legacy subscription only without membership', async () => {
    const { svc, prisma } = setup();
    prisma.athleteMembership.findFirst.mockResolvedValue({
      id: 'mem-1', status: 'PAST_DUE', teamId: 'team-1', provider: 'FAKE', priceInCents: 17400, plan, team, currentPeriodEnd: null, nextDueDate: new Date('2026-10-01T03:00:00Z'),
    });
    prisma.payment.findMany.mockResolvedValue([
      { id: 'p1', membershipId: 'mem-1', amount: 17400, status: 'PENDING', expiresAt: new Date('2026-10-01T03:00:00Z'), checkoutUrl: null, createdAt: new Date() },
    ]);
    const r = await svc.getMine('ath-1');
    expect(r.team).toMatchObject({ id: 'team-1' });
    expect(r.plans[0]).toMatchObject({ id: 'plan-1', monthlyEquivalentInCents: 17400 });
    expect(r.access).toMatchObject({ active: false, banner: 'PAST_DUE', blocksTraining: false });
    expect(r.membership?.openInvoice).toMatchObject({ paymentId: 'p1', payPath: '/pedido/p1', overdue: true });
    expect(r.legacySubscription).toBeNull();
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled();

    prisma.athleteMembership.findFirst.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ id: 's', planType: 'MONTHLY', status: 'ACTIVE', provider: 'MERCADO_PAGO', currentPeriodEnd: new Date(Date.now() + 86400000), cancelAtPeriodEnd: false });
    const legacy = await svc.getMine('ath-1');
    expect(legacy.membership).toBeNull();
    expect(legacy.legacySubscription).toMatchObject({ provider: 'MERCADO_PAGO', status: 'ACTIVE' });
    expect(legacy.access.active).toBe(true);
  });

  it('exportCsv: ; separated, BOM, formula injection neutralized', async () => {
    const { svc, prisma } = setup();
    asMember(prisma, 'OWNER');
    prisma.athleteMembership.findMany.mockResolvedValue([
      { id: 'm1', status: 'ACTIVE', priceInCents: 17400, plan: { id: 'p', name: 'Mensal', interval: 'MONTHLY' }, athlete: { id: 'a', name: '=HYPERLINK("x")', email: 'a@x.com', athleteProfile: null }, nextDueDate: null, currentPeriodEnd: null, createdAt: new Date() },
    ]);
    const csv = await svc.exportCsv({ id: 'owner-1', role: 'COACH' }, {});
    expect(csv.startsWith('﻿Atleta;E-mail')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('174,00');
  });

  describe('markPaidOffline', () => {
    const active = { id: 'mem-1', teamId: 'team-1', athleteId: 'ath-1', status: 'PAST_DUE', provider: 'ASAAS', priceInCents: 17400, nextDueDate: new Date('2026-10-01T03:00:00Z'), plan, team };

    function offline() {
      const ctx = setup();
      ctx.prisma.athleteMembership.findFirst.mockResolvedValue(active);
      ctx.prisma.athleteMembership.findUnique = jest.fn().mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' });
      ctx.prisma.payment.findUnique = jest.fn(async ({ where }: any) => ({ id: where.id, amount: 17400, status: 'SUCCEEDED', provider: 'MANUAL', paidAt: new Date() }));
      ctx.checkout.markPaid = jest.fn().mockResolvedValue({ processed: true, outcome: 'FULFILLED' });
      ctx.asaas.cancelPayment = jest.fn().mockResolvedValue(true);
      ctx.prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      return ctx;
    }

    it('OWNER/ADMIN: MANUAL payment due on the open cycle, same markPaid path, open gateway charge closed, note in AuditLog', async () => {
      const { svc, prisma, checkout, asaas } = offline();
      asMember(prisma, 'ADMIN');
      const due = new Date('2026-10-01T03:00:00Z');
      prisma.payment.findFirst
        .mockResolvedValueOnce(null) // sem registro manual recente
        .mockResolvedValueOnce({ id: 'open-1', status: 'PENDING', provider: 'ASAAS', externalPaymentId: 'pay_x', expiresAt: due });
      const r = await svc.markPaidOffline({ id: 'adm', role: 'COACH' }, 'mem-1', { amountInCents: 17400, note: 'dinheiro no treino' });
      const data = prisma.payment.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ provider: 'MANUAL', purpose: 'MEMBERSHIP', membershipId: 'mem-1', teamId: 'team-1', amount: 17400, expiresAt: due });
      expect(checkout.markPaid).toHaveBeenCalledWith(data.id, 'MANUAL');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({ where: { id: 'open-1', status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'PAID_OFFLINE' } });
      expect(asaas.cancelPayment).toHaveBeenCalledWith('pay_x');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'MEMBERSHIP_PAID_OFFLINE', metadata: expect.objectContaining({ note: 'dinheiro no treino', paymentId: data.id }) }),
      });
      expect(r).toMatchObject({ created: true, outcome: 'FULFILLED', membership: { status: 'ACTIVE' } });
    });

    it('STAFF and COACH cannot register offline payments (403)', async () => {
      for (const role of ['STAFF', 'COACH']) {
        const { svc, prisma } = offline();
        asMember(prisma, role);
        await expect(svc.markPaidOffline({ id: 's', role: 'COACH' }, 'mem-1', { amountInCents: 17400 })).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.payment.create).not.toHaveBeenCalled();
      }
    });

    it('amount must equal the locked price; future date rejected', async () => {
      const { svc, prisma } = offline();
      asMember(prisma, 'OWNER');
      await expect(svc.markPaidOffline({ id: 'o', role: 'COACH' }, 'mem-1', { amountInCents: 10000 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.markPaidOffline({ id: 'o', role: 'COACH' }, 'mem-1', { amountInCents: 17400, paidAt: new Date(Date.now() + 86400000).toISOString() }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('idempotent: a repeat within 2 minutes returns the previous record', async () => {
      const { svc, prisma, checkout } = offline();
      asMember(prisma, 'OWNER');
      prisma.payment.findFirst.mockResolvedValueOnce({ id: 'man-1', amount: 17400, status: 'SUCCEEDED', provider: 'MANUAL' });
      const r = await svc.markPaidOffline({ id: 'o', role: 'COACH' }, 'mem-1', { amountInCents: 17400 });
      expect(r).toMatchObject({ created: false, payment: { id: 'man-1' } });
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(checkout.markPaid).not.toHaveBeenCalled();
    });

    it('canceled/paused membership → 409', async () => {
      const { svc, prisma } = offline();
      asMember(prisma, 'OWNER');
      prisma.athleteMembership.findFirst.mockResolvedValue({ ...active, status: 'CANCELED' });
      await expect(svc.markPaidOffline({ id: 'o', role: 'COACH' }, 'mem-1', { amountInCents: 17400 })).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
