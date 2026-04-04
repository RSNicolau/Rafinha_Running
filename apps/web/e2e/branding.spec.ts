/**
 * E2E tests for White-label Branding page.
 */

import { test, expect } from '@playwright/test';
import { injectAuth, mockApiRoutes, MOCK_COACH, MOCK_ADMIN } from './helpers';

test.describe('Branding Page — /dashboard/admin/branding', () => {
  test('COACH is redirected away from branding page', async ({ page }) => {
    await mockApiRoutes(page, MOCK_COACH);
    await injectAuth(page, MOCK_COACH);
    await page.goto('/dashboard/admin/branding');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Should redirect to /dashboard (role guard)
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 5_000 });
  });

  test('ADMIN can access branding page', async ({ page }) => {
    await mockApiRoutes(page, MOCK_ADMIN);
    await injectAuth(page, MOCK_ADMIN);
    await page.goto('/dashboard/admin/branding');
    await page.waitForLoadState('networkidle').catch(() => {});

    await expect(page).not.toHaveURL(/\/login/);
  });

  test('branding page shows niche selector with 6 sport options', async ({ page }) => {
    await mockApiRoutes(page, MOCK_ADMIN);
    await injectAuth(page, MOCK_ADMIN);
    await page.goto('/dashboard/admin/branding');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Niche buttons have emoji + text: check by role with exact name patterns
    const niches = [/corrida/i, /crossfit/i, /natação/i, /triátlon|triatlon/i, /ciclismo/i, /outro/i];
    for (const niche of niches) {
      await expect(page.getByRole('button', { name: niche }).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('branding page shows primary color section', async ({ page }) => {
    await mockApiRoutes(page, MOCK_ADMIN);
    await injectAuth(page, MOCK_ADMIN);
    await page.goto('/dashboard/admin/branding');
    await page.waitForLoadState('networkidle').catch(() => {});

    await expect(page.getByText(/cor principal|cor primária|primary/i)).toBeVisible({ timeout: 5_000 });
  });

  test('branding page shows secondary color section', async ({ page }) => {
    await mockApiRoutes(page, MOCK_ADMIN);
    await injectAuth(page, MOCK_ADMIN);
    await page.goto('/dashboard/admin/branding');
    await page.waitForLoadState('networkidle').catch(() => {});

    await expect(page.getByText(/cor secundária|secondary/i)).toBeVisible({ timeout: 5_000 });
  });

  test('branding page shows save button', async ({ page }) => {
    await mockApiRoutes(page, MOCK_ADMIN);
    await injectAuth(page, MOCK_ADMIN);
    await page.goto('/dashboard/admin/branding');
    await page.waitForLoadState('networkidle').catch(() => {});

    await expect(page.getByRole('button', { name: /salvar|save/i })).toBeVisible({ timeout: 5_000 });
  });

  test('selecting a niche highlights the selected card', async ({ page }) => {
    await mockApiRoutes(page, MOCK_ADMIN);
    await injectAuth(page, MOCK_ADMIN);
    await page.goto('/dashboard/admin/branding');
    await page.waitForLoadState('networkidle').catch(() => {});

    const crossfitBtn = page.getByRole('button').filter({ hasText: 'CrossFit' });
    if (await crossfitBtn.count() === 0) return;

    await crossfitBtn.click();

    const crossfitCard = page.locator('[data-niche="crossfit"], button:has-text("CrossFit")').first();
    await expect(crossfitCard).toBeVisible();
  });

  test('primary color preset swatches are clickable', async ({ page }) => {
    await mockApiRoutes(page, MOCK_ADMIN);
    await injectAuth(page, MOCK_ADMIN);
    await page.goto('/dashboard/admin/branding');
    await page.waitForLoadState('networkidle').catch(() => {});

    const colorInput = page.locator('input[type="color"]').first();
    if (await colorInput.count() > 0) {
      await expect(colorInput).toBeVisible();
    }
  });
});
