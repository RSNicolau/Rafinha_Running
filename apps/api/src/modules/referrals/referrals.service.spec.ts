import { ReferralsService, firstMembershipDiscountCents } from './referrals.service';
import { CheckoutService } from '../payments/checkout/checkout.service';
import { MembershipsService } from '../memberships/memberships.service';
import { TeamContextResolver } from '../memberships/team-context.resolver';
import { TeamContextService } from '../teams/team-context.service';

function referralPrisma(referral: any) {
  const state = { referral: referral ? { ...referral } : null, credits: {} as Record<string, number> };
  const prisma: any = {
    referral: {
      findUnique: jest.fn(async () => (state.referral ? { ...state.referral } : null)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!state.referral || state.referral.id !== where.id || state.referral.status !== where.status) return { count: 0 };
        Object.assign(state.referral, data);
        return { count: 1 };
      }),
    },
    user: {
      update: jest.fn(async ({ where, data }: any) => {
        state.credits[where.id] = (state.credits[where.id] ?? 0) + (data.referralCreditCents?.increment ?? 0);
        return {};
      }),
    },
    payment: { count: jest.fn().mockResolvedValue(0) },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  return { prisma, state };
}

const PENDING = { id: 'ref-1', referrerId: 'referrer', refereeId: 'referee', status: 'PENDING', rewardCents: 5000, refereeRewardCents: 3000 };

describe('ReferralsService.creditOnFirstPayment', () => {
  it('PENDING → PAID: referrer +R$50, referee +R$30 credit (no discount applied)', async () => {
    const { prisma, state } = referralPrisma(PENDING);
    const svc = new ReferralsService(prisma);
    const r = await svc.creditOnFirstPayment('referee');
    expect(r?.status).toBe('PAID');
    expect(state.referral.status).toBe('PAID');
    expect(state.referral.paidAt).toBeInstanceOf(Date);
    expect(state.credits).toEqual({ referrer: 5000, referee: 3000 });
  });

  it('discount already applied on the 1st charge → referee gets no extra credit', async () => {
    const { prisma, state } = referralPrisma(PENDING);
    await new ReferralsService(prisma).creditOnFirstPayment('referee', { refereeDiscountApplied: true });
    expect(state.credits).toEqual({ referrer: 5000 });
  });

  it('idempotent: second call (or concurrent loser) credits nothing', async () => {
    const { prisma, state } = referralPrisma(PENDING);
    const svc = new ReferralsService(prisma);
    await svc.creditOnFirstPayment('referee');
    expect(await svc.creditOnFirstPayment('referee')).toBeNull();
    expect(state.credits).toEqual({ referrer: 5000, referee: 3000 });
  });

  it('lost race (updateMany count 0) → no credit', async () => {
    const { prisma, state } = referralPrisma(PENDING);
    prisma.referral.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await new ReferralsService(prisma).creditOnFirstPayment('referee')).toBeNull();
    expect(state.credits).toEqual({});
  });

  it('no referral → null', async () => {
    const { prisma } = referralPrisma(null);
    expect(await new ReferralsService(prisma).creditOnFirstPayment('referee')).toBeNull();
  });
});

describe('firstMembershipDiscountCents', () => {
  it('PENDING referral and no paid membership → R$30', async () => {
    const { prisma } = referralPrisma(PENDING);
    expect(await firstMembershipDiscountCents(prisma, 'referee', 49500)).toBe(3000);
  });
  it('already paid a membership before → 0', async () => {
    const { prisma } = referralPrisma(PENDING);
    prisma.payment.count.mockResolvedValue(1);
    expect(await firstMembershipDiscountCents(prisma, 'referee', 49500)).toBe(0);
  });
  it('referral already PAID → 0', async () => {
    const { prisma } = referralPrisma({ ...PENDING, status: 'PAID' });
    expect(await firstMembershipDiscountCents(prisma, 'referee', 49500)).toBe(0);
  });
  it('keeps the charge ≥ R$5 (Asaas minimum)', async () => {
    const { prisma } = referralPrisma(PENDING);
    expect(await firstMembershipDiscountCents(prisma, 'referee', 2000)).toBe(1500);
    expect(await firstMembershipDiscountCents(prisma, 'referee', 500)).toBe(0);
  });
});

