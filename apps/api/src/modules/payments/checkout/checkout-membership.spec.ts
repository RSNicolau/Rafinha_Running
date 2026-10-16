import { CheckoutService } from './checkout.service';
import { FulfillmentService } from './fulfillment.service';

const VALID_CPF = '529.982.247-25';

function setup() {
  const prisma: any = {
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ ...data, createdAt: new Date() })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    storeOrder: { findUnique: jest.fn(), updateMany: jest.fn() },
    eventRegistration: { findUnique: jest.fn(), updateMany: jest.fn() },
    platformPlan: { findUnique: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
    coachSubscription: { findUnique: jest.fn(), updateMany: jest.fn() },
    athleteMembership: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    teamMember: { findFirst: jest.fn().mockResolvedValue(null) },
    team: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const asaas: any = {
    isConfigured: true,
    findOrCreateCustomer: jest.fn().mockResolvedValue('cus_1'),
    createPayment: jest.fn().mockResolvedValue({ id: 'asaas_pay_1', status: 'PENDING', invoiceUrl: 'https://sandbox.asaas.com/i/abc' }),
    getPixQrCode: jest.fn().mockResolvedValue({ encodedImage: 'IMG', payload: '000201', expirationDate: '2026-10-15 23:59:59' }),
    getPayment: jest.fn(),
    cancelPayment: jest.fn().mockResolvedValue(true),
    verifyWebhookToken: jest.fn().mockReturnValue(true),
  };
  const stripe: any = {
    isConfigured: false,
    createCheckoutSession: jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://stripe/cs_1' }),
  };
  const fulfillment: any = {
    storeOrderPaid: jest.fn().mockResolvedValue({ outcome: 'FULFILLED' }),
    eventRegistrationPaid: jest.fn().mockResolvedValue({ outcome: 'FULFILLED' }),
    platformPlanPaid: jest.fn().mockResolvedValue({ outcome: 'FULFILLED' }),
    membershipPaid: jest.fn().mockResolvedValue({ outcome: 'FULFILLED' }),
  };
  const email: any = { sendMembershipPaid: jest.fn().mockResolvedValue(undefined), sendStoreOrderPaid: jest.fn() };
  const notifications: any = { createNotification: jest.fn().mockResolvedValue({}) };
  const svc = new CheckoutService(prisma, asaas, stripe, fulfillment, email, notifications);
  return { svc, prisma, asaas, stripe, fulfillment, email };
}

const membership = {
  id: 'mem-1',
  teamId: 'team-1',
  athleteId: 'ath-1',
  status: 'ACTIVE',
  priceInCents: 17400,
  externalSubscriptionId: 'sub_1',
  team: { graceDays: 5 },
};

function remote(over: Record<string, any> = {}) {
  return {
    id: 'pay_sub_1',
    status: 'PENDING',
    value: 174,
    subscription: 'sub_1',
    dueDate: '2026-10-10',
    invoiceUrl: 'https://sandbox.asaas.com/i/sub1',
    billingType: 'UNDEFINED',
    externalReference: 'mem-1',
    ...over,
  };
}

