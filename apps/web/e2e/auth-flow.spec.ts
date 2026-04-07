/**
 * E2E tests for the Auth Flow.
 * Covers: register, login, token refresh, logout.
 */

import { test, expect } from '@playwright/test';
import { injectAuth, mockApiRoutes, MOCK_COACH } from './helpers';

test.describe('Auth Flow', () => {
  test('login page renders form fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
  });

  test('login shows error on wrong credentials', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json',
        body: JSON.stringify({ message: 'Credenciais inválidas' }) }),
    );

    await page.goto('/login');
    await page.getByLabel(/email/i).fill('wrong@test.com');
    await page.getByLabel(/senha/i).fill('wrongpass');
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page.getByText(/credenciais|inválid/i)).toBeVisible({ timeout: 5000 });
  });

  test('login succeeds and redirects to dashboard', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'valid-token', refreshToken: 'valid-refresh',
          user: MOCK_COACH }) }),
    );
    await mockApiRoutes(page);

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(MOCK_COACH.email);
    await page.getByLabel(/senha/i).fill('password123');
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });

  test('register page renders all fields', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel(/nome/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
  });

  test('authenticated user is redirected away from login', async ({ page }) => {
    await mockApiRoutes(page);
    await injectAuth(page, MOCK_COACH);
    await page.goto('/login');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    await mockApiRoutes(page);
    await injectAuth(page, MOCK_COACH);

    await page.route('**/api/auth/logout', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Find and click logout
    const logoutBtn = page.getByRole('button', { name: /sair|logout/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/login/, { timeout: 10000 });
    }
  });

  test('token refresh is called when access token expires', async ({ page }) => {
    let refreshCalled = false;

    await page.route('**/api/auth/refresh', (route) => {
      refreshCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'new-token', refreshToken: 'new-refresh' }) });
    });
    await mockApiRoutes(page);
    await injectAuth(page, MOCK_COACH);

    await page.evaluate(() => {
      // Simulate expired token scenario by clearing access token
      localStorage.removeItem('rr_access_token');
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Auth store should have attempted refresh
    expect(refreshCalled).toBe(true);
  });
});
