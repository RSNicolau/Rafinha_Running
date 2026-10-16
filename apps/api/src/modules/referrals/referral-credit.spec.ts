import { consumeCredit, creditCentsOf, planCredit, releaseCredit, reserveCredit, settleCreditReservations } from './referral-credit';
import { CheckoutService } from '../payments/checkout/checkout.service';
import { MembershipsService } from '../memberships/memberships.service';
import { TeamContextResolver } from '../memberships/team-context.resolver';
import { TeamContextService } from '../teams/team-context.service';

/** Prisma em memória: user.referralCreditCents, appConfig (com filtro JSON path) e payment.status. */
function memPrisma(balance = 5000) {
  const users: Record<string, any> = { ath: { id: 'ath', referralCreditCents: balance } };
  const configs = new Map<string, any>();
  const payments: Record<string, any> = {};
  const jsonMatch = (value: any, f: any) => !f || !f.path || value?.[f.path[0]] === f.equals;
  const whereMatch = (key: string, value: any, where: any) => {
    if (where.key && typeof where.key === 'string' && where.key !== key) return false;
    if (typeof where.key === 'object' && where.key?.startsWith && !key.startsWith(where.key.startsWith)) return false;
    if (where.value && !jsonMatch(value, where.value)) return false;
    for (const c of where.AND ?? []) if (!jsonMatch(value, c.value)) return false;
    return true;
  };
  const prisma: any = {
    users,
    payments,
    configs,
    user: {
      findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        users[where.id].referralCreditCents += data.referralCreditCents.increment ?? -(data.referralCreditCents.decrement ?? 0);
        return users[where.id];
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const u = users[where.id];
        if (!u || u.referralCreditCents < (where.referralCreditCents?.gte ?? 0)) return { count: 0 };
        u.referralCreditCents -= data.referralCreditCents.decrement;
        return { count: 1 };
      }),
    },
    appConfig: {
      findUnique: jest.fn(async ({ where }: any) => (configs.has(where.key) ? { key: where.key, value: configs.get(where.key) } : null)),
      findMany: jest.fn(async ({ where }: any) =>
        Array.from(configs.entries()).filter(([k, v]) => whereMatch(k, v, where)).map(([key, value]) => ({ key, value })),
      ),
      create: jest.fn(async ({ data }: any) => {
        if (configs.has(data.key)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        configs.set(data.key, data.value);
        return data;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const v = configs.get(where.key);
        if (v === undefined || !whereMatch(where.key, v, where)) return { count: 0 };
        configs.set(where.key, data.value);
        return { count: 1 };
      }),
    },
    payment: { findUnique: jest.fn(async ({ where }: any) => payments[where.id] ?? null) },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  return prisma;
}

describe('referral credit — reserva / consumo / devolução', () => {
  it('reserva debita o saldo; consumo é idempotente; nada volta', async () => {
    const p = memPrisma(5000);
    expect(await reserveCredit(p, 'ath', 'pay-1', 3000, 'STORE_ORDER:o1')).toBe(3000);
    expect(p.users.ath.referralCreditCents).toBe(2000);
    expect(await creditCentsOf(p, 'pay-1')).toBe(3000);
    expect(await consumeCredit(p, 'pay-1')).toBe(3000);
    expect(await consumeCredit(p, 'pay-1')).toBe(0);
    expect(await releaseCredit(p, 'pay-1')).toBe(0); // consumido não volta (só em estorno)
    expect(p.users.ath.referralCreditCents).toBe(2000);
  });

  it('saldo insuficiente → não reserva', async () => {
    const p = memPrisma(1000);
    expect(await reserveCredit(p, 'ath', 'pay-1', 3000, 'x')).toBe(0);
    expect(p.users.ath.referralCreditCents).toBe(1000);
  });

  it('falha → devolve uma única vez; estorno devolve o consumido', async () => {
    const p = memPrisma(5000);
    await reserveCredit(p, 'ath', 'pay-1', 5000, 'x');
    expect(await releaseCredit(p, 'pay-1')).toBe(5000);
    expect(await releaseCredit(p, 'pay-1')).toBe(0);
    expect(p.users.ath.referralCreditCents).toBe(5000);

    await reserveCredit(p, 'ath', 'pay-2', 2000, 'y');
    await consumeCredit(p, 'pay-2');
    expect(await releaseCredit(p, 'pay-2', { includeConsumed: true })).toBe(2000);
    expect(p.users.ath.referralCreditCents).toBe(5000);
  });

  it('pago depois de devolvido → re-debita se houver saldo', async () => {
    const p = memPrisma(5000);
    await reserveCredit(p, 'ath', 'pay-1', 3000, 'x');
    await releaseCredit(p, 'pay-1');
    expect(await consumeCredit(p, 'pay-1')).toBe(3000);
    expect(p.users.ath.referralCreditCents).toBe(2000);
  });

  it('settle: libera reservas de cobranças falhas/expiradas, consome as pagas, mantém as pendentes', async () => {
    const p = memPrisma(9000);
    await reserveCredit(p, 'ath', 'pf', 1000, 'a');
    await reserveCredit(p, 'ath', 'ps', 2000, 'b');
    await reserveCredit(p, 'ath', 'pp', 3000, 'c');
    p.payments.pf = { status: 'FAILED' };
    p.payments.ps = { status: 'SUCCEEDED' };
    p.payments.pp = { status: 'PENDING' };
    const pending = await settleCreditReservations(p, 'ath');
    expect(pending.map((r) => r.paymentId)).toEqual(['pp']);
    expect(p.users.ath.referralCreditCents).toBe(9000 - 6000 + 1000);
    expect(p.configs.get('credit_reservation:ps').state).toBe('CONSUMED');
  });

  it('planCredit: mínimo R$5; uma reserva por vez; mesmo item reaproveita o valor', async () => {
    const p = memPrisma(5000);
    expect((await planCredit(p, 'ath', 'STORE_ORDER:o1', 2000)).cents).toBe(1500);
    expect((await planCredit(p, 'ath', 'STORE_ORDER:o1', 500)).cents).toBe(0);
    expect((await planCredit(p, null, 'STORE_ORDER:o1', 9000)).cents).toBe(0);
    await reserveCredit(p, 'ath', 'pay-1', 1500, 'STORE_ORDER:o1');
    p.payments['pay-1'] = { status: 'PENDING' };
    expect(await planCredit(p, 'ath', 'STORE_ORDER:o1', 2000)).toEqual({ cents: 1500, pendingPaymentId: 'pay-1' });
    expect((await planCredit(p, 'ath', 'EVENT_REGISTRATION:r1', 9000)).cents).toBe(0);
  });
});

