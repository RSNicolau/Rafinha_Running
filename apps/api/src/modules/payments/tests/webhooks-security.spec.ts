/**
 * Fail-closed dos webhooks legados (Mercado Pago / Pagar.me) + valores de plano no servidor.
 * Instancia o controller diretamente com dependências mockadas.
 */
import * as crypto from 'crypto';
import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PaymentsController } from '../payments.controller';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import { PagarmeService } from '../pagarme/pagarme.service';
import { PlanPricingService } from '../plan-pricing.service';
import { StripeService } from '../stripe/stripe.service';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

function build() {
  const prisma: any = {
    payment: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'local-1' }), updateMany: jest.fn() },
    appConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    platformPlan: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  const mp = new MercadoPagoService(prisma, {} as any);
  jest.spyOn(mp, 'handleWebhook').mockResolvedValue({ received: true });
  const pagarme = new PagarmeService(prisma);
  jest.spyOn(pagarme, 'processWebhookEvent').mockResolvedValue({ received: true });
  jest.spyOn(pagarme, 'createCustomer').mockResolvedValue('cus_1');
  jest.spyOn(pagarme, 'createPixOrder').mockImplementation(async (_c, amount) => ({
    orderId: 'or_1', paymentId: 'ch_1', status: 'pending', pixQrCode: 'qr', pixQrCodeUrl: 'url', pixExpiresAt: new Date().toISOString(), amount,
  }));
  const stripe = new StripeService(prisma);
  const checkout: any = { handleStripeCheckoutEvent: jest.fn() };
  const pricing = new PlanPricingService(prisma);
  const ctrl = new PaymentsController({} as any, stripe, mp, pagarme, prisma, checkout, pricing);
  return { ctrl, mp, pagarme, prisma };
}

