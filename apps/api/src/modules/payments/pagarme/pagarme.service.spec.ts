/**
 * Unit tests for PagarmeService
 *
 * Critical paths:
 *  - handleWebhook: signature validation (forge protection)
 *  - processWebhookEvent: order.paid atomicity (payment + subscription)
 *  - handleOrderPaid: $transaction ensures both records updated together
 */

import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { PagarmeService } from './pagarme.service';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Sentry mock (imported in service) ────────────────────────────────────────
jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  captureMessage:   jest.fn(),
}));

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockTx = {
  payment:      { update: jest.fn() },
  subscription: { update: jest.fn() },
};

const mockPrisma = {
  payment: {
    findFirst:    jest.fn(),
    update:       jest.fn(),
    updateMany:   jest.fn(),
  },
  subscription: {
    update: jest.fn(),
  },
  $transaction: jest.fn((fn: any) => fn(mockTx)),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-webhook-secret-32chars!!!!!';

function sign(payload: string, secret: string): string {
  const hex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${hex}`;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('PagarmeService', () => {
  let service: PagarmeService;

  beforeEach(async () => {
    process.env.PAGARME_API_KEY      = 'sk_test_xxx';
    process.env.PAGARME_WEBHOOK_SECRET = WEBHOOK_SECRET;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PagarmeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PagarmeService>(PagarmeService);
    jest.clearAllMocks();
    // Re-wire mockTx fns after clearAllMocks
    mockTx.payment.update      = jest.fn();
    mockTx.subscription.update = jest.fn();
    mockPrisma.$transaction     = jest.fn((fn: any) => fn(mockTx));
  });

  afterEach(() => {
    delete process.env.PAGARME_WEBHOOK_SECRET;
  });

  // ── handleWebhook ─────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    const payload = '{"type":"order.paid","data":{"id":"ord_123"}}';

    it('returns true for a valid HMAC-SHA256 signature', () => {
      const sig = sign(payload, WEBHOOK_SECRET);
      expect(service.handleWebhook(Buffer.from(payload), sig)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      expect(service.handleWebhook(Buffer.from(payload), 'sha256=deadbeef')).toBe(false);
    });

    it('returns false when signature header is empty', () => {
      expect(service.handleWebhook(Buffer.from(payload), '')).toBe(false);
    });

    it('accepts signature both with and without "sha256=" prefix', () => {
      const sigWithPrefix    = sign(payload, WEBHOOK_SECRET); // "sha256=<hex>"
      const sigWithoutPrefix = sigWithPrefix.slice(7);        // "<hex>" only

      // Service normalises both formats to raw hex before comparing
      expect(service.handleWebhook(Buffer.from(payload), sigWithPrefix)).toBe(true);
      expect(service.handleWebhook(Buffer.from(payload), sigWithoutPrefix)).toBe(true);
    });

    it('returns false when PAGARME_WEBHOOK_SECRET is not configured', () => {
      delete process.env.PAGARME_WEBHOOK_SECRET;
      const sig = sign(payload, WEBHOOK_SECRET);
      // Recreate service without the secret
      const svc = new PagarmeService(mockPrisma as any);
      expect(svc.handleWebhook(Buffer.from(payload), sig)).toBe(false);
    });

    it('rejects a forged order.paid payload', () => {
      const forgedPayload = '{"type":"order.paid","data":{"id":"fake_order"}}';
      const validSig      = sign(payload, WEBHOOK_SECRET); // signed for DIFFERENT payload
      expect(service.handleWebhook(Buffer.from(forgedPayload), validSig)).toBe(false);
    });

    it('accepts a string payload (not just Buffer)', () => {
      const sig = sign(payload, WEBHOOK_SECRET);
      expect(service.handleWebhook(payload, sig)).toBe(true);
    });
  });

  // ── processWebhookEvent ───────────────────────────────────────────────────

  describe('processWebhookEvent', () => {
    it('returns { received: true } for all event types', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 });

      const events = ['order.paid', 'order.payment_failed', 'charge.paid', 'unknown.event'];
      for (const type of events) {
        const result = await service.processWebhookEvent({ type, data: { id: 'x' } });
        expect(result).toEqual({ received: true });
      }
    });

    it('does nothing for order.paid when payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await service.processWebhookEvent({ type: 'order.paid', data: { id: 'ord_unknown' } });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── handleOrderPaid atomicity ─────────────────────────────────────────────

  describe('handleOrderPaid — $transaction atomicity', () => {
    const mockPayment = {
      id:                 'pay_1',
      userId:             'user_1',
      externalPaymentId:  'ord_1',
      subscriptionId:     'sub_1',
      status:             'PENDING',
    };

    it('updates payment AND subscription inside a single $transaction', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);

      await service.processWebhookEvent({ type: 'order.paid', data: { id: 'ord_1' } });

      // $transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      // payment.update called inside transaction
      expect(mockTx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay_1' },
          data:  expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );

      // subscription.update called inside same transaction
      expect(mockTx.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub_1' },
          data:  expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('updates payment even when subscriptionId is null', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        subscriptionId: null,
      });

      await service.processWebhookEvent({ type: 'order.paid', data: { id: 'ord_1' } });

      expect(mockTx.payment.update).toHaveBeenCalled();
      expect(mockTx.subscription.update).not.toHaveBeenCalled();
    });

    it('does NOT call $transaction if order ID is missing', async () => {
      await service.processWebhookEvent({ type: 'order.paid', data: {} });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── handleOrderFailed ─────────────────────────────────────────────────────

  describe('handleOrderFailed', () => {
    it('marks payment as FAILED', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({ id: 'pay_1', userId: 'u1', externalPaymentId: 'ord_f' });
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await service.processWebhookEvent({ type: 'order.payment_failed', data: { id: 'ord_f' } });

      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { externalPaymentId: 'ord_f' },
          data:  expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });
});
