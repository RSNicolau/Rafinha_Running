import { test, expect } from '@playwright/test';

test.describe('Home / Landing', () => {
  test('deve carregar a página inicial sem erros', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/Rafinha|Running|RR/i);
    expect(errors).toHaveLength(0);
  });

  test('deve ter link de login', async ({ page }) => {
    await page.goto('/');
    // Algum link/botão de login deve existir
    const loginEl = page.getByRole('link', { name: /entrar|login|acessar/i }).first()
      .or(page.getByRole('button', { name: /entrar|login/i }).first());
    await expect(loginEl).toBeVisible({ timeout: 10_000 });
  });
});
