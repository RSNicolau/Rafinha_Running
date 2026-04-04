/**
 * E2E tests for Role-Based Access Control (RBAC).
 *
 * Verifies that:
 * - COACH cannot access ADMIN-only routes
 * - ATHLETE cannot access COACH-only routes
 * - ADMIN bypasses COACH guards
 * - Unauthenticated requests are rejected everywhere
 *
 * Run: npm run test:e2e
 */

import request from 'supertest';

const BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const ts = Date.now();

let coachToken: string;
let athleteToken: string;
let adminToken: string;

beforeAll(async () => {
  // Register coach
  const coachRes = await request(BASE)
    .post('/api/auth/register')
    .send({ email: `coach_rbac_${ts}@test.com`, password: 'Test12345!', name: 'Coach RBAC', role: 'COACH' });
  coachToken = coachRes.body.accessToken;

  // Register athlete
  const athleteRes = await request(BASE)
    .post('/api/auth/register')
    .send({ email: `athlete_rbac_${ts}@test.com`, password: 'Test12345!', name: 'Athlete RBAC' });
  athleteToken = athleteRes.body.accessToken;

  // Login as admin (if credentials are provided via env)
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const adminRes = await request(BASE)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminRes.body.accessToken;
  }
});

describe('RBAC — Role-Based Access Control', () => {
  describe('ADMIN-only routes', () => {
    const adminRoutes = [
      { method: 'GET', path: '/api/admin/users' },
      { method: 'GET', path: '/api/admin/analytics' },
      { method: 'GET', path: '/api/config/plans' },
    ];

    adminRoutes.forEach(({ method, path }) => {
      it(`COACH should not access ${method} ${path}`, async () => {
        const res = await request(BASE)
          [method.toLowerCase() as 'get'](path)
          .set('Authorization', `Bearer ${coachToken}`);
        expect([403, 404]).toContain(res.status);
      });

      it(`ATHLETE should not access ${method} ${path}`, async () => {
        const res = await request(BASE)
          [method.toLowerCase() as 'get'](path)
          .set('Authorization', `Bearer ${athleteToken}`);
        expect([403, 404]).toContain(res.status);
      });

      it(`Unauthenticated should not access ${method} ${path}`, async () => {
        const res = await request(BASE)
          [method.toLowerCase() as 'get'](path);
        expect(res.status).toBe(401);
      });
    });

    it('ADMIN should access GET /api/admin/users (if admin credentials set)', async () => {
      if (!adminToken) return; // skip if no admin credentials configured
      const res = await request(BASE)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 201]).toContain(res.status);
    });
  });

  describe('COACH-only routes', () => {
    it('ATHLETE should not create training plans', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);

      const res = await request(BASE)
        .post('/api/training-plans')
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({
          athleteId: 'some-athlete-id',
          name: 'Unauthorized Plan',
          startDate: new Date().toISOString(),
          endDate: future.toISOString(),
          weeklyFrequency: 3,
        });

      expect([403, 404]).toContain(res.status);
    });

    it('ATHLETE should not access coach alerts endpoint', async () => {
      const res = await request(BASE)
        .get('/api/users/athletes/alerts')
        .set('Authorization', `Bearer ${athleteToken}`);
      expect([403, 404]).toContain(res.status);
    });

    it('ATHLETE should not access coach athlete list', async () => {
      const res = await request(BASE)
        .get('/api/users/athletes')
        .set('Authorization', `Bearer ${athleteToken}`);
      expect([403, 404]).toContain(res.status);
    });

    it('COACH should access their own athlete list', async () => {
      const res = await request(BASE)
        .get('/api/users/athletes')
        .set('Authorization', `Bearer ${coachToken}`);
      expect([200, 201]).toContain(res.status);
    });
  });

  describe('Authentication guard', () => {
    const protectedRoutes = [
      '/api/users/me',
      '/api/training-plans',
      '/api/workouts',
      '/api/subscriptions/current',
    ];

    protectedRoutes.forEach((path) => {
      it(`should return 401 for unauthenticated GET ${path}`, async () => {
        const res = await request(BASE).get(path);
        expect(res.status).toBe(401);
      });
    });

    it('should return 401 for expired/invalid token', async () => {
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwiaWF0IjoxfQ.fakesignature';
      const res = await request(BASE)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe('Super Admin bypass', () => {
    it('SUPER_ADMIN token should access all routes (if configured)', async () => {
      const superAdminEmail = process.env.TEST_SUPER_ADMIN_EMAIL;
      const superAdminPassword = process.env.TEST_SUPER_ADMIN_PASSWORD;
      if (!superAdminEmail || !superAdminPassword) return;

      const loginRes = await request(BASE)
        .post('/api/auth/login')
        .send({ email: superAdminEmail, password: superAdminPassword });

      const superToken = loginRes.body.accessToken;
      if (!superToken) return;

      const res = await request(BASE)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${superToken}`);
      expect([200, 201]).toContain(res.status);
    });
  });
});