describe('CheckoutService — mensalidade (assinatura Asaas)', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, NODE_ENV: 'test' };
    delete process.env.PAYMENTS_FAKE_PROVIDER;
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('PAYMENT_CREATED of a subscription → creates a PENDING MEMBERSHIP payment with invoice + due date (gateway values)', async () => {
    const { svc, prisma, asaas } = setup();
    prisma.athleteMembership.findUnique.mockResolvedValue(membership);
    asaas.getPayment.mockResolvedValue(remote());
    prisma.payment.upsert.mockImplementation(async ({ create }: any) => ({ id: 'row-1', status: 'PENDING', failureReason: null, ...create }));
    const spy = jest.spyOn(svc, 'markPaid');

    const r = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_CREATED', payment: { id: 'pay_sub_1', subscription: 'sub_1', value: 9999 } });

    expect(prisma.athleteMembership.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { externalSubscriptionId: 'sub_1' } }));
    expect(asaas.getPayment).toHaveBeenCalledWith('pay_sub_1'); // não confia no corpo
    const create = prisma.payment.upsert.mock.calls[0][0].create;
    expect(create).toMatchObject({
      purpose: 'MEMBERSHIP',
      membershipId: 'mem-1',
      teamId: 'team-1',
      userId: 'ath-1',
      amount: 17400,
      provider: 'ASAAS',
      externalPaymentId: 'pay_sub_1',
      checkoutUrl: 'https://sandbox.asaas.com/i/sub1',
      status: 'PENDING',
      failureReason: null,
    });
    expect(create.expiresAt.toISOString()).toBe('2026-10-10T03:00:00.000Z');
    expect(r).toMatchObject({ action: 'none', status: 'PENDING' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('RECEIVED → markPaid (membership branch) and a redelivery is idempotent', async () => {
    const { svc, prisma, asaas, fulfillment } = setup();
    const row = { id: 'row-1', amount: 17400, purpose: 'MEMBERSHIP', membershipId: 'mem-1', provider: 'ASAAS', externalPaymentId: 'pay_sub_1', failureReason: null };
    prisma.payment.findFirst.mockResolvedValue(row);
    prisma.athleteMembership.findUnique.mockResolvedValue(membership);
    asaas.getPayment.mockResolvedValue(remote({ status: 'RECEIVED' }));
    prisma.payment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.payment.findUnique.mockResolvedValue(row);

    const a = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_sub_1' } });
    const b = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_sub_1' } });
    expect(a).toMatchObject({ action: 'paid', processed: true });
    expect(b).toMatchObject({ action: 'paid', processed: false });
    expect(fulfillment.membershipPaid).toHaveBeenCalledTimes(1);
    expect(fulfillment.storeOrderPaid).not.toHaveBeenCalled();
  });

  it('gateway value ≠ locked price → AMOUNT_MISMATCH, never activates', async () => {
    const { svc, prisma, asaas } = setup();
    prisma.athleteMembership.findUnique.mockResolvedValue(membership);
    asaas.getPayment.mockResolvedValue(remote({ status: 'RECEIVED', value: 1 }));
    prisma.payment.upsert.mockImplementation(async ({ create }: any) => ({ id: 'row-x', status: 'PENDING', ...create }));
    const spy = jest.spyOn(svc, 'markPaid');
    const r = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_sub_1', subscription: 'sub_1' } });
    expect(prisma.payment.upsert.mock.calls[0][0].create.failureReason).toBe('AMOUNT_MISMATCH');
    expect(r).toMatchObject({ ignored: 'amount-mismatch' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('known row whose gateway value changed → AMOUNT_MISMATCH flag', async () => {
    const { svc, prisma, asaas } = setup();
    prisma.payment.findFirst.mockResolvedValue({ id: 'row-1', amount: 17400, purpose: 'MEMBERSHIP', membershipId: 'mem-1', failureReason: null });
    prisma.athleteMembership.findUnique.mockResolvedValue(membership);
    asaas.getPayment.mockResolvedValue(remote({ status: 'CONFIRMED', value: 100 }));
    const r = await svc.handleAsaasWebhook('ok', { payment: { id: 'pay_sub_1' } });
    expect(r).toMatchObject({ ignored: 'amount-mismatch' });
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { failureReason: 'AMOUNT_MISMATCH' } });
  });

  it('payment of another subscription → REFERENCE_MISMATCH', async () => {
    const { svc, prisma, asaas } = setup();
    prisma.payment.findFirst.mockResolvedValue({ id: 'row-1', amount: 17400, purpose: 'MEMBERSHIP', membershipId: 'mem-1' });
    prisma.athleteMembership.findUnique.mockResolvedValue(membership);
    asaas.getPayment.mockResolvedValue(remote({ status: 'RECEIVED', subscription: 'sub_OTHER' }));
    await expect(svc.handleAsaasWebhook('ok', { payment: { id: 'pay_sub_1' } })).resolves.toMatchObject({ ignored: 'reference-mismatch' });
  });

  describe('OVERDUE', () => {
    const row = { id: 'row-1', amount: 17400, purpose: 'MEMBERSHIP', membershipId: 'mem-1', failureReason: null };

    it('within team grace → stays ACTIVE, charge flagged OVERDUE and NOT cancelled at the gateway', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-12T12:00:00-03:00'));
      const { svc, prisma, asaas } = setup();
      prisma.payment.findFirst.mockResolvedValue(row);
      prisma.athleteMembership.findUnique.mockResolvedValue(membership);
      asaas.getPayment.mockResolvedValue(remote({ status: 'OVERDUE', dueDate: '2026-10-10' }));
      const r = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_OVERDUE', payment: { id: 'pay_sub_1' } });
      expect(r).toMatchObject({ action: 'overdue', pastDue: false, inGrace: true });
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'row-1', status: 'PENDING' }, data: expect.objectContaining({ failureReason: 'OVERDUE' }) }),
      );
      expect(prisma.athleteMembership.updateMany).not.toHaveBeenCalled();
      expect(asaas.cancelPayment).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('after team grace → PAST_DUE (conditional on ACTIVE)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-16T08:00:00-03:00'));
      const { svc, prisma, asaas } = setup();
      prisma.payment.findFirst.mockResolvedValue(row);
      prisma.athleteMembership.findUnique.mockResolvedValue(membership);
      asaas.getPayment.mockResolvedValue(remote({ status: 'OVERDUE', dueDate: '2026-10-10' }));
      const r = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_OVERDUE', payment: { id: 'pay_sub_1' } });
      expect(r).toMatchObject({ action: 'overdue', pastDue: true });
      expect(prisma.athleteMembership.updateMany).toHaveBeenCalledWith({ where: { id: 'mem-1', status: 'ACTIVE' }, data: { status: 'PAST_DUE' } });
      expect(asaas.cancelPayment).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  it('REFUNDED → payment REFUNDED; membership status untouched (flag only)', async () => {
    const { svc, prisma, asaas } = setup();
    const row = { id: 'row-1', amount: 17400, purpose: 'MEMBERSHIP', membershipId: 'mem-1', failureReason: null };
    prisma.payment.findFirst.mockResolvedValue(row);
    prisma.payment.findUnique.mockResolvedValue(row);
    prisma.athleteMembership.findUnique.mockResolvedValue(membership);
    asaas.getPayment.mockResolvedValue(remote({ status: 'REFUNDED' }));
    const r = await svc.handleAsaasWebhook('ok', { payment: { id: 'pay_sub_1' } });
    expect(r).toMatchObject({ action: 'refunded', processed: true });
    expect(prisma.athleteMembership.updateMany).not.toHaveBeenCalled();
  });

  it('CHARGEBACK → flagged for review', async () => {
    const { svc, prisma, asaas } = setup();
    prisma.payment.findFirst.mockResolvedValue({ id: 'row-1', amount: 17400, purpose: 'MEMBERSHIP', membershipId: 'mem-1' });
    prisma.athleteMembership.findUnique.mockResolvedValue(membership);
    asaas.getPayment.mockResolvedValue(remote({ status: 'CHARGEBACK_REQUESTED' }));
    await expect(svc.handleAsaasWebhook('ok', { payment: { id: 'pay_sub_1' } })).resolves.toMatchObject({ action: 'chargeback' });
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { failureReason: 'CHARGEBACK' } });
  });

  it('getStatus of a MEMBERSHIP payment: reference MEMBERSHIP, due date separate from expiresAt', async () => {
    const { svc, prisma } = setup();
    const due = new Date('2026-10-15T03:00:00Z');
    prisma.payment.findUnique.mockResolvedValue({
      id: 'row-1', userId: 'ath-1', status: 'SUCCEEDED', purpose: 'MEMBERSHIP', membershipId: 'mem-1', provider: 'FAKE', amount: 17400, expiresAt: due,
    });
    prisma.athleteMembership.findUnique.mockResolvedValue({
      id: 'mem-1', status: 'ACTIVE', currentPeriodEnd: null, plan: { name: 'Mensal', interval: 'MONTHLY' }, team: { name: 'Equipe', slug: 'equipe' },
    });
    const s = await svc.getStatus('row-1', { userId: 'ath-1' });
    expect(s.reference).toMatchObject({ type: 'MEMBERSHIP', planName: 'Mensal', teamName: 'Equipe' });
    expect(s.expiresAt).toBeNull(); // não é prazo de reserva (sem contagem regressiva na tela /pedido)
    expect(s.dueDate).toEqual(due);
  });
});