describe('CheckoutService.markPaid — MEMBERSHIP credits the referral', () => {
  function setup(amount: number) {
    const payment = { id: 'pay-1', purpose: 'MEMBERSHIP', membershipId: 'mem-1', userId: 'referee', amount, storeOrderId: null, eventRegistrationId: null, planId: null };
    const prisma: any = {
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue(payment), update: jest.fn() },
      athleteMembership: { findUnique: jest.fn().mockResolvedValue({ id: 'mem-1', priceInCents: 49500, athlete: { id: 'referee', email: null, name: 'X' }, plan: { name: 'P' }, team: { name: 'T' } }) },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    const fulfillment: any = { membershipPaid: jest.fn().mockResolvedValue({ outcome: 'FULFILLED' }) };
    const referrals: any = { creditOnFirstPayment: jest.fn().mockResolvedValue({}) };
    const notifications: any = { createNotification: jest.fn().mockResolvedValue({}) };
    const svc = new CheckoutService(prisma, {} as any, {} as any, fulfillment, { sendMembershipPaid: jest.fn() } as any, notifications, referrals);
    return { svc, prisma, referrals, fulfillment };
  }

  it('full-price first payment → credit with refereeDiscountApplied=false', async () => {
    const { svc, referrals } = setup(49500);
    await svc.markPaid('pay-1', 'FAKE');
    expect(referrals.creditOnFirstPayment).toHaveBeenCalledWith('referee', { refereeDiscountApplied: false });
  });

  it('discounted first payment → refereeDiscountApplied=true', async () => {
    const { svc, referrals } = setup(46500);
    await svc.markPaid('pay-1', 'ASAAS');
    expect(referrals.creditOnFirstPayment).toHaveBeenCalledWith('referee', { refereeDiscountApplied: true });
  });

  it('already processed payment (idempotent markPaid) → no credit call', async () => {
    const { svc, prisma, referrals } = setup(49500);
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await svc.markPaid('pay-1', 'ASAAS');
    expect(referrals.creditOnFirstPayment).not.toHaveBeenCalled();
  });

  it('NEEDS_REFUND (canceled membership) → no credit', async () => {
    const { svc, fulfillment, referrals } = setup(49500);
    fulfillment.membershipPaid.mockResolvedValue({ outcome: 'NEEDS_REFUND' });
    await svc.markPaid('pay-1', 'ASAAS');
    expect(referrals.creditOnFirstPayment).not.toHaveBeenCalled();
  });

  it('referral failure never breaks the payment confirmation', async () => {
    const { svc, referrals } = setup(49500);
    referrals.creditOnFirstPayment.mockRejectedValue(new Error('db down'));
    await expect(svc.markPaid('pay-1', 'ASAAS')).resolves.toEqual({ processed: true, outcome: 'FULFILLED' });
  });
});

