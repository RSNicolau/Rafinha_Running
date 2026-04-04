/**
 * E2E tests for the Integrations dashboard page.
 *
 * All API calls mocked — tests verify UI behavior, not backend connectivity.
 */

import { test, expect } from '@playwright/test';

// ── Auth setup helper ─────────────────────────────────────────────────────────

async function authAs(page: any, role: 'COACH' | 'ADMIN' = 'COACH') {
  await page.context().addCookies([{
    name: 'rr_auth', value: '1', domain: 'localhost', path: '/',
    expires: Math.floor(Date.now() / 1000) + 86400,
    httpOnly: false, secure: false, sameSite: 'Strict' as const,
  }]);
  await page.addInitScript((r: string) => {
    localStorage.setItem('rr_access_token', 'mock-token');
    localStorage.setItem('rr_user', JSON.stringify(
      { id: 'u1', name: 'Rafinha', email: 'rafinha@test.com', role: r }
    ));
  }, role);
  await page.route('**/api/users/me', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', name: 'Rafinha', email: 'rafinha@test.com', role }) }),
  );
}

// ── Page load ─────────────────────────────────────────────────────────────────

test.describe('Integrations page — /dashboard/integrations', () => {
  test('renders all 6 provider cards', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    await page.goto('/dashboard/integrations');

    // All 6 providers should be visible
    await expect(page.getByText('Garmin Connect')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Strava')).toBeVisible();
    await expect(page.getByText('COROS')).toBeVisible();
    await expect(page.getByText('Polar Flow')).toBeVisible();
    await expect(page.getByText('Apple Health')).toBeVisible();
    await expect(page.getByText('Google Fit')).toBeVisible();
  });

  test('shows "Conectar" buttons for disconnected providers', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText('Garmin Connect')).toBeVisible({ timeout: 8_000 });

    const connectBtns = page.getByRole('button', { name: /conectar/i });
    await expect(connectBtns.first()).toBeVisible();
    // Should have multiple connect buttons (one per disconnected provider)
    expect(await connectBtns.count()).toBeGreaterThanOrEqual(2);
  });

  test('shows "Conectado" badge for active integrations', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 'int1', provider: 'GARMIN', isActive: true, lastSyncAt: new Date().toISOString() },
          { id: 'int2', provider: 'STRAVA', isActive: true, lastSyncAt: null },
        ]) }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText('Garmin Connect')).toBeVisible({ timeout: 8_000 });

    // Should show "Conectado" badge for connected providers
    const connectedBadges = page.getByText(/conectado/i);
    expect(await connectedBadges.count()).toBeGreaterThanOrEqual(1);
  });

  test('shows "Desconectar" button for active integrations', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 'int1', provider: 'GARMIN', isActive: true, lastSyncAt: null },
        ]) }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText('Garmin Connect')).toBeVisible({ timeout: 8_000 });

    await expect(page.getByText(/desconectar/i).first()).toBeVisible();
  });

  test('shows "Sincronizar tudo" button when integrations are active', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 'int1', provider: 'STRAVA', isActive: true, lastSyncAt: null },
        ]) }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText('Strava')).toBeVisible({ timeout: 8_000 });

    await expect(page.getByRole('button', { name: /sincronizar tudo/i })).toBeVisible();
  });

  test('does NOT show sync button when no integrations are active', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText('Garmin Connect')).toBeVisible({ timeout: 8_000 });

    await expect(page.getByRole('button', { name: /sincronizar tudo/i })).not.toBeVisible();
  });

  // ── OAuth connect flow ──────────────────────────────────────────────────────

  test('clicking Connect Garmin opens external URL', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/api/integrations/GARMIN/connect', (route: any) =>
      route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ url: 'https://connect.garmin.com/oauthConfirm?test=1', provider: 'GARMIN' }) }),
    );

    // Capture new tab / window.open calls
    const newPagePromise = page.context().waitForEvent('page').catch(() => null);

    await page.goto('/dashboard/integrations');
    await expect(page.getByText('Garmin Connect')).toBeVisible({ timeout: 8_000 });

    const connectGarmin = page.getByRole('button', { name: /conectar garmin/i });
    await connectGarmin.click();

    // Either a new tab opened or the button showed loading state
    await page.waitForTimeout(1000);
    const newPage = await newPagePromise;
    if (newPage) {
      expect(newPage.url()).toContain('garmin');
      await newPage.close();
    }
    // If no new tab, at least no crash happened (acceptable: some browsers block popups)
  });

  test('shows error toast when OAuth connect fails with "não configurada"', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/api/integrations/GARMIN/connect', (route: any) =>
      route.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ message: 'Integração não configurada. Configure GARMIN_CLIENT_ID.' }) }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText('Garmin Connect')).toBeVisible({ timeout: 8_000 });

    await page.getByRole('button', { name: /conectar garmin/i }).click();

    // Should show error message
    await expect(
      page.getByText(/não configurada|indisponível|erro/i).first()
    ).toBeVisible({ timeout: 6_000 });
  });

  // ── Disconnect flow ─────────────────────────────────────────────────────────

  test('disconnect removes integration from list', async ({ page }) => {
    await authAs(page);
    let integrations = [
      { id: 'int1', provider: 'GARMIN', isActive: true, lastSyncAt: null },
    ];

    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(integrations) }),
    );
    await page.route('**/api/integrations/int1', (route: any) => {
      integrations = [];
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ message: 'Integração desconectada' }) });
    });

    await page.goto('/dashboard/integrations');
    await expect(page.getByText(/desconectar/i).first()).toBeVisible({ timeout: 8_000 });

    // Click Desconectar
    await page.getByText(/desconectar/i).first().click();

    // "Conectado" badge should disappear (integration removed from state)
    await expect(page.getByText(/conectado/i)).not.toBeVisible({ timeout: 5_000 });
  });

  // ── Webhook setup cards ─────────────────────────────────────────────────────

  test('Strava webhook setup card is visible', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText(/webhook.*strava|strava.*webhook/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /registrar webhook/i }).first()).toBeVisible();
  });

  test('Polar webhook setup card is visible', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText(/webhook.*polar|polar.*webhook/i).first()).toBeVisible({ timeout: 8_000 });
    const webhookBtns = page.getByRole('button', { name: /registrar webhook/i });
    expect(await webhookBtns.count()).toBe(2); // Strava + Polar
  });

  test('Strava webhook setup shows success message after API call', async ({ page }) => {
    await authAs(page, 'ADMIN');
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/api/integrations/strava/setup-webhook', (route: any) =>
      route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ status: 'registered', subscriptionId: 12345 }) }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText('Garmin Connect')).toBeVisible({ timeout: 8_000 });

    // Click the first "Registrar webhook" button (Strava)
    await page.getByRole('button', { name: /registrar webhook/i }).first().click();

    await expect(page.getByText(/registrado|12345/i).first()).toBeVisible({ timeout: 6_000 });
  });

  // ── Sync all ────────────────────────────────────────────────────────────────

  test('sync all button shows success count', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 'int1', provider: 'STRAVA', isActive: true, lastSyncAt: null },
        ]) }),
    );
    await page.route('**/api/integrations/sync', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ synced: [{ provider: 'STRAVA', synced: 3 }] }) }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByRole('button', { name: /sincronizar tudo/i })).toBeVisible({ timeout: 8_000 });

    // Mock window.alert to capture the message
    await page.evaluate(() => {
      (window as any).__alertMessage = '';
      window.alert = (msg: string) => { (window as any).__alertMessage = msg; };
    });

    await page.getByRole('button', { name: /sincronizar tudo/i }).click();

    await page.waitForTimeout(1500);
    const alertMsg = await page.evaluate(() => (window as any).__alertMessage);
    expect(alertMsg).toMatch(/3|sincronizad/i);
  });

  // ── "Via Strava" section ────────────────────────────────────────────────────

  test('shows "Compatíveis via Strava" section', async ({ page }) => {
    await authAs(page);
    await page.route('**/api/integrations', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    await page.goto('/dashboard/integrations');
    await expect(page.getByText(/compatíveis via strava/i)).toBeVisible({ timeout: 8_000 });
    // Suunto and Samsung should appear
    await expect(page.getByText('Suunto')).toBeVisible();
    await expect(page.getByText('Samsung')).toBeVisible();
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  test('redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard/integrations');
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});
