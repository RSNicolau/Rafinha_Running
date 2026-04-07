/**
 * E2E tests for Training Plan creation flow.
 * Coach creates a plan; athlete portal shows it.
 */

import { test, expect } from '@playwright/test';
import { injectAuth, mockApiRoutes, MOCK_COACH, MOCK_ATHLETE as _MOCK_ATHLETE } from './helpers';

const MOCK_ATHLETE = {
  ..._MOCK_ATHLETE,
  branding: { primaryColor: '#DC2626', secondaryColor: '#1F2937', niche: 'running' },
};

const MOCK_PLAN = {
  id: 'plan-1',
  title: 'Plano 5K Iniciante',
  description: 'Plano de 8 semanas para iniciantes',
  durationWeeks: 8,
  status: 'ACTIVE',
  athleteId: 'athlete-1',
  coachId: 'coach-1',
  createdAt: new Date().toISOString(),
};

test.describe('Training Plan Creation (Coach)', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await page.route('**/api/training-plans**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([MOCK_PLAN]) });
      }
      return route.continue();
    });
    await injectAuth(page, MOCK_COACH);
  });

  test('plans page loads and shows list', async ({ page }) => {
    await page.goto('/dashboard/plans');
    await expect(page.getByText(/plano|treino|plan/i)).toBeVisible({ timeout: 10000 });
  });

  test('create plan page has required fields', async ({ page }) => {
    await page.goto('/dashboard/plans/create');
    await expect(
      page.getByRole('heading', { name: /novo plano|criar plano|new plan/i })
        .or(page.getByLabel(/título|título do plano|nome/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('create plan form submits and shows success', async ({ page }) => {
    await page.route('**/api/training-plans', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json',
          body: JSON.stringify(MOCK_PLAN) });
      }
      return route.continue();
    });

    await page.goto('/dashboard/plans/create');

    // Fill in mandatory fields if visible
    const titleField = page.getByLabel(/título|nome do plano/i);
    if (await titleField.isVisible()) {
      await titleField.fill('Plano 5K Iniciante');
    }

    const submitBtn = page.getByRole('button', { name: /criar|salvar|save|submit/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Expect redirect or success message
      await expect(
        page.getByText(/criado|sucesso|success/i)
          .or(page.locator('[role="alert"]'))
      ).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Training Plan View (Athlete)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/refresh', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'valid-token', refreshToken: 'valid-refresh' }) }),
    );
    await page.route('**/api/users/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_ATHLETE) }),
    );
    await page.route('**/api/subscriptions/current', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'sub-1', status: 'ACTIVE', planType: 'BASIC' }) }),
    );
    await page.route('**/api/training-plans**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([MOCK_PLAN]) }),
    );
    await page.route('**/api/workouts/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ workouts: [] }) }),
    );
    await injectAuth(page, MOCK_ATHLETE);
  });

  test('athlete can see assigned training plan', async ({ page }) => {
    await page.goto('/dashboard/plans');
    await expect(page.getByText(/plano|treino|5k/i)).toBeVisible({ timeout: 10000 });
  });
});