describe('MembershipsService.subscribe — referee discount on the 1st membership charge', () => {
  const team = { id: 'team-1', name: 'Equipe RR', slug: 'rr', ownerId: 'owner-1', logoUrl: null, asaasWalletId: 'wal_team', platformFeePercent: 10, graceDays: 5 };
  const plan = { id: 'plan-1', teamId: 'team-1', name: 'Trimestral', interval: 'QUARTERLY', priceInCents: 49500, isActive: true };
  const buyer = { name: 'Maria Atleta', email: 'maria@x.com', cpf: '529.982.247-25' };
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, NODE_ENV: 'test', JWT_SECRET: 'test-secret' };
    delete process.env.ASAAS_BASE_URL;
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  function setup(opts: { asaas: boolean }) {
    const prisma: any = {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1', coachId: 'coach-1' }) },
      team: { findUnique: jest.fn().mockResolvedValue(team), findFirst: jest.fn().mockResolvedValue(null) },
      teamMember: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      teamPlan: { findFirst: jest.fn().mockResolvedValue(plan) },
      athleteMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: 'mem-1', externalSubscriptionId: null, ...data, plan, team })),
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, teamId: 'team-1', athleteId: 'ath-1', priceInCents: 49500, provider: opts.asaas ? 'ASAAS' : 'FAKE', status: 'PENDING', ...data, plan, team })),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: any) => ({ ...data })),
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, provider: 'ASAAS', method: 'PIX', amount: 46500, status: 'PENDING', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      referral: { findUnique: jest.fn().mockResolvedValue({ status: 'PENDING', refereeRewardCents: 3000 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ asaasCustomerId: 'cus_1' }), update: jest.fn() },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    const asaas: any = {
      isConfigured: opts.asaas,
      findOrCreateCustomer: jest.fn().mockResolvedValue('cus_1'),
      createSubscription: jest.fn().mockResolvedValue({ id: 'sub_1' }),
      createPayment: jest.fn().mockResolvedValue({ id: 'pay_avulsa', invoiceUrl: 'https://asaas/i/av' }),
      listSubscriptionPayments: jest.fn().mockResolvedValue([]),
      getPixQrCode: jest.fn().mockResolvedValue({ encodedImage: 'IMG', payload: 'PIX' }),
      cancelSubscription: jest.fn().mockResolvedValue(undefined),
    };
    const checkout: any = { upsertMembershipPayment: jest.fn() };
    const resolver = new TeamContextResolver(prisma, new TeamContextService(prisma));
    const svc = new MembershipsService(prisma, asaas, checkout, resolver, {} as any);
    return { svc, prisma, asaas };
  }

  it('Asaas: 1st charge is a standalone payment (price − R$30, same split) and the subscription starts next cycle at full price', async () => {
    const { svc, prisma, asaas } = setup({ asaas: true });
    const res = await svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', billingType: 'PIX', buyer } as any);

    const sub = asaas.createSubscription.mock.calls[0][0];
    expect(sub.valueInCents).toBe(49500);
    expect(sub.split).toEqual([{ walletId: 'wal_team', percentualValue: 90 }]);
    const charge = asaas.createPayment.mock.calls[0][0];
    expect(charge.valueInCents).toBe(46500);
    expect(charge.split).toEqual(sub.split);
    // assinatura começa 3 meses (trimestral) depois da 1ª cobrança avulsa
    const first = new Date(`${charge.dueDate}T12:00:00Z`);
    const next = new Date(`${sub.nextDueDate}T12:00:00Z`);
    const months = (next.getUTCFullYear() - first.getUTCFullYear()) * 12 + next.getUTCMonth() - first.getUTCMonth();
    expect(months).toBe(3);

    const row = prisma.payment.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ purpose: 'MEMBERSHIP', membershipId: 'mem-1', amount: 46500, provider: 'ASAAS' });
    expect(charge.externalReference).toBe(row.id);
    expect(asaas.listSubscriptionPayments).not.toHaveBeenCalled();
    expect(res.referralDiscountCents).toBe(3000);
    expect(res.fullPriceInCents).toBe(49500);
  });

  it('standalone charge failure → subscription canceled at the gateway (no orphan)', async () => {
    const { svc, asaas } = setup({ asaas: true });
    asaas.createPayment.mockRejectedValue(new Error('gateway'));
    await expect(svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', billingType: 'PIX', buyer } as any)).rejects.toThrow('gateway');
    expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_1');
  });

  it('FAKE: first payment created with the discounted amount', async () => {
    process.env.PAYMENTS_FAKE_PROVIDER = 'true';
    const { svc, prisma } = setup({ asaas: false });
    const res = await svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', buyer } as any);
    expect(prisma.payment.create.mock.calls[0][0].data.amount).toBe(46500);
    expect(res.referralDiscountCents).toBe(3000);
  });

  it('no pending referral → normal subscription, no standalone charge', async () => {
    const { svc, prisma, asaas } = setup({ asaas: true });
    prisma.referral.findUnique.mockResolvedValue(null);
    await svc.subscribe({ id: 'ath-1' }, { planId: 'plan-1', billingType: 'PIX', buyer } as any);
    expect(asaas.createPayment).not.toHaveBeenCalled();
    expect(asaas.listSubscriptionPayments).toHaveBeenCalled();
  });
});
