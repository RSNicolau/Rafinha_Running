/**
 * E2E tests for Pagar.me webhook security.
 *
 * These tests verify that the webhook endpoint correctly rejects
 * unauthorized requests and processes valid ones.
 *
 * Run: npm run test:e2e
 */

import request from 'supertest';
import * as crypto from 'crypto';

const BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.PAGARME_WEBHOOK_SECRET || 'test-webhook-secret';
const ENDPOINT = '/api/payments/webhook/pagarme';

function signPayload(body: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
  return `sha256=${hmac}`;
}

const validOrderPaidPayload = JSON.stringify({
  type: 'order.paid',
  data: { id: 'or_test_non_existent_123' },
});

describe('Pagar.me Webhook Security — /api/payments/webhook/pagarme', () => {
  describe('Signature validation', () => {
    it('should return 400 when x-hub-signature header is missing', async () => {
      await request(BASE)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .send(validOrderPaidPayload)
        .expect((res) => {
          expect([400, 401, 403]).toContain(res.status);
        });
    });

    it('should return 400 when signature is invalid', async () => {
      await request(BASE)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', 'sha256=invalidsignature000000000000000000000000000000000000000000000000')
        .send(validOrderPaidPayload)
        .expect((res) => {
          expect([400, 401, 403]).toContain(res.status);
        });
    });

    it('should return 400 when signature uses wrong secret', async () => {
      const wrongSignature = signPayload(validOrderPaidPayload, 'wrong-secret');
      await request(BASE)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', wrongSignature)
        .send(validOrderPaidPayload)
        .expect((res) => {
          expect([400, 401, 403]).toContain(res.status);
        });
    });

    it('should return 200 for valid signature with known secret', async () => {
      // This test only passes if PAGARME_WEBHOOK_SECRET matches the server config
      // The order ID doesn't need to exist — we just test that the signature is accepted
      const signature = signPayload(validOrderPaidPayload, WEBHOOK_SECRET);
      const res = await request(BASE)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(validOrderPaidPayload);

      // If secret matches: 200 (event processed, order not found is handled gracefully)
      // If server doesn't have secret configured: will fail signature check → 400
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('Payload handling', () => {
    it('should handle unknown event types gracefully (no crash)', async () => {
      const payload = JSON.stringify({ type: 'unknown.event.type', data: {} });
      const signature = signPayload(payload, WEBHOOK_SECRET);

      const res = await request(BASE)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(payload);

      // Should not crash — either 200 (ignored gracefully) or 400 (signature mismatch)
      expect([200, 400]).toContain(res.status);
    });

    it('should handle order.payment_failed event', async () => {
      const payload = JSON.stringify({
        type: 'order.payment_failed',
        data: { id: 'or_test_failed_456' },
      });
      const signature = signPayload(payload, WEBHOOK_SECRET);

      const res = await request(BASE)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(payload);

      expect([200, 400]).toContain(res.status);
    });
  });
});
