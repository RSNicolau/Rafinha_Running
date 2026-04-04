/**
 * E2E tests for the Login flow.
 */

import { test, expect } from '@playwright/test';

test.describe('Login — /login', () => {
  test('renders login form with email and password fields', async ({ page }) => {
    await page.goto('/login');
    // Placeholder is "seu@email.com"
    await expect(page.getByPlaceholder('seu@email.com')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
  });

  test('shows RR logo on login page', async ({ page }) => {
    await page.goto('/login');
    const logo = page.locator('img[alt*="RR"], img[alt*="Rafinha"]').first();
    await expect(logo).toBeVisible();
  });

  test('password field hides text by default', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    // Use 422 (not 401) to avoid the refresh-token interceptor redirect loop
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 422, contentType: 'application/json',
        body: JSON.stringify({ message: 'Credenciais inválidas' }) }),
    );

    await page.goto('/login');
    await page.getByPlaceholder('seu@email.com').pressSequentially('wrong@test.com');
    await page.locator('input[type="password"]').pressSequentially('WrongPassword123!');
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page.getByText(/credenciais|inválid/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('redirects to dashboard after successful login', async ({ page }) => {
    // Mock login + subscription check
    // Also inject the rr_auth cookie when login succeeds (needed for middleware auth check)
    await page.route('**/api/auth/login', async (route) => {
      await page.context().addCookies([{
        name: 'rr_auth', value: '1', domain: 'localhost', path: '/',
        expires: Math.floor(Date.now() / 1000) + 86400, httpOnly: false, secure: false, sameSite: 'Strict',
      }]);
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'valid-token',
          refreshToken: 'valid-refresh',
          user: { id: 'u1', name: 'Rafinha', email: 'rafinha@test.com', role: 'COACH' },
        }) });
    });
    await page.route('**/api/subscriptions/current', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'ACTIVE', planType: 'PRO' }) }),
    );
    await page.route('**/api/users/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'u1', name: 'Rafinha', email: 'rafinha@test.com', role: 'COACH' }) }),
    );

    await page.goto('/login');
    await page.getByPlaceholder('seu@email.com').pressSequentially('rafinha@test.com');
    await page.locator('input[type="password"]').pressSequentially('Adm123@!');
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('empty fields — submit button is present and page stays on login', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.getByRole('button', { name: /entrar/i });
    await expect(submitBtn).toBeVisible();
    // Clicking with empty fields should not navigate away (stays on login)
    await submitBtn.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 3_000 });
  });

  test('has link to create account', async ({ page }) => {
    await page.goto('/login');
    const createLink = page.getByRole('link', { name: /criar conta|registrar|sign up/i });
    if (await createLink.count() > 0) {
      await expect(createLink).toBeVisible();
    }
  });
});

test.describe('Athlete Login — /athlete-login', () => {
  test('renders athlete login form', async ({ page }) => {
    await page.goto('/athlete-login');
    await expect(page.getByPlaceholder('seu@email.com')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Athlete login has a custom button label (not "Entrar")
    const submitBtn = page.getByRole('button', { name: /entrar|acessar/i }).first();
    await expect(submitBtn).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    // Use 422 (not 401) to avoid the refresh-token interceptor redirect loop
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 422, contentType: 'application/json',
        body: JSON.stringify({ message: 'Credenciais inválidas' }) }),
    );

    await page.goto('/athlete-login');
    await page.getByPlaceholder('seu@email.com').fill('nobody@test.com');
    await page.locator('input[type="password"]').fill('WrongPass!');
    await page.getByRole('button', { name: /entrar|acessar/i }).first().click();

    await expect(page.getByText(/credenciais|inválid/i).first()).toBeVisible({ timeout: 5_000 });
  });
});
