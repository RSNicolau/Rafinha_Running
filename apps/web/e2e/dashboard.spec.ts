/**
 * E2E tests for the Coach Dashboard.
 */

import { test, expect } from '@playwright/test';
import { injectAuth, mockApiRoutes, MOCK_COACH, MOCK_ADMIN } from './helpers';

test.describe('Dashboard — /dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page, MOCK_COACH);
    await injectAuth(page, MOCK_COACH);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('loads without crashing', async ({ page }) => {
    await expect(page).not.toHaveURL(/\/error/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('sidebar shows coach navigation items', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Atletas', exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('link', { name: 'Planilhas', exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('link', { name: 'Live Tracking', exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('sidebar does NOT show admin-only items for COACH', async ({ page }) => {
    await expect(page.getByRole('link', { name: /planos & preços/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /white-label/i })).not.toBeVisible();
  });

  test('shows logout button', async ({ page }) => {
    // On mobile the sidebar slides off-screen. Detect mobile by viewport width.
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      // Click the hamburger button in the mobile top bar to open the sidebar
      await page.locator('div.md\\:hidden button').first().click();
      // Wait for the 300ms slide-in transition to complete
      await page.waitForTimeout(600);
    }
    // Use filter to only match a visible logout button
    await expect(page.locator('button[title="Sair"]').filter({ visible: true }).first())
      .toBeVisible({ timeout: 5_000 });
  });

  test('demo mode toggle NOT visible for COACH', async ({ page }) => {
    await expect(page.getByRole('button', { name: /demo/i })).not.toBeVisible();
  });

  test('shows greeting with coach name', async ({ page }) => {
    // Dashboard greeting is in main content area (visible on all screen sizes)
    // It shows "Bom dia/Boa tarde/Boa noite, Rafinha"
    await expect(page.getByText(/bom dia|boa tarde|boa noite/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Dashboard — ADMIN role', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page, MOCK_ADMIN);
    await injectAuth(page, MOCK_ADMIN);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('sidebar shows admin navigation items for ADMIN', async ({ page }) => {
    await expect(page.getByRole('link', { name: /planos & preços/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('link', { name: /white-label/i })).toBeVisible({ timeout: 5_000 });
  });

  test('demo mode toggle visible for ADMIN', async ({ page }) => {
    await expect(page.getByRole('button', { name: /demo/i })).toBeVisible({ timeout: 5_000 });
  });

  test('ADMIN logo shows RR logo (no custom logo set)', async ({ page }) => {
    // Logo may be in sidebar (desktop) or mobile top bar — find the visible one
    const logo = page.locator('img[alt="Rafinha Running"]').or(page.locator('img[alt="RR"]'));
    await expect(logo.filter({ visible: true }).first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Unauthenticated Access', () => {
  test('redirects to /login when accessing /dashboard without token', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('redirects to /athlete-login when accessing /athlete without token', async ({ page }) => {
    await page.goto('/athlete-login');
    await page.evaluate(() => localStorage.clear());
    // Middleware may interrupt the navigation — ignore the error and check final URL
    await page.goto('/athlete').catch(() => {});
    await expect(page).toHaveURL(/\/athlete-login/, { timeout: 10_000 });
  });
});