describe('Webhook security (fail-closed)', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    delete process.env.PAGARME_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('Mercado Pago', () => {
    const body = { type: 'payment', data: { id: '123456' } };
    const sign = (secret: string, dataId: string, reqId: string, ts = '1700000000') => {
      const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest('hex');
      return `ts=${ts},v1=${v1}`;
    };

    it('secret set + header missing → 401', async () => {
      process.env.MERCADO_PAGO_WEBHOOK_SECRET = 's3cret';
      const { ctrl, mp } = build();
      await expect(ctrl.mercadoPagoWebhook({} as any, undefined as any, 'req-1', '123456', body)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mp.handleWebhook).not.toHaveBeenCalled();
    });

    it('accepts the legacy env name MERCADOPAGO_WEBHOOK_SECRET too', async () => {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = 'legacy';
      const { ctrl, mp } = build();
      await expect(ctrl.mercadoPagoWebhook({} as any, 'ts=1,v1=bad', 'req-1', '123456', body)).rejects.toBeInstanceOf(UnauthorizedException);
      await ctrl.mercadoPagoWebhook({} as any, sign('legacy', '123456', 'req-1'), 'req-1', '123456', body);
      expect(mp.handleWebhook).toHaveBeenCalledTimes(1);
    });

    it('valid signature (manifest uses data.id, not request-id) → processed', async () => {
      process.env.MERCADO_PAGO_WEBHOOK_SECRET = 's3cret';
      const { ctrl, mp } = build();
      await ctrl.mercadoPagoWebhook({} as any, sign('s3cret', '123456', 'req-1'), 'req-1', '123456', body);
      expect(mp.handleWebhook).toHaveBeenCalledWith(body);
    });

    it('secret unset → accepted only to re-fetch from the MP API (handler ignores body data)', async () => {
      const { ctrl, mp } = build();
      await ctrl.mercadoPagoWebhook({} as any, undefined as any, undefined as any, undefined as any, body);
      expect(mp.handleWebhook).toHaveBeenCalled();
    });
  });

  describe('Pagar.me', () => {
    const payload = JSON.stringify({ type: 'order.paid', data: { id: 'or_1' } });
    const sig = (secret: string) => `sha256=${crypto.createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex')}`;

    it('secret unset → 503 (never accepts)', async () => {
      const { ctrl, pagarme } = build();
      await expect(ctrl.pagarmeWebhook({ body: Buffer.from(payload) } as any, sig('x'))).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(pagarme.processWebhookEvent).not.toHaveBeenCalled();
    });

    it('secret set + header missing → 401', async () => {
      process.env.PAGARME_WEBHOOK_SECRET = 'pg';
      const { ctrl } = build();
      await expect(ctrl.pagarmeWebhook({ body: Buffer.from(payload) } as any, undefined as any)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('invalid HMAC → 401', async () => {
      process.env.PAGARME_WEBHOOK_SECRET = 'pg';
      const { ctrl } = build();
      await expect(ctrl.pagarmeWebhook({ body: Buffer.from(payload) } as any, sig('wrong'))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('valid HMAC over the raw Buffer body (express.raw in main.ts) → processed with parsed JSON', async () => {
      process.env.PAGARME_WEBHOOK_SECRET = 'pg';
      const { ctrl, pagarme } = build();
      await ctrl.pagarmeWebhook({ body: Buffer.from(payload) } as any, sig('pg'));
      expect(pagarme.processWebhookEvent).toHaveBeenCalledWith({ type: 'order.paid', data: { id: 'or_1' } });
    });
  });

  describe('Stripe', () => {
    it('STRIPE_WEBHOOK_SECRET unset → 503', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_x';
      const { ctrl } = build();
      await expect(
        ctrl.stripeWebhook({ headers: { 'stripe-signature': 't=1,v1=x' }, rawBody: Buffer.from('{}') } as any),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('/payments/pix — amount derived server-side', () => {
    const user = { id: 'u1', name: 'Coach', email: 'c@c.com' };

    it('client-sent amount that differs from the plan price → 400', async () => {
      const { ctrl } = build();
      await expect(ctrl.createPixPayment(user, { planId: 'PRO', amount: 100 } as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('charges the plan price (PRO = 39700) and tags PLATFORM_PLAN', async () => {
      const { ctrl, pagarme, prisma } = build();
      const r = await ctrl.createPixPayment(user, { planId: 'PRO' } as any);
      expect(pagarme.createPixOrder).toHaveBeenCalledWith('cus_1', 39700, expect.any(String));
      expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 39700, planId: 'PRO', purpose: 'PLATFORM_PLAN' });
      expect(r.amount).toBe(39700);
    });

    it('uses the admin-configured athlete price (AppConfig "plans")', async () => {
      const { ctrl, pagarme, prisma } = build();
      prisma.appConfig.findUnique.mockResolvedValue({ value: { athlete: [{ id: 'MONTHLY', name: 'Mensal', price: 18900 }] } });
      await ctrl.createPixPayment(user, { planId: 'MONTHLY', amount: 18900 } as any);
      expect(pagarme.createPixOrder).toHaveBeenCalledWith('cus_1', 18900, expect.any(String));
      expect(prisma.payment.create.mock.calls[0][0].data.purpose).toBe('SUBSCRIPTION');
    });

    it('unknown plan → 400', async () => {
      const { ctrl } = build();
      await expect(ctrl.createPixPayment(user, { planId: 'GOLD' } as any)).rejects.toThrow('Plano inválido');
    });
  });

  describe('GET /payments/order/:id — Pagar.me polling (H1)', () => {
    it('delegates to the confirm path and never writes the payment status itself', async () => {
      const { ctrl, pagarme, prisma } = build();
      const pending = { id: 'pay_1', userId: 'u1', provider: 'PAGARME', externalPaymentId: 'or_1', status: 'PENDING', amount: 39700, createdAt: new Date() };
      prisma.payment.findFirst.mockResolvedValue(pending);
      prisma.payment.update = jest.fn();
      prisma.payment.findUnique = jest.fn().mockResolvedValue({ ...pending, status: 'SUCCEEDED', paidAt: new Date() });
      const sync = jest.spyOn(pagarme, 'syncOrderStatus').mockResolvedValue({ id: 'or_1', status: 'paid' });
      const r: any = await ctrl.getOrderStatus('u1', 'pay_1');
      expect(sync).toHaveBeenCalledWith(pending);
      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(r.dbStatus).toBe('SUCCEEDED');
    });

    it('does not poll (nor downgrade) an already confirmed payment', async () => {
      const { ctrl, pagarme, prisma } = build();
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay_1', userId: 'u1', provider: 'PAGARME', externalPaymentId: 'or_1', status: 'SUCCEEDED', amount: 1 });
      const sync = jest.spyOn(pagarme, 'syncOrderStatus');
      const r: any = await ctrl.getOrderStatus('u1', 'pay_1');
      expect(sync).not.toHaveBeenCalled();
      expect(r.status).toBe('SUCCEEDED');
    });
  });
});
