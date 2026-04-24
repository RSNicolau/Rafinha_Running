import { test, expect } from '@playwright/test';

test.describe('Acessibilidade básica', () => {
  test('página de login deve ter campos com labels acessíveis', async ({ page }) => {
    await page.goto('/login');

    // Todos os inputs devem ter label ou aria-label
    const inputs = await page.locator('input:visible').all();
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');
      // Deve ter algum form de identificação
      expect(id || ariaLabel || placeholder).toBeTruthy();
    }
  });

  test('página inicial deve ter heading h1', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('h1');
    // Deve existir pelo menos um h1
    const count = await h1.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('links de navegação devem ter texto descritivo', async ({ page }) => {
    await page.goto('/');
    const links = await page.locator('a:visible').all();
    for (const link of links.slice(0, 10)) { // verificar primeiros 10
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');
      // Link deve ter texto ou aria-label
      expect((text?.trim() || ariaLabel || '').length).toBeGreaterThan(0);
    }
  });
});
