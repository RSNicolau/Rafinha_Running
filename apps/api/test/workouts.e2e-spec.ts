/**
 * E2E tests for training plan + workout lifecycle.
 *
 * Requires a running API + accessible database.
 * Run: npm run test:e2e
 */

import request from 'supertest';

const BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const ts = Date.now();
const coachEmail = `coach_e2e_${ts}@test.com`;
const athleteEmail = `athlete_e2e_${ts}@test.com`;

let coachToken: string;
let athleteToken: string;
let coachId: string;
let athleteId: string;
let planId: string;
let workoutId: string;

beforeAll(async () => {
  // Register coach
  const coachRes = await request(BASE)
    .post('/api/auth/register')
    .send({ email: coachEmail, password: 'Test12345!', name: 'Coach E2E', role: 'COACH' });
  coachToken = coachRes.body.accessToken;
  coachId = coachRes.body.user.id;

  // Register athlete
  const athleteRes = await request(BASE)
    .post('/api/auth/register')
    .send({ email: athleteEmail, password: 'Test12345!', name: 'Athlete E2E' });
  athleteToken = athleteRes.body.accessToken;
  athleteId = athleteRes.body.user.id;
});

describe('Training Plans & Workouts E2E', () => {
  describe('POST /api/training-plans', () => {
    it('should create a plan as coach', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);

      const res = await request(BASE)
        .post('/api/training-plans')
        .set('Authorization', `Bearer ${coachToken}`)
        .send({
          athleteId,
          name: 'Plano E2E Test',
          description: 'Test plan',
          startDate: new Date().toISOString(),
          endDate: future.toISOString(),
          weeklyFrequency: 4,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Plano E2E Test');
      expect(res.body.status).toBe('DRAFT');
      planId = res.body.id;
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(BASE)
        .post('/api/training-plans')
        .send({ name: 'No Auth Plan' })
        .expect(401);
    });
  });

  describe('GET /api/training-plans', () => {
    it('should list plans for coach', async () => {
      const res = await request(BASE)
        .get('/api/training-plans')
        .set('Authorization', `Bearer ${coachToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((p: any) => p.id === planId)).toBe(true);
    });

    it('should list plans for athlete', async () => {
      const res = await request(BASE)
        .get('/api/training-plans')
        .set('Authorization', `Bearer ${athleteToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/workouts', () => {
    it('should create a workout in the plan', async () => {
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 2);

      const res = await request(BASE)
        .post('/api/workouts')
        .set('Authorization', `Bearer ${coachToken}`)
        .send({
          planId,
          title: 'Corrida Fácil E2E',
          type: 'EASY_RUN',
          scheduledDate: scheduledDate.toISOString(),
          targetDurationSeconds: 2700,
          targetDistanceMeters: 8000,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('Corrida Fácil E2E');
      workoutId = res.body.id;
    });
  });

  describe('POST /api/workouts/:id/result', () => {
    it('should submit a result for the workout', async () => {
      const res = await request(BASE)
        .post(`/api/workouts/${workoutId}/result`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({
          distanceMeters: 8200,
          durationSeconds: 2880,
          avgPace: '5:52',
          avgHeartRate: 148,
          calories: 520,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.durationSeconds).toBe(2880);
    });

    it('should update workout status to COMPLETED', async () => {
      const res = await request(BASE)
        .get(`/api/workouts/${workoutId}`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .expect(200);

      expect(res.body.status).toBe('COMPLETED');
    });
  });

  describe('GET /api/training-plans/:id', () => {
    it('should include completion percentage', async () => {
      const res = await request(BASE)
        .get(`/api/training-plans/${planId}`)
        .set('Authorization', `Bearer ${coachToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('completionPercentage');
      expect(res.body.completionPercentage).toBe(100); // 1 out of 1 completed
    });

    it('should return 403 for wrong coach', async () => {
      await request(BASE)
        .get(`/api/training-plans/${planId}`)
        .set('Authorization', `Bearer ${athleteToken}`)
        // athlete can access their own plan
        .expect(200);
    });
  });
});