describe('FulfillmentService.membershipPaid', () => {
  function tx(m: any) {
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
      athleteMembership: { findUnique: jest.fn().mockResolvedValue(m), update: jest.fn().mockResolvedValue({}) },
    } as any;
  }
  const svc = new FulfillmentService({} as any);
  const due = new Date('2026-10-15T03:00:00Z');

  it.each([
    ['MONTHLY', '2026-11-15T03:00:00.000Z'],
    ['QUARTERLY', '2027-01-15T03:00:00.000Z'],
    ['SEMIANNUAL', '2027-04-15T03:00:00.000Z'],
    ['ANNUAL', '2027-10-15T03:00:00.000Z'],
  ])('%s: ACTIVE with currentPeriodStart = dueDate and end/nextDueDate = dueDate + interval', async (interval, end) => {
    const t = tx({ id: 'm', status: 'PENDING', currentPeriodEnd: null, nextDueDate: due, plan: { interval } });
    const r = await svc.membershipPaid(t, { membershipId: 'm', expiresAt: due, amount: 100 });
    expect(r.outcome).toBe('FULFILLED');
    const data = t.athleteMembership.update.mock.calls[0][0].data;
    expect(data.status).toBe('ACTIVE');
    expect(data.currentPeriodStart).toEqual(due);
    expect(data.currentPeriodEnd.toISOString()).toBe(end);
    expect(data.nextDueDate.toISOString()).toBe(end);
    expect(t.$queryRaw).toHaveBeenCalled(); // lock da linha
  });

  it('an older (out-of-order) payment never moves the period back', async () => {
    const end = new Date('2026-12-15T03:00:00Z');
    const t = tx({ id: 'm', status: 'PAST_DUE', currentPeriodEnd: end, plan: { interval: 'MONTHLY' } });
    await svc.membershipPaid(t, { membershipId: 'm', expiresAt: new Date('2026-10-15T03:00:00Z'), amount: 100 });
    expect(t.athleteMembership.update.mock.calls[0][0].data).toEqual({ status: 'ACTIVE' });
  });

  it('CANCELED / PAUSED / unknown membership → NEEDS_REFUND (not reactivated)', async () => {
    for (const status of ['CANCELED', 'PAUSED']) {
      const t = tx({ id: 'm', status, plan: { interval: 'MONTHLY' } });
      expect((await svc.membershipPaid(t, { membershipId: 'm', expiresAt: due, amount: 1 })).outcome).toBe('NEEDS_REFUND');
      expect(t.athleteMembership.update).not.toHaveBeenCalled();
    }
    expect((await svc.membershipPaid(tx(null), { membershipId: 'm', amount: 1 })).outcome).toBe('NEEDS_REFUND');
  });

  it('fake-pay path: markPaid of a MEMBERSHIP payment activates once (real FulfillmentService, idempotent)', async () => {
    const pay: any = { id: 'p1', status: 'PENDING', purpose: 'MEMBERSHIP', membershipId: 'm', amount: 17400, expiresAt: due, provider: 'FAKE', userId: 'a' };
    const mem: any = { id: 'm', status: 'PENDING', currentPeriodEnd: null, nextDueDate: due, plan: { interval: 'MONTHLY' } };
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (!where.status.in.includes(pay.status)) return { count: 0 };
          Object.assign(pay, data);
          return { count: 1 };
        }),
        findUnique: jest.fn(async () => ({ ...pay })),
        update: jest.fn(),
      },
      athleteMembership: {
        findUnique: jest.fn(async () => ({ ...mem, plan: mem.plan, athlete: { id: 'a', email: null, name: 'A' }, team: { name: 'T' } })),
        update: jest.fn(async ({ data }: any) => Object.assign(mem, data)),
      },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    const email: any = { sendMembershipPaid: jest.fn() };
    const svc2 = new CheckoutService(prisma, {} as any, {} as any, new FulfillmentService(prisma), email, { createNotification: jest.fn().mockResolvedValue({}) } as any);
    const a = await svc2.markPaid('p1', 'FAKE');
    const b = await svc2.markPaid('p1', 'FAKE');
    expect(a).toMatchObject({ processed: true, outcome: 'FULFILLED' });
    expect(b).toMatchObject({ processed: false });
    expect(mem.status).toBe('ACTIVE');
    expect(mem.currentPeriodEnd.toISOString()).toBe('2026-11-15T03:00:00.000Z');
    expect(prisma.athleteMembership.update).toHaveBeenCalledTimes(1);
  });
});

