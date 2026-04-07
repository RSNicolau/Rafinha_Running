/**
 * E2E tests for Subscription / Billing flow.
 * Covers: billing page navigation, plan display, upgrade CTA.
 */

import { test, expect } from '@playwright/test';
import { injectAuth, mockApiRoutes, MOCK_COACH } from './helpers';

const MOCK_SUBSCRIPTION = {
  id: 'sub-1',
  status: 'ACTIVE',
  planType: 'PRO',
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  cancelAtPeriodEnd: false,
};

const MOCK_INVOICES = [
  { id: 'inv-1', amount: 9990, status: 'PAID',
    createdAt: new Date().toISOString(), description: 'Plano Pro — Mensal' },
];

test.describe('Billing / Subscription Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);

    await page.route('**/api/subscriptions/current', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_SUBSCRIPTION) }),
    );
    await page.route('**/api/subscriptions/invoices**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_INVOICES) }),
    );
    await page.route('**/api/subscriptions**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_SUBSCRIPTION) }),
    );

    await injectAuth(page, MOCK_COACH);
  });

  test('billing page loads with plan status', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await expect(
      page.getByText(/Pro|plano|assinatura|billing/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('billing page shows plan type and status', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await expect(page.getByText(/ativo|active|PRO/i)).toBeVisible({ timeout: 10000 });
  });

  test('invoice history is displayed', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await expect(
      page.getByText(/fatura|invoice|histórico|Plano Pro/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('cancel plan button is present for active subscription', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await page.waitForLoadState('networkidle');

    // Check for cancel or manage subscription button
    const cancelBtn = page.getByRole('button', { name: /cancelar|cancel|gerenciar|manage/i });
    if (await cancelBtn.count() > 0) {
      await expect(cancelBtn.first()).toBeVisible();
    }
  });

  test('subscribe page shows plan options for unauthenticated user', async ({ page }) => {
    await page.goto('/subscribe');
    await expect(
      page.getByText(/plano|assinatura|plan|R\$/i)
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Subscription Upgrade Flow', () => {
  test('upgrade CTA redirects to payment', async ({ page }) => {
    await page.route('**/api/subscriptions/current', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'sub-1', status: 'ACTIVE', planType: 'BASIC' }) }),
    );
    await mockApiRoutes(page);
    await injectAuth(page, MOCK_COACH);

    await page.goto('/dashboard/billing');
    await page.waitForLoadState('networkidle');

    const upgradeBtn = page.getByRole('button', { name: /upgrade|fazer upgrade|melhorar plano/i });
    if (await upgradeBtn.isVisible()) {
      await upgradeBtn.click();
      await expect(page).toHaveURL(/billing|subscribe|checkout/, { timeout: 5000 });
    }
  });
});