describe('CheckoutService — crédito na loja/eventos', () => {
  const VALID_CPF = '529.982.247-25';
  const OLD = process.env;
  beforeEach(() => {
    process.env = { ...OLD, NODE_ENV: 'test', PAYMENTS_FAKE_PROVIDER: 'true', JWT_SECRET: 's' };
    delete process.env.ASAAS_BASE_URL;
  });
  afterAll(() => {
    process.env = OLD;
  });

  function setup(balance = 5000) {
    const p = memPrisma(balance);
    const order = {
      id: 'o1', athleteId: 'ath', status: 'PENDING_PAYMENT', totalInCents: 12000, discountInCents: 0, finalInCents: 12000,
      quantity: 1, expiresAt: new Date(Date.now() + 600000), createdAt: new Date(), product: { name: 'Camisa', coachId: 'coach' },
    };
    p.storeOrder = { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn() };
    p.teamMember = { findFirst: jest.fn().mockResolvedValue(null) };
    p.team = { findFirst: jest.fn().mockResolvedValue(null) };
    p.payment.findFirst = jest.fn().mockResolvedValue(null);
    p.payment.create = jest.fn(async ({ data }: any) => {
      p.payments[data.id] = { ...data };
      return p.payments[data.id];
    });
    p.payment.update = jest.fn(async ({ where, data }: any) => Object.assign(p.payments[where.id], data));
    p.payment.updateMany = jest.fn(async ({ where, data }: any) => {
      const row = p.payments[where.id];
      const allowed = where.status?.in ?? [where.status];
      if (!row || !allowed.includes(row.status)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    });
    const fulfillment: any = { storeOrderPaid: jest.fn().mockResolvedValue({ outcome: 'FULFILLED' }) };
    const email: any = { sendStoreOrderPaid: jest.fn() };
    const svc = new CheckoutService(p, { isConfigured: false } as any, { isConfigured: false } as any, fulfillment, email, { createNotification: jest.fn() } as any);
    p.storeOrder.findUnique.mockResolvedValue(order);
    return { svc, p, fulfillment };
  }
  const buyer = { name: 'Ana Atleta', email: 'ana@x.com', cpf: VALID_CPF };

  it('abate o crédito, reserva na cobrança e devolve creditAppliedCents; markPaid consome e o fulfillment confere o valor cheio', async () => {
    const { svc, p, fulfillment } = setup(5000);
    const r = await svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'o1', buyer, userId: 'ath' });
    expect(r.creditAppliedCents).toBe(5000);
    expect(r.amountInCents).toBe(7000);
    expect(p.users.ath.referralCreditCents).toBe(0);

    // fulfillment só lê o pedido; devolve um pedido mínimo para afterPaid
    p.storeOrder.findUnique.mockResolvedValue({ id: 'o1', customerEmail: 'ana@x.com', customerName: 'Ana', quantity: 1, product: { name: 'Camisa' } });
    await svc.markPaid(r.paymentId, 'FAKE');
    expect(fulfillment.storeOrderPaid.mock.calls[0][3].amount).toBe(12000);
    expect(p.configs.get(`credit_reservation:${r.paymentId}`).state).toBe('CONSUMED');
  });

  it('useCredit=false não usa o crédito; cobrança que falha devolve o crédito', async () => {
    const off = setup(5000);
    const r0 = await off.svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'o1', buyer, userId: 'ath', useCredit: false });
    expect(r0.creditAppliedCents).toBe(0);
    expect(r0.amountInCents).toBe(12000);

    const { svc, p } = setup(3000);
    const r = await svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'o1', buyer, userId: 'ath' });
    expect(r.creditAppliedCents).toBe(3000);
    await svc.markFailed(r.paymentId, 'EXPIRED');
    expect(p.users.ath.referralCreditCents).toBe(3000);
  });
});