describe('CheckoutService — split da equipe na loja / eventos', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, NODE_ENV: 'test' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  const order = () => ({
    id: 'order-1', athleteId: 'ath', accessTokenHash: null, status: 'PENDING_PAYMENT', createdAt: new Date(),
    expiresAt: new Date(Date.now() + 600000), finalInCents: 10000, totalInCents: 10000, discountInCents: 0, quantity: 1,
    product: { name: 'Camiseta', coachId: 'coach-1' },
  });

  it('STORE_ORDER: coach team with wallet → split (100 - fee)% and Payment.teamId', async () => {
    const { svc, prisma, asaas } = setup();
    prisma.storeOrder.findUnique.mockResolvedValue(order());
    prisma.teamMember.findFirst.mockResolvedValue({ team: { id: 'team-1', asaasWalletId: 'wal_team', platformFeePercent: 10, ownerId: 'o' } });
    await svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'order-1', userId: 'ath', buyer: { name: 'Maria', email: 'm@x.com', cpf: VALID_CPF } });
    expect(prisma.teamMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'coach-1' }) }));
    expect(prisma.payment.create.mock.calls[0][0].data.teamId).toBe('team-1');
    expect(asaas.createPayment.mock.calls[0][0].split).toEqual([{ walletId: 'wal_team', percentualValue: 90 }]);
  });

  it('team without wallet → no split (money stays with the platform) but teamId recorded', async () => {
    const { svc, prisma, asaas } = setup();
    prisma.storeOrder.findUnique.mockResolvedValue(order());
    prisma.team.findFirst.mockResolvedValue({ id: 'team-2', asaasWalletId: null, platformFeePercent: 10, ownerId: 'coach-1' });
    await svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'order-1', userId: 'ath', buyer: { name: 'Maria', email: 'm@x.com', cpf: VALID_CPF } });
    expect(prisma.payment.create.mock.calls[0][0].data.teamId).toBe('team-2');
    expect(asaas.createPayment.mock.calls[0][0].split).toBeUndefined();
  });

  it('EVENT_REGISTRATION: uses the event creator team', async () => {
    const { svc, prisma, asaas } = setup();
    prisma.eventRegistration.findUnique.mockResolvedValue({
      id: 'reg-1', userId: 'ath', status: 'PENDING', paymentExpiresAt: new Date(Date.now() + 600000), finalPrice: 8000, registeredAt: new Date(),
      event: { title: 'Corrida', createdById: 'org-1' },
    });
    prisma.teamMember.findFirst.mockResolvedValue({ team: { id: 'team-3', asaasWalletId: 'wal_3', platformFeePercent: 5, ownerId: 'org-1' } });
    await svc.createCheckout({ purpose: 'EVENT_REGISTRATION', refId: 'reg-1', userId: 'ath', buyer: { name: 'Maria', email: 'm@x.com', cpf: VALID_CPF } });
    expect(prisma.teamMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'org-1' }) }));
    expect(asaas.createPayment.mock.calls[0][0].split).toEqual([{ walletId: 'wal_3', percentualValue: 95 }]);
    expect(prisma.payment.create.mock.calls[0][0].data.teamId).toBe('team-3');
  });

  it('Stripe backup: no split (no Connect) but teamId is still recorded for manual payout', async () => {
    const { svc, prisma, asaas, stripe } = setup();
    stripe.isConfigured = true;
    prisma.storeOrder.findUnique.mockResolvedValue(order());
    prisma.teamMember.findFirst.mockResolvedValue({ team: { id: 'team-1', asaasWalletId: 'wal_team', platformFeePercent: 10 } });
    await svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'order-1', userId: 'ath', provider: 'STRIPE', buyer: { name: 'Maria', email: 'm@x.com', cpf: VALID_CPF } });
    expect(stripe.createCheckoutSession).toHaveBeenCalled();
    expect(asaas.createPayment).not.toHaveBeenCalled();
    expect(prisma.payment.create.mock.calls[0][0].data.teamId).toBe('team-1');
  });

  it('PLATFORM_PLAN never resolves a team (platform revenue)', async () => {
    const { svc, prisma, asaas } = setup();
    prisma.platformPlan.findUnique.mockResolvedValue({ type: 'PRO', name: 'Pro', priceInCents: 9900, isActive: true });
    await svc.createCheckout({ purpose: 'PLATFORM_PLAN', refId: 'PRO', userId: 'coach', buyer: { name: 'Coach', email: 'c@x.com', cpf: VALID_CPF } });
    expect(prisma.teamMember.findFirst).not.toHaveBeenCalled();
    expect(prisma.payment.create.mock.calls[0][0].data.teamId).toBeNull();
    expect(asaas.createPayment.mock.calls[0][0].split).toBeUndefined();
  });
});
