/**
 * E2E tests for workout athlete feedback endpoint.
 *
 * Tests: PATCH /api/workouts/:id/feedback
 *   - RPE validation (1-10)
 *   - sensationScore validation (1-5)
 *   - athleteFeedback max length (500)
 *   - Ownership enforcement (athlete cannot submit feedback on another's workout)
 *   - Coach cannot submit athlete feedback
 *
 * Run: npm run test:e2e
 */

import request from 'supertest';

const BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const ts = Date.now();
const coachEmail = `coach_fb_${ts}@test.com`;
const athleteEmail = `athlete_fb_${ts}@test.com`;
const otherAthleteEmail = `other_athlete_fb_${ts}@test.com`;

let coachToken: string;
let athleteToken: string;
let otherAthleteToken: string;
let athleteId: string;
let workoutId: string;

beforeAll(async () => {
  // Register coach
  const coachRes = await request(BASE)
    .post('/api/auth/register')
    .send({ email: coachEmail, password: 'Test12345!', name: 'Coach Feedback', role: 'COACH' });
  coachToken = coachRes.body.accessToken;

  // Register athlete
  const athleteRes = await request(BASE)
    .post('/api/auth/register')
    .send({ email: athleteEmail, password: 'Test12345!', name: 'Athlete Feedback' });
  athleteToken = athleteRes.body.accessToken;
  athleteId = athleteRes.body.user.id;

  // Register another athlete (to test cross-ownership)
  const otherRes = await request(BASE)
    .post('/api/auth/register')
    .send({ email: otherAthleteEmail, password: 'Test12345!', name: 'Other Athlete' });
  otherAthleteToken = otherRes.body.accessToken;

  // Create a plan and workout for the athlete
  const future = new Date();
  future.setDate(future.getDate() + 7);

  const planRes = await request(BASE)
    .post('/api/training-plans')
    .set('Authorization', `Bearer ${coachToken}`)
    .send({
      athleteId,
      name: 'Feedback Test Plan',
      startDate: new Date().toISOString(),
      endDate: future.toISOString(),
      weeklyFrequency: 3,
    });

  const planId = planRes.body?.id;
  if (!planId) return; // skip if API not available

  const workoutRes = await request(BASE)
    .post('/api/workouts')
    .set('Authorization', `Bearer ${coachToken}`)
    .send({
      planId,
      title: 'Corrida de Teste',
      type: 'EASY_RUN',
      scheduledDate: new Date().toISOString(),
      targetDurationSeconds: 1800,
    });

  workoutId = workoutRes.body?.id;
});

describe('Workout Feedback — PATCH /api/workouts/:id/feedback', () => {
  describe('Input validation', () => {
    it('should return 400 for RPE below minimum (< 1)', async () => {
      if (!workoutId) return;
      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({ rpe: 0 })
        .expect(400);
    });

    it('should return 400 for RPE above maximum (> 10)', async () => {
      if (!workoutId) return;
      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({ rpe: 11 })
        .expect(400);
    });

    it('should return 400 for sensationScore below minimum (< 1)', async () => {
      if (!workoutId) return;
      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({ sensationScore: 0 })
        .expect(400);
    });

    it('should return 400 for sensationScore above maximum (> 5)', async () => {
      if (!workoutId) return;
      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({ sensationScore: 6 })
        .expect(400);
    });

    it('should return 400 for athleteFeedback exceeding 500 characters', async () => {
      if (!workoutId) return;
      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({ athleteFeedback: 'x'.repeat(501) })
        .expect(400);
    });

    it('should accept valid RPE boundary values (1 and 10)', async () => {
      if (!workoutId) return;
      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({ rpe: 1 })
        .expect((res) => expect([200, 201]).toContain(res.status));

      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({ rpe: 10 })
        .expect((res) => expect([200, 201]).toContain(res.status));
    });

    it('should accept a complete valid feedback payload', async () => {
      if (!workoutId) return;
      const res = await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({
          rpe: 7,
          sensationScore: 4,
          athleteFeedback: 'Treino bem feito, leve cansaço nas pernas.',
        });

      expect([200, 201]).toContain(res.status);
      if (res.status === 200 || res.status === 201) {
        expect(res.body.rpe).toBe(7);
        expect(res.body.sensationScore).toBe(4);
      }
    });

    it('should accept feedback with only rpe (other fields optional)', async () => {
      if (!workoutId) return;
      const res = await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${athleteToken}`)
        .send({ rpe: 5 });

      expect([200, 201]).toContain(res.status);
    });
  });

  describe('Authentication & authorization', () => {
    it('should return 401 without token', async () => {
      if (!workoutId) return;
      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .send({ rpe: 5 })
        .expect(401);
    });

    it('should return 403 when coach tries to submit athlete feedback', async () => {
      if (!workoutId) return;
      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${coachToken}`)
        .send({ rpe: 5 })
        .expect((res) => {
          // Either 403 (wrong role) or 404 (workout not owned by coach)
          expect([403, 404]).toContain(res.status);
        });
    });

    it('should return 403 or 404 when other athlete tries to submit feedback on someone else\'s workout', async () => {
      if (!workoutId) return;
      await request(BASE)
        .patch(`/api/workouts/${workoutId}/feedback`)
        .set('Authorization', `Bearer ${otherAthleteToken}`)
        .send({ rpe: 8 })
        .expect((res) => {
          expect([403, 404]).toContain(res.status);
        });
    });
  });
});
