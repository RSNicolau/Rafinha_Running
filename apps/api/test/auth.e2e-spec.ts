/**
 * E2E tests for /api/auth endpoints.
 *
 * Requires a running API + accessible database.
 * Set TEST_API_URL env var (default: http://localhost:3000).
 *
 * Run: npm run test:e2e
 */

import request from 'supertest';

const BASE = process.env.TEST_API_URL || 'http://localhost:3000';

// Unique email per run to avoid conflicts
const testEmail = `e2e_${Date.now()}@test.com`;
let accessToken: string;
let refreshToken: string;

describe('Auth E2E — /api/auth', () => {
  describe('POST /api/auth/register', () => {
    it('should create a new athlete account', async () => {
      const res = await request(BASE)
        .post('/api/auth/register')
        .send({ email: testEmail, password: 'Test12345!', name: 'E2E User' })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.role).toBe('ATHLETE');
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should return 409 for duplicate email', async () => {
      await request(BASE)
        .post('/api/auth/register')
        .send({ email: testEmail, password: 'Test12345!', name: 'Duplicate' })
        .expect(409);
    });

    it('should return 400 for missing required fields', async () => {
      await request(BASE)
        .post('/api/auth/register')
        .send({ email: 'only-email@test.com' })
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return tokens for valid credentials', async () => {
      const res = await request(BASE)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'Test12345!' })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.email).toBe(testEmail);
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should return 401 for wrong password', async () => {
      await request(BASE)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'WrongPassword!' })
        .expect(401);
    });

    it('should return 401 for unknown email', async () => {
      await request(BASE)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'Test12345!' })
        .expect(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return a new access token with valid refresh token', async () => {
      const res = await request(BASE)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      accessToken = res.body.accessToken;
    });

    it('should return 401 for invalid refresh token', async () => {
      await request(BASE)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid.token.here' })
        .expect(401);
    });
  });

  describe('GET /api/users/me', () => {
    it('should return current user with valid token', async () => {
      const res = await request(BASE)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(testEmail);
    });

    it('should return 401 without token', async () => {
      await request(BASE)
        .get('/api/users/me')
        .expect(401);
    });
  });
});