describe('MembershipsService.subscribe — saldo de crédito na 1ª cobrança', () => {
  const team = { id: 'team-1', name: 'Equipe RR', slug: 'rr', ownerId: 'o', logoUrl: null, asaasWalletId: 'wal', platformFeePercent: 10, graceDays: 5 };
  const plan = { id: 'plan-1', teamId: 'team-1', name: 'Mensal', interval: 'MONTHLY', priceInCents: 17400, isActive: true };
  const OLD = process.env;
  beforeEach(() => {
    process.env = { ...OLD, NODE_ENV: 'test', PAYMENTS_FAKE_PROVIDER: 'true', JWT_SECRET: 's' };
    delete process.env.ASAAS_BASE_URL;
  });
  afterAll(() => {
    process.env = OLD;
  });

  function setup(asaas: boolean) {
    const p = memPrisma(5000);
    Object.assign(p, {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1', coachId: 'c' }) },
      team: { findUnique: jest.fn().mockResolvedValue(team), findFirst: jest.fn().mockResolvedValue(null) },
      teamMember: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      teamPlan: { findFirst: jest.fn().mockResolvedValue(plan) },
      athleteMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: 'mem-1', externalSubscriptionId: null, ...data, plan, team })),
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, teamId: 'team-1', athleteId: 'ath', priceInCents: 17400, provider: asaas ? 'ASAAS' : 'FAKE', status: 'PENDING', ...data, plan, team })),
      },
      referral: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    p.payment.findFirst = jest.fn().mockResolvedValue(null);
    p.payment.findMany = jest.fn().mockResolvedValue([]);
    p.payment.count = jest.fn().mockResolvedValue(1);
    p.payment.create = jest.fn(async ({ data }: any) => ({ ...data }));
    p.payment.update = jest.fn(async ({ where, data }: any) => ({ id: where.id, provider: 'ASAAS', method: 'PIX', status: 'PENDING', ...data }));
    p.payment.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    p.user.findUnique = jest.fn(async ({ where }: any) => ({ ...p.users[where.id], asaasCustomerId: 'cus_1' }));
    const gw: any = {
      isConfigured: asaas,
      createSubscription: jest.fn().mockResolvedValue({ id: 'sub_1' }),
      createPayment: jest.fn().mockResolvedValue({ id: 'pay_av', invoiceUrl: 'u' }),
      getPixQrCode: jest.fn().mockResolvedValue(null),
      listSubscriptionPayments: jest.fn().mockResolvedValue([]),
      cancelSubscription: jest.fn().mockResolvedValue(undefined),
    };
    const resolver = new TeamContextResolver(p, new TeamContextService(p));
    const svc = new MembershipsService(p, gw, { upsertMembershipPayment: jest.fn() } as any, resolver, {} as any);
    return { svc, p, gw };
  }
  const buyer = { name: 'Ana Atleta', email: 'ana@x.com', cpf: '529.982.247-25' };

  it('Asaas: 1ª cobrança avulsa com (preço − saldo), crédito reservado nela, assinatura no ciclo seguinte', async () => {
    const { svc, p, gw } = setup(true);
    const r = await svc.subscribe({ id: 'ath' }, { planId: 'plan-1', billingType: 'PIX', buyer } as any);
    expect(r.creditAppliedCents).toBe(5000);
    expect(gw.createPayment.mock.calls[0][0].valueInCents).toBe(12400);
    expect(gw.createSubscription.mock.calls[0][0].valueInCents).toBe(17400);
    const paymentId = gw.createPayment.mock.calls[0][0].externalReference;
    expect(p.configs.get(`credit_reservation:${paymentId}`)).toMatchObject({ state: 'RESERVED', cents: 5000 });
    expect(p.users.ath.referralCreditCents).toBe(0);
  });

  it('FAKE: cobrança com o crédito abatido; useCredit=false → valor cheio', async () => {
    const { svc, p } = setup(false);
    const r = await svc.subscribe({ id: 'ath' }, { planId: 'plan-1', buyer } as any);
    expect(r.creditAppliedCents).toBe(5000);
    expect(p.payment.create.mock.calls[0][0].data.amount).toBe(12400);

    const off = setup(false);
    const r2 = await off.svc.subscribe({ id: 'ath' }, { planId: 'plan-1', buyer, useCredit: false } as any);
    expect(r2.creditAppliedCents).toBe(0);
    expect(off.p.payment.create.mock.calls[0][0].data.amount).toBe(17400);
  });

  it('gateway falha na cobrança avulsa → crédito devolvido', async () => {
    const { svc, p, gw } = setup(true);
    gw.createPayment.mockRejectedValue(new Error('gw'));
    await expect(svc.subscribe({ id: 'ath' }, { planId: 'plan-1', billingType: 'PIX', buyer } as any)).rejects.toThrow('gw');
    expect(p.users.ath.referralCreditCents).toBe(5000);
  });
});
