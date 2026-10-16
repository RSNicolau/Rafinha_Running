import { NotFoundException, UnauthorizedException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CheckoutService, sha256, fakeProviderAllowed, derivedPaymentToken } from './checkout.service';
import { FulfillmentService } from './fulfillment.service';

const VALID_CPF = '529.982.247-25';

function setup() {
  const prisma: any = {
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    storeOrder: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    eventRegistration: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    platformPlan: { findUnique: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
    coachSubscription: { findUnique: jest.fn(), updateMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const asaas: any = {
    isConfigured: true,
    findOrCreateCustomer: jest.fn().mockResolvedValue('cus_1'),
    createPayment: jest.fn().mockResolvedValue({ id: 'asaas_pay_1', status: 'PENDING', invoiceUrl: 'https://sandbox.asaas.com/i/abc' }),
    getPixQrCode: jest.fn().mockResolvedValue({ encodedImage: 'IMG', payload: '00020126...', expirationDate: '2026-10-15 23:59:59' }),
    getPayment: jest.fn(),
    cancelPayment: jest.fn().mockResolvedValue(true),
    verifyWebhookToken: jest.fn().mockReturnValue(true),
  };
  const stripe: any = { isConfigured: false, createCheckoutSession: jest.fn(), retrieveCheckoutSession: jest.fn(), expireCheckoutSession: jest.fn() };
  const fulfillment: any = {
    storeOrderPaid: jest.fn().mockResolvedValue({ outcome: 'FULFILLED' }),
    eventRegistrationPaid: jest.fn().mockResolvedValue({ outcome: 'FULFILLED' }),
    platformPlanPaid: jest.fn().mockResolvedValue({ outcome: 'FULFILLED' }),
    releaseStoreOrder: jest.fn(),
    releaseEventRegistration: jest.fn(),
    promoteWaitlist: jest.fn().mockResolvedValue(null),
    refreshSoldOut: jest.fn(),
    lockEvent: jest.fn(),
    restockPaidOrder: jest.fn(),
  };
  const email: any = {
    sendStoreOrderPaid: jest.fn().mockResolvedValue(undefined),
    sendEventRegistrationConfirmed: jest.fn().mockResolvedValue(undefined),
    sendPlatformPlanActivated: jest.fn().mockResolvedValue(undefined),
    sendEventSpotAvailable: jest.fn().mockResolvedValue(undefined),
  };
  const notifications: any = { createNotification: jest.fn().mockResolvedValue({}) };
  const svc = new CheckoutService(prisma, asaas, stripe, fulfillment, email, notifications);
  return { svc, prisma, asaas, stripe, fulfillment, email };
}

describe('CheckoutService', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, NODE_ENV: 'test', APP_URL: 'http://192.168.0.10:3001' };
    delete process.env.PAYMENTS_FAKE_PROVIDER;
    delete process.env.PAYMENT_PROVIDER;
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  // ── Webhook Asaas ───────────────────────────────────────────────────────
  describe('handleAsaasWebhook', () => {
    const ours = { id: 'pay-uuid', amount: 15000, provider: 'ASAAS', externalPaymentId: 'asaas_1' };

    it('rejects an invalid/missing token (401) without touching the DB', async () => {
      const { svc, asaas, prisma } = setup();
      asaas.verifyWebhookToken.mockReturnValue(false);
      await expect(svc.handleAsaasWebhook('nope', { event: 'PAYMENT_RECEIVED', payment: { id: 'asaas_1' } })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    });

    it('ignores unknown payments (200)', async () => {
      const { svc, prisma } = setup();
      prisma.payment.findFirst.mockResolvedValue(null);
      await expect(svc.handleAsaasWebhook('ok', { event: 'PAYMENT_RECEIVED', payment: { id: 'x' } })).resolves.toMatchObject({ ignored: 'unknown-payment' });
    });

    it('does NOT trust the body: re-fetches and ignores a value mismatch', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.payment.findFirst.mockResolvedValue(ours);
      asaas.getPayment.mockResolvedValue({ id: 'asaas_1', status: 'RECEIVED', value: 1.0, externalReference: 'pay-uuid' });
      const spy = jest.spyOn(svc, 'markPaid');
      const r = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_RECEIVED', payment: { id: 'asaas_1', value: 150, status: 'RECEIVED' } });
      expect(asaas.getPayment).toHaveBeenCalledWith('asaas_1');
      expect(r).toMatchObject({ ignored: 'amount-mismatch' });
      expect(spy).not.toHaveBeenCalled();
      // M5: não some em silêncio — fica sinalizado para revisão (e 200 para o Asaas parar de reenviar)
      expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'pay-uuid' }, data: { failureReason: 'AMOUNT_MISMATCH' } });
    });

    it('ignores an externalReference mismatch', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.payment.findFirst.mockResolvedValue(ours);
      asaas.getPayment.mockResolvedValue({ id: 'asaas_1', status: 'RECEIVED', value: 150, externalReference: 'other' });
      await expect(svc.handleAsaasWebhook('ok', { payment: { id: 'asaas_1' } })).resolves.toMatchObject({ ignored: 'reference-mismatch' });
    });

    it('uses the gateway status, not the body status', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.payment.findFirst.mockResolvedValue(ours);
      asaas.getPayment.mockResolvedValue({ id: 'asaas_1', status: 'PENDING', value: 150, externalReference: 'pay-uuid' });
      const spy = jest.spyOn(svc, 'markPaid');
      const r = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_RECEIVED', payment: { id: 'asaas_1', status: 'RECEIVED' } });
      expect(r).toMatchObject({ action: 'none', status: 'PENDING' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('confirmed payment → markPaid; a redelivery is idempotent', async () => {
      const { svc, prisma, asaas, fulfillment } = setup();
      prisma.payment.findFirst.mockResolvedValue(ours);
      asaas.getPayment.mockResolvedValue({ id: 'asaas_1', status: 'CONFIRMED', value: 150, externalReference: 'pay-uuid' });
      prisma.payment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      prisma.payment.findUnique.mockResolvedValue({ ...ours, purpose: 'STORE_ORDER', storeOrderId: 'o1' });
      prisma.storeOrder.findUnique.mockResolvedValue(null);

      const first = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_CONFIRMED', payment: { id: 'asaas_1' } });
      const second = await svc.handleAsaasWebhook('ok', { event: 'PAYMENT_RECEIVED', payment: { id: 'asaas_1' } });
      expect(first).toMatchObject({ action: 'paid', processed: true });
      expect(second).toMatchObject({ action: 'paid', processed: false });
      expect(fulfillment.storeOrderPaid).toHaveBeenCalledTimes(1);
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-uuid', status: { in: ['PENDING', 'FAILED'] } } }),
      );
    });

    it('OVERDUE → markFailed and the charge is cancelled at Asaas (cannot be paid later)', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.payment.findFirst.mockResolvedValue(ours);
      asaas.getPayment.mockResolvedValue({ id: 'asaas_1', status: 'OVERDUE', value: 150, externalReference: 'pay-uuid' });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      await expect(svc.handleAsaasWebhook('ok', { payment: { id: 'asaas_1' } })).resolves.toMatchObject({ action: 'failed', processed: true });
      expect(asaas.cancelPayment).toHaveBeenCalledWith('asaas_1');
    });

    it('CHARGEBACK_* → flagged for review', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.payment.findFirst.mockResolvedValue(ours);
      asaas.getPayment.mockResolvedValue({ id: 'asaas_1', status: 'CHARGEBACK_REQUESTED', value: 150, externalReference: 'pay-uuid' });
      await expect(svc.handleAsaasWebhook('ok', { payment: { id: 'asaas_1' } })).resolves.toMatchObject({ action: 'chargeback' });
      expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'pay-uuid' }, data: { failureReason: 'CHARGEBACK' } });
    });
  });

  // ── markPaid ────────────────────────────────────────────────────────────
  describe('markPaid', () => {
    it('event registration paid → fulfillment + confirmation e-mail with bib', async () => {
      const { svc, prisma, fulfillment, email } = setup();
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.findUnique.mockResolvedValue({ id: 'p', purpose: 'EVENT_REGISTRATION', eventRegistrationId: 'r1', amount: 9000, externalPaymentId: 'ext' });
      prisma.eventRegistration.findUnique.mockResolvedValue({
        id: 'r1', bibNumber: '0042', user: { id: 'u1', email: 'a@a.com', name: 'Ana' },
        event: { id: 'e1', title: 'Corrida', eventDate: new Date(), kitPickupLocation: null, kitPickupDate: null }, distance: { name: '10K' },
      });
      const r = await svc.markPaid('p', 'ASAAS');
      expect(r).toEqual({ processed: true, outcome: 'FULFILLED' });
      expect(fulfillment.eventRegistrationPaid).toHaveBeenCalledWith(prisma, 'r1', expect.any(Date), 'ext', expect.objectContaining({ amount: 9000 }));
      expect(email.sendEventRegistrationConfirmed).toHaveBeenCalledWith('a@a.com', expect.objectContaining({ bibNumber: '0042', amountPaidInCents: 9000 }));
    });

    it('flags NEEDS_REFUND when the item was already paid by another payment', async () => {
      const { svc, prisma, fulfillment } = setup();
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.findUnique.mockResolvedValue({ id: 'p', purpose: 'STORE_ORDER', storeOrderId: 'o1', amount: 100 });
      fulfillment.storeOrderPaid.mockResolvedValue({ outcome: 'ALREADY' });
      const r = await svc.markPaid('p', 'ASAAS');
      expect(r.outcome).toBe('NEEDS_REFUND');
      expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { failureReason: 'NEEDS_REFUND' } });
    });
  });

  // ── createCheckout ──────────────────────────────────────────────────────
  describe('createCheckout', () => {
    const order = {
      id: 'order-1', athleteId: null, accessTokenHash: sha256('tok'), status: 'PENDING_PAYMENT',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), finalInCents: 8990, totalInCents: 9990, discountInCents: 1000,
      quantity: 1, product: { name: 'Camisa Oficial' },
    };

    it('store order: amount ALWAYS from the order (server-side) and Asaas charge references our payment id', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.storeOrder.findUnique.mockResolvedValue(order);
      prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
      prisma.payment.update.mockImplementation(({ data }: any) => ({ id: 'pay-1', provider: 'ASAAS', method: 'PIX', amount: 8990, status: 'PENDING', ...data }));

      const r = await svc.createCheckout({
        purpose: 'STORE_ORDER', refId: 'order-1', refToken: 'tok', buyer: { name: 'Maria Silva', email: 'M@X.com', cpf: VALID_CPF },
      });
      expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 8990, purpose: 'STORE_ORDER', storeOrderId: 'order-1', provider: 'ASAAS', method: 'PIX' });
      expect(asaas.findOrCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ cpfCnpj: '52998224725', email: 'm@x.com' }));
      expect(asaas.createPayment).toHaveBeenCalledWith(expect.objectContaining({ valueInCents: 8990, externalReference: 'pay-1', billingType: 'PIX' }));
      expect(r.pix).toEqual({ qrCodeBase64: 'data:image/png;base64,IMG', copyPaste: '00020126...', expiresAt: expect.any(String) });
      expect(r.checkoutUrl).toBe('https://sandbox.asaas.com/i/abc');
      expect(r.accessToken).toEqual(expect.any(String));
      // só o hash do token vai para o banco
      expect(prisma.payment.create.mock.calls[0][0].data.accessTokenHash).toBe(sha256(r.accessToken));
    });

    it('store order without the order token (and not the owner) → 404', async () => {
      const { svc, prisma } = setup();
      prisma.storeOrder.findUnique.mockResolvedValue(order);
      await expect(
        svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'order-1', refToken: 'wrong', buyer: { name: 'Maria', email: 'm@x.com', cpf: VALID_CPF } }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects invalid CPF (check digits validated server-side)', async () => {
      const { svc } = setup();
      await expect(
        svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'order-1', refToken: 'tok', buyer: { name: 'Maria', email: 'm@x.com', cpf: '529.982.247-24' } }),
      ).rejects.toThrow('CPF inválido');
    });

    it('event registration requires login', async () => {
      const { svc } = setup();
      await expect(
        svc.createCheckout({ purpose: 'EVENT_REGISTRATION', refId: 'r1', buyer: { name: 'Maria', email: 'm@x.com', cpf: VALID_CPF } }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('marks the payment FAILED when the gateway errors', async () => {
      const { svc, prisma, asaas } = setup();
      prisma.storeOrder.findUnique.mockResolvedValue(order);
      prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
      prisma.payment.update.mockResolvedValue({});
      asaas.createPayment.mockRejectedValue(new Error('boom'));
      await expect(
        svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'order-1', refToken: 'tok', buyer: { name: 'Maria', email: 'm@x.com', cpf: VALID_CPF } }),
      ).rejects.toThrow('boom');
      expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'pay-1' }, data: { status: 'FAILED', failureReason: 'GATEWAY_ERROR' } });
    });
  });

  // ── Provedor FAKE ───────────────────────────────────────────────────────
  describe('FAKE provider', () => {
    it('is selected only outside production with PAYMENTS_FAKE_PROVIDER=true', () => {
      const { svc, asaas } = setup();
      asaas.isConfigured = false;
      process.env.PAYMENTS_FAKE_PROVIDER = 'true';
      expect(svc.selectProvider()).toBe('FAKE');
    });

    it('is impossible in production even with the flag', async () => {
      const { svc, asaas, prisma } = setup();
      asaas.isConfigured = false;
      process.env.PAYMENTS_FAKE_PROVIDER = 'true';
      process.env.NODE_ENV = 'production';
      expect(fakeProviderAllowed()).toBe(false);
      expect(() => svc.selectProvider()).toThrow(ServiceUnavailableException);
      await expect(svc.fakePay('pay-1', { token: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('fake-pay requires access to the payment and the FAKE provider', async () => {
      const { svc, prisma } = setup();
      process.env.PAYMENTS_FAKE_PROVIDER = 'true';
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', provider: 'ASAAS', accessTokenHash: sha256('t'), userId: null });
      await expect(svc.fakePay('pay-1', { token: 'wrong' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.fakePay('pay-1', { token: 't' })).rejects.toThrow('provedor de testes');
    });

    it.each(['production', 'staging', '', 'prod'])('M3: blocked unless NODE_ENV is development/test (NODE_ENV=%s)', (env) => {
      process.env.PAYMENTS_FAKE_PROVIDER = 'true';
      process.env.NODE_ENV = env;
      expect(fakeProviderAllowed()).toBe(false);
    });

    it('M3: blocked when ASAAS_BASE_URL points to production Asaas, even in development', () => {
      process.env.PAYMENTS_FAKE_PROVIDER = 'true';
      process.env.NODE_ENV = 'development';
      process.env.ASAAS_BASE_URL = 'https://api.asaas.com/v3';
      expect(fakeProviderAllowed()).toBe(false);
      process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';
      expect(fakeProviderAllowed()).toBe(true);
      delete process.env.ASAAS_BASE_URL;
    });

    it('no gateway and no flag → 503', () => {
      const { svc, asaas } = setup();
      asaas.isConfigured = false;
      expect(() => svc.selectProvider()).toThrow('Nenhum gateway');
    });

    it('requested STRIPE without Stripe configured → 400', () => {
      const { svc } = setup();
      expect(() => svc.selectProvider('STRIPE')).toThrow(BadRequestException);
    });
  });

  // ── Status ──────────────────────────────────────────────────────────────
  describe('getStatus', () => {
    it('404 for a wrong token (does not reveal existence)', async () => {
      const { svc, prisma } = setup();
      prisma.payment.findUnique.mockResolvedValue({ id: 'p', userId: 'u1', accessTokenHash: sha256('right') });
      await expect(svc.getStatus('p', { token: 'wrong' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.getStatus('p', { userId: 'other' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('owner via JWT sees status and reconciles a pending Asaas charge (no webhook on LAN)', async () => {
      const { svc, prisma, asaas } = setup();
      const pending = { id: 'p', userId: 'u1', status: 'PENDING', provider: 'ASAAS', externalPaymentId: 'a1', amount: 5000, purpose: 'PLATFORM_PLAN', planId: 'PRO' };
      prisma.payment.findUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce({ ...pending, status: 'SUCCEEDED' });
      asaas.getPayment.mockResolvedValue({ id: 'a1', status: 'RECEIVED', value: 50, externalReference: 'p' });
      const spy = jest.spyOn(svc, 'markPaid').mockResolvedValue({ processed: true, outcome: 'FULFILLED' });
      const r = await svc.getStatus('p', { userId: 'u1' });
      expect(spy).toHaveBeenCalledWith('p', 'RECONCILE');
      expect(r.status).toBe('SUCCEEDED');
      expect(r.reference).toEqual({ type: 'PLATFORM_PLAN', planType: 'PRO' });
    });
  });

  // ── Expiração ───────────────────────────────────────────────────────────
  describe('expireStale', () => {
    it('releases stale orders/registrations, cancels charges at the gateway and promotes waitlist', async () => {
      const { svc, prisma, fulfillment, asaas, email } = setup();
      const now = new Date('2026-10-14T12:00:00Z');
      prisma.storeOrder.findMany.mockResolvedValue([{ id: 'o1' }]);
      fulfillment.releaseStoreOrder.mockResolvedValue({ released: true, closedPayments: [{ id: 'p1', provider: 'ASAAS', externalPaymentId: 'a1' }] });
      prisma.eventRegistration.findMany.mockResolvedValue([{ id: 'r1', eventId: 'e1' }]);
      fulfillment.releaseEventRegistration.mockResolvedValue({ previous: { eventId: 'e1' }, closedPayments: [{ id: 'p2', provider: 'ASAAS', externalPaymentId: 'a2' }] });
      fulfillment.promoteWaitlist.mockResolvedValue({ registration: { id: 'w1' }, requiresPayment: true });
      prisma.eventRegistration.findUnique.mockResolvedValue({
        id: 'w1', paymentExpiresAt: new Date(), event: { id: 'e1', title: 'Corrida' }, user: { email: 'w@w.com', name: 'W' },
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 2 });

      const r = await svc.expireStale(now);
      expect(r).toEqual({ orders: 1, registrations: 1, platformPayments: 2, promoted: 1 });
      expect(prisma.storeOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PENDING_PAYMENT', expiresAt: { lt: now } } }));
      expect(fulfillment.releaseStoreOrder).toHaveBeenCalledWith(prisma, 'o1', 'EXPIRED', now);
      expect(fulfillment.lockEvent).toHaveBeenCalledWith(prisma, 'e1');
      expect(asaas.cancelPayment).toHaveBeenCalledWith('a1');
      expect(asaas.cancelPayment).toHaveBeenCalledWith('a2');
      expect(email.sendEventSpotAvailable).toHaveBeenCalledWith('w@w.com', expect.objectContaining({ eventId: 'e1' }));
    });
  });

  // ── H2: dois pagamentos do mesmo pedido (FulfillmentService real) ───────
  describe('H2 — two successful payments for the same store order', () => {
    it('first fulfills (stock decremented once); the second gets NEEDS_REFUND', async () => {
      const order: any = {
        id: 'o1', productId: 'p1', quantity: 2, status: 'PENDING_PAYMENT', isPreOrder: false,
        finalInCents: 5000, totalInCents: 5000, discountInCents: 0, cancelReason: null,
      };
      const payments: Record<string, any> = {
        A: { id: 'A', status: 'PENDING', purpose: 'STORE_ORDER', storeOrderId: 'o1', amount: 5000, createdAt: new Date() },
        B: { id: 'B', status: 'PENDING', purpose: 'STORE_ORDER', storeOrderId: 'o1', amount: 5000, createdAt: new Date() },
      };
      const stock = { totalStock: 10, reserved: 2 };
      const prisma: any = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: jest.fn(),
        payment: {
          updateMany: jest.fn(async ({ where, data }: any) => {
            const p = payments[where.id];
            if (!where.status.in.includes(p.status)) return { count: 0 };
            Object.assign(p, data);
            return { count: 1 };
          }),
          findUnique: jest.fn(async ({ where }: any) => payments[where.id]),
          update: jest.fn(async ({ where, data }: any) => Object.assign(payments[where.id], data)),
        },
        storeOrder: {
          findUnique: jest.fn(async () => ({ ...order, product: { name: 'X', estimatedDelivery: null } })),
          updateMany: jest.fn(async ({ where, data }: any) => {
            if (order.status !== where.status) return { count: 0 };
            Object.assign(order, data);
            return { count: 1 };
          }),
        },
        product: {
          update: jest.fn(async ({ data }: any) => {
            stock.totalStock -= data.totalStock.decrement;
            stock.reserved -= data.reserved.decrement;
          }),
        },
      };
      prisma.$transaction = jest.fn((fn: any) => fn(prisma));
      const fulfillment = new FulfillmentService(prisma);
      const email: any = { sendStoreOrderPaid: jest.fn().mockResolvedValue(undefined) };
      const svc = new CheckoutService(prisma, {} as any, {} as any, fulfillment, email, { createNotification: jest.fn() } as any);

      const [a, b] = await Promise.all([svc.markPaid('A', 'ASAAS'), svc.markPaid('B', 'ASAAS')]);
      expect([a.outcome, b.outcome].sort()).toEqual(['FULFILLED', 'NEEDS_REFUND']);
      expect(stock).toEqual({ totalStock: 8, reserved: 0 }); // baixado UMA vez, reserved nunca negativo
      expect(prisma.product.update).toHaveBeenCalledTimes(1);
      const loser = a.outcome === 'NEEDS_REFUND' ? payments.A : payments.B;
      expect(loser.failureReason).toBe('NEEDS_REFUND');
    });
  });

  // ── Token de status estável no reaproveitamento ─────────────────────────
  describe('reuse keeps previously issued status tokens valid', () => {
    it('returns the same derived token instead of rotating the hash', async () => {
      process.env.JWT_SECRET = 'test-secret';
      const { svc, prisma } = setup();
      const order = {
        id: 'order-1', athleteId: null, accessTokenHash: sha256('tok'), status: 'PENDING_PAYMENT', createdAt: new Date(),
        expiresAt: new Date(Date.now() + 600000), finalInCents: 8990, totalInCents: 8990, discountInCents: 0, quantity: 1, product: { name: 'C' },
      };
      prisma.storeOrder.findUnique.mockResolvedValue(order);
      const existingToken = derivedPaymentToken('pay-old')!;
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-old', provider: 'ASAAS', method: 'PIX', amount: 8990, status: 'PENDING', accessTokenHash: sha256(existingToken) });
      const r = await svc.createCheckout({ purpose: 'STORE_ORDER', refId: 'order-1', refToken: 'tok', buyer: { name: 'Maria', email: 'm@x.com', cpf: VALID_CPF } });
      expect(r.paymentId).toBe('pay-old');
      expect(r.accessToken).toBe(existingToken);
      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.payment.create).not.toHaveBeenCalled();
      delete process.env.JWT_SECRET;
    });
  });
});
