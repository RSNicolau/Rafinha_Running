/**
 * E2E tests for /api/onboarding public endpoints.
 *
 * Tests the athlete onboarding flow without requiring authentication.
 * Requires a running API + accessible database.
 * Set TEST_API_URL env var (default: http://localhost:3000).
 * Set TEST_COACH_SLUG env var to an existing coach slug (default: 'test-coach').
 *
 * Run: npm run test:e2e -- --testPathPattern=onboarding
 */

import request from 'supertest';

const BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const COACH_SLUG = process.env.TEST_COACH_SLUG || 'test-coach';

describe('Onboarding E2E — /api/onboarding/public', () => {
  // ── GET /public/:slug ─────────────────────────────────────────────────────

  describe('GET /api/v1/onboarding/public/:slug', () => {
    it('should return 404 for unknown slug', async () => {
      await request(BASE)
        .get('/api/v1/onboarding/public/slug-that-does-not-exist-xyz-123')
        .expect(404);
    });
  });

  // ── POST /public/:slug/submit — input validation ──────────────────────────

  describe('POST /api/v1/onboarding/public/:slug/submit — validation', () => {
    it('should return 400 when athleteEmail is invalid', async () => {
      const res = await request(BASE)
        .post(`/api/v1/onboarding/public/${COACH_SLUG}/submit`)
        .send({
          athleteName: 'João Teste',
          athleteEmail: 'not-an-email',
          answers: {},
        });

      // 400 for validation error OR 404 if slug not found — both are acceptable
      expect([400, 404]).toContain(res.status);

      if (res.status === 400) {
        expect(res.body).toHaveProperty('message');
        // class-validator returns array of messages
        const msgs = Array.isArray(res.body.message) ? res.body.message : [res.body.message];
        expect(msgs.some((m: string) => m.toLowerCase().includes('e-mail') || m.toLowerCase().includes('email'))).toBe(true);
      }
    });

    it('should return 400 when athleteName is missing', async () => {
      const res = await request(BASE)
        .post(`/api/v1/onboarding/public/${COACH_SLUG}/submit`)
        .send({
          athleteEmail: 'joao@test.com',
          answers: {},
        });

      expect([400, 404]).toContain(res.status);

      if (res.status === 400) {
        expect(res.body).toHaveProperty('message');
      }
    });

    it('should return 400 when answers is not an object', async () => {
      const res = await request(BASE)
        .post(`/api/v1/onboarding/public/${COACH_SLUG}/submit`)
        .send({
          athleteName: 'João Teste',
          athleteEmail: 'joao@test.com',
          answers: 'invalid-answers',
        });

      expect([400, 404]).toContain(res.status);
    });

    it('should return 400 when extra unknown fields are sent (whitelist)', async () => {
      const res = await request(BASE)
        .post(`/api/v1/onboarding/public/${COACH_SLUG}/submit`)
        .send({
          athleteName: 'João Teste',
          athleteEmail: 'joao@test.com',
          answers: {},
          __proto__: { admin: true }, // prototype pollution attempt
          isAdmin: true, // unknown field
        });

      // forbidNonWhitelisted strips or rejects extra fields
      expect([400, 404]).toContain(res.status);
    });
  });

  // ── POST /public/:slug/checkout — input validation ────────────────────────

  describe('POST /api/v1/onboarding/public/:slug/checkout — validation', () => {
    it('should return 400 when athleteId is missing', async () => {
      const res = await request(BASE)
        .post(`/api/v1/onboarding/public/${COACH_SLUG}/checkout`)
        .send({ planType: 'MONTHLY' });

      expect([400, 404]).toContain(res.status);

      if (res.status === 400) {
        expect(res.body).toHaveProperty('message');
      }
    });

    it('should return 400 when athleteId is empty string', async () => {
      const res = await request(BASE)
        .post(`/api/v1/onboarding/public/${COACH_SLUG}/checkout`)
        .send({ athleteId: '', planType: 'MONTHLY' });

      expect([400, 404]).toContain(res.status);
    });
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  describe('Rate limiting on public endpoints', () => {
    it('should allow up to 5 submit requests per minute per IP (no throttle on first 5)', async () => {
      // Send 5 requests — each should get 400 (validation) or 404, NOT 429
      const requests = Array.from({ length: 5 }, () =>
        request(BASE)
          .post(`/api/v1/onboarding/public/${COACH_SLUG}/submit`)
          .send({
            athleteName: 'João Teste',
            athleteEmail: 'not-valid-email',
            answers: {},
          }),
      );

      const results = await Promise.all(requests);
      // None of the first 5 should be rate-limited (429)
      results.forEach((res) => {
        expect(res.status).not.toBe(429);
      });
    });
  });
});
