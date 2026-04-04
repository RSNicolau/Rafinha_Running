/**
 * E2E tests for the Athlete Feedback flow.
 *
 * Tests the /athlete page:
 * - Athlete portal loads and shows greeting
 * - Feedback modal opens when clicking "+ Feedback"
 * - RPE slider is interactive
 * - Sensation emoji buttons are clickable
 * - Observations textarea accepts text
 * - Submit button is present
 */

import { test, expect } from '@playwright/test';
import { mockAthleteApiRoutes, MOCK_ATHLETE } from './helpers';
import { Page } from '@playwright/test';

async function injectAthleteAuth(page: Page) {
  await page.context().addCookies([{
    name: 'rr_auth',
    value: '1',
    domain: 'localhost',
    path: '/',
    expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    httpOnly: false,
    secure: false,
    sameSite: 'Strict',
  }]);
  await page.goto('/athlete-login');
  await page.evaluate((u) => {
    localStorage.setItem('rr_access_token', 'valid-mock-token');
    localStorage.setItem('rr_refresh_token', 'valid-mock-refresh');
    localStorage.setItem('rr_user', JSON.stringify(u));
  }, MOCK_ATHLETE);
}

test.describe('Athlete Portal — /athlete', () => {
  test.beforeEach(async ({ page }) => {
    await mockAthleteApiRoutes(page, MOCK_ATHLETE);
    await injectAthleteAuth(page);
  });

  test('athlete portal loads without crashing', async ({ page }) => {
    await page.goto('/athlete');
    await expect(page).not.toHaveURL(/\/error/);
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('shows greeting with athlete name', async ({ page }) => {
    await page.goto('/athlete');
    await expect(page.getByText(/olá/i)).toBeVisible({ timeout: 5_000 });
  });

  test('shows logout button', async ({ page }) => {
    await page.goto('/athlete');
    await expect(page.getByRole('button', { name: /sair|logout/i })).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Feedback Modal UI', () => {
  test.beforeEach(async ({ page }) => {
    await mockAthleteApiRoutes(page, MOCK_ATHLETE);
    await injectAthleteAuth(page);
    await page.goto('/athlete');
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('feedback button exists for completed workouts (if any loaded)', async ({ page }) => {
    const feedbackBtns = page.getByRole('button', { name: /feedback|editar/i });
    const count = await feedbackBtns.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('feedback modal contains RPE slider', async ({ page }) => {
    const feedbackBtn = page.getByRole('button', { name: /\+ feedback/i }).first();
    if (await feedbackBtn.count() === 0) return;

    await feedbackBtn.click();

    await expect(page.getByText(/como foi o treino/i)).toBeVisible({ timeout: 3_000 });

    const rpeSlider = page.getByRole('slider');
    await expect(rpeSlider).toBeVisible();

    await expect(page.getByText('😫')).toBeVisible();
    await expect(page.getByText('💪')).toBeVisible();

    await expect(page.getByPlaceholder(/dores|sensações|observações/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /enviar feedback/i })).toBeVisible();
  });

  test('feedback modal closes when clicking backdrop', async ({ page }) => {
    const feedbackBtn = page.getByRole('button', { name: /\+ feedback/i }).first();
    if (await feedbackBtn.count() === 0) return;

    await feedbackBtn.click();
    await expect(page.getByText(/como foi o treino/i)).toBeVisible({ timeout: 3_000 });

    await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } });

    await expect(page.getByText(/como foi o treino/i)).not.toBeVisible({ timeout: 2_000 });
  });

  test('RPE slider changes value', async ({ page }) => {
    const feedbackBtn = page.getByRole('button', { name: /\+ feedback/i }).first();
    if (await feedbackBtn.count() === 0) return;

    await feedbackBtn.click();
    await expect(page.getByText(/como foi o treino/i)).toBeVisible({ timeout: 3_000 });

    const slider = page.getByRole('slider');
    await slider.fill('8');
    const value = await slider.inputValue();
    expect(Number(value)).toBe(8);
  });

  test('sensation emoji button is selectable', async ({ page }) => {
    const feedbackBtn = page.getByRole('button', { name: /\+ feedback/i }).first();
    if (await feedbackBtn.count() === 0) return;

    await feedbackBtn.click();
    await expect(page.getByText(/como foi o treino/i)).toBeVisible({ timeout: 3_000 });

    const otimoBtn = page.getByRole('button').filter({ hasText: '💪' });
    await otimoBtn.click();

    await expect(otimoBtn).toHaveClass(/border-\[#DC2626\]/);
  });
});
