import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /entrar|login/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Credenciais inválidas' }),
      }),
    );

    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('invalid@test.com');
    await page.getByRole('textbox', { name: /senha|password/i }).fill('wrongpassword');
    await page.getByRole('button', { name: /entrar|login/i }).click();
    await expect(page.getByText(/inválid|incorrect|error/i)).toBeVisible({ timeout: 5000 });
  });

  test('redirects unauthenticated users from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });
});
