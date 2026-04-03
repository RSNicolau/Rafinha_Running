/**
 * E2E tests for /api/nutrition endpoints.
 *
 * Requires a running API + accessible database.
 * Run: npm run test:e2e
 */

import request from 'supertest';

const BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const testEmail = `nutrition_e2e_${Date.now()}@test.com`;
const today = new Date().toISOString().slice(0, 10);

let token: string;
let mealId: string;

beforeAll(async () => {
  const res = await request(BASE)
    .post('/api/auth/register')
    .send({ email: testEmail, password: 'Test12345!', name: 'Nutrition Tester' });
  token = res.body.accessToken;
});

describe('Nutrition E2E — /api/nutrition', () => {
  describe('GET /api/nutrition/day', () => {
    it('should return empty summary for a new user', async () => {
      const res = await request(BASE)
        .get(`/api/nutrition/day?date=${today}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('meals');
      expect(res.body).toHaveProperty('totals');
      expect(res.body).toHaveProperty('water');
      expect(res.body.meals).toHaveLength(0);
      expect(res.body.totals.calories).toBe(0);
      expect(res.body.water.amount).toBe(0);
    });

    it('should use today as default date', async () => {
      const res = await request(BASE)
        .get('/api/nutrition/day')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.date).toBe(today);
    });

    it('should return 401 without token', async () => {
      await request(BASE)
        .get('/api/nutrition/day')
        .expect(401);
    });
  });

  describe('POST /api/nutrition/meal', () => {
    it('should log a meal and return the record', async () => {
      const res = await request(BASE)
        .post('/api/nutrition/meal')
        .set('Authorization', `Bearer ${token}`)
        .send({
          date: today,
          mealName: 'Café da manhã',
          mealTime: '07:00',
          calories: 420,
          protein: 28,
          carbs: 45,
          fat: 12,
          items: ['Ovos mexidos', 'Pão integral', 'Café'],
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.mealName).toBe('Café da manhã');
      expect(res.body.calories).toBe(420);
      mealId = res.body.id;
    });

    it('should show the meal in day summary', async () => {
      const res = await request(BASE)
        .get(`/api/nutrition/day?date=${today}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.meals.length).toBeGreaterThan(0);
      expect(res.body.totals.calories).toBe(420);
      expect(res.body.totals.protein).toBe(28);
    });

    it('should return 400 for invalid data', async () => {
      await request(BASE)
        .post('/api/nutrition/meal')
        .set('Authorization', `Bearer ${token}`)
        .send({ mealName: 'No date' })
        .expect(400);
    });
  });

  describe('POST /api/nutrition/water', () => {
    it('should set water intake for the day', async () => {
      const res = await request(BASE)
        .post('/api/nutrition/water')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: today, amount: 1500 })
        .expect(201);

      expect(res.body.amount).toBe(1500);
      expect(res.body.goal).toBe(3000);
    });

    it('should update water intake (upsert)', async () => {
      const res = await request(BASE)
        .post('/api/nutrition/water')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: today, amount: 2200 })
        .expect(201);

      expect(res.body.amount).toBe(2200);
    });

    it('should reflect updated water in day summary', async () => {
      const res = await request(BASE)
        .get(`/api/nutrition/day?date=${today}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.water.amount).toBe(2200);
    });
  });

  describe('GET /api/nutrition/week', () => {
    it('should return 7 days of history', async () => {
      const res = await request(BASE)
        .get('/api/nutrition/week')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveLength(7);
      res.body.forEach((day: any) => {
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('calories');
        expect(day).toHaveProperty('water');
      });
    });
  });

  describe('DELETE /api/nutrition/meal/:id', () => {
    it('should delete meal belonging to user', async () => {
      await request(BASE)
        .delete(`/api/nutrition/meal/${mealId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should return 404 for non-existent meal', async () => {
      await request(BASE)
        .delete('/api/nutrition/meal/non-existent-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
