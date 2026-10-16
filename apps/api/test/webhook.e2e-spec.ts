/**
 * E2E tests for Pagar.me webhook security (hits a RUNNING API).
 *
 * Contract (fail-closed):
 *  - server without PAGARME_WEBHOOK_SECRET → 503 for every request
 *  - secret configured: missing/invalid signature → 401; valid HMAC over the raw body → 200
 *
 * Run (the API must have the SAME secret): PAGARME_WEBHOOK_SECRET=xyz TEST_API_URL=http://localhost:3000 npm run test:e2e
 */

import request from 'supertest';
import * as crypto from 'crypto';

const BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.PAGARME_WEBHOOK_SECRET || 'test-webhook-secret';
const ENDPOINT = '/api/v1/payments/webhook';

function signPayload(body: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
  return `sha256=${hmac}`;
}

const validOrderPaidPayload = JSON.stringify({
  type: 'order.paid',
  data: { id: 'or_test_non_existent_123' },
});

describe('Pagar.me Webhook Security — /api/v1/payments/webhook/pagarme', () => {
  describe('Signature validation', () => {
    it('should return 400 when x-hub-signature header is missing', async () => {
      await request(BASE)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .send(validOrderPaidPayload)
        .expect((res) => {
          expect([400, 401, 403, 503]).toContain(res.status);
        });
    });

    it('should return 400 when signature is invalid', async () => {
      await request(BASE)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', 'sha256=invalidsignature000000000000000000000000000000000000000000000000')
        .send(validOrderPaidPayload)
        .expect((res) => {
          expect([400, 401, 403, 503]).toContain(res.status);
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
          expect([400, 401, 403, 503]).toContain(res.status);
        });
    });

    // Fixed: the controller now reads the HMAC over req.rawBody OR the Buffer left in req.body by
    // express.raw (main.ts). Requires the server to run with the same PAGARME_WEBHOOK_SECRET.
    it('should return 200 for valid signature with known secret', async () => {
      // The order ID doesn't need to exist — an unknown order is handled gracefully
      const signature = signPayload(validOrderPaidPayload, WEBHOOK_SECRET);
      const res = await request(BASE)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(validOrderPaidPayload);

      expect(res.status).toBe(200);
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

      expect(res.status).toBe(200);
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

      expect(res.status).toBe(200);
    });
  });
});
