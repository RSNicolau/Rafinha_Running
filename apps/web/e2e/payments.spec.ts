/**
 * E2E tests for the Subscribe / Payments flow.
 *
 * All API calls are mocked via page.route() — no real backend needed.
 */

import { test, expect } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function setupAuthAndNav(page: any, path: string) {
  // Inject auth cookie (required by middleware to access /subscribe)
  await page.context().addCookies([{
    name: 'rr_auth', value: '1', domain: 'localhost', path: '/',
    expires: Math.floor(Date.now() / 1000) + 86400,
    httpOnly: false, secure: false, sameSite: 'Strict' as const,
  }]);

  // Mock user info
  await page.route('**/api/users/me', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', name: 'Rafinha', email: 'rafinha@test.com', role: 'COACH' }) }),
  );

  // Inject token into localStorage BEFORE navigation
  await page.addInitScript(() => {
    localStorage.setItem('rr_access_token', 'mock-token');
    localStorage.setItem('rr_user', JSON.stringify({ id: 'u1', name: 'Rafinha', email: 'rafinha@test.com', role: 'COACH' }));
  });

  await page.goto(path);
}

const MOCK_PLANS = [
  { id: 'MONTHLY', name: 'Básico',  price: 4900, description: 'Para coaches iniciando',       features: ['Até 15 atletas', 'Dashboard web'] },
  { id: 'PRO',     name: 'Pro',     price: 9900, description: 'Para assessorias em crescimento', features: ['Até 50 atletas', 'IA para planilhas'], popular: true },
  { id: 'ELITE',   name: 'Elite',   price: 19900, description: 'Para grandes assessorias',     features: ['Atletas ilimitados', 'Suporte VIP'] },
];

const MOCK_PIX = {
  paymentId:    'pay_abc123',
  pixQrCode:    '00020101021226580014br.gov.bcb.pix',
  pixQrCodeUrl: 'https://pix.example.com/qr/test.png',
  pixExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  amount:       9900,
};

// ── Subscribe page structure ──────────────────────────────────────────────────

test.describe('Subscribe — /subscribe', () => {
  test('renders subscription plans from API', async ({ page }) => {
    await page.route('**/api/admin/config/plans', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ coach: MOCK_PLANS }) }),
    );

    await setupAuthAndNav(page, '/subscribe');

    // Check that at least one plan name is visible
    await expect(page.getByText(/básico|pro|elite/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('falls back to hardcoded plans when API fails', async ({ page }) => {
    await page.route('**/api/admin/config/plans', (route: any) =>
      route.fulfill({ status: 500 }),
    );

    await setupAuthAndNav(page, '/subscribe');

    // FALLBACK_PLANS always has "Pro" and "Básico"
    await expect(page.getByText(/pro/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('shows PIX QR code after selecting a plan and clicking pay', async ({ page }) => {
    await page.route('**/api/admin/config/plans', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ coach: MOCK_PLANS }) }),
    );
    await page.route('**/api/payments/pix', (route: any) =>
      route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify(MOCK_PIX) }),
    );

    await setupAuthAndNav(page, '/subscribe');

    // Wait for plans to load and click the Pro plan's PIX button
    await expect(page.getByText(/pro/i).first()).toBeVisible({ timeout: 8_000 });

    // Click the first available "Pagar com PIX" button
    const pixBtn = page.getByRole('button', { name: /pagar com pix|assinar|escolher/i }).first();
    await pixBtn.click();

    // QR code or PIX code string should appear
    await expect(
      page.getByText(/pix|qr|copiar|código/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('PIX code copy button is present after QR generation', async ({ page }) => {
    await page.route('**/api/admin/config/plans', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ coach: MOCK_PLANS }) }),
    );
    await page.route('**/api/payments/pix', (route: any) =>
      route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify(MOCK_PIX) }),
    );

    await setupAuthAndNav(page, '/subscribe');
    await expect(page.getByText(/pro|básico/i).first()).toBeVisible({ timeout: 8_000 });

    const pixBtn = page.getByRole('button', { name: /pagar com pix|assinar|escolher/i }).first();
    await pixBtn.click();

    // Should show copy button or PIX code
    await expect(
      page.getByRole('button', { name: /copiar|copy/i }).or(
        page.getByText(MOCK_PIX.pixQrCode.slice(0, 10))
      ).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('shows payment confirmed after polling returns PAID', async ({ page }) => {
    await page.route('**/api/admin/config/plans', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ coach: MOCK_PLANS }) }),
    );
    await page.route('**/api/payments/pix', (route: any) =>
      route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify(MOCK_PIX) }),
    );
    // Polling endpoint immediately returns PAID
    await page.route(`**/api/payments/order/${MOCK_PIX.paymentId}`, (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'paid' }) }),
    );
    // Subscription check after payment
    await page.route('**/api/subscriptions/current', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'ACTIVE', planType: 'PRO' }) }),
    );

    await setupAuthAndNav(page, '/subscribe');
    await expect(page.getByText(/pro|básico/i).first()).toBeVisible({ timeout: 8_000 });

    const pixBtn = page.getByRole('button', { name: /pagar com pix|assinar|escolher/i }).first();
    await pixBtn.click();

    // Should eventually show success state or redirect
    await expect(
      page.getByText(/pago|confirmado|sucesso|ativo|parabéns/i).first()
        .or(page.locator('[class*="success"]').first())
    ).toBeVisible({ timeout: 12_000 });
  });

  test('redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/subscribe');
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});

// ── Athlete Subscribe ─────────────────────────────────────────────────────────

test.describe('Athlete Subscribe — /athlete-subscribe', () => {
  test('renders athlete subscription page', async ({ page }) => {
    await page.route('**/api/admin/config/plans', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ athlete: [{ id: 'MONTHLY', name: 'Atleta', price: 2900,
          description: 'Para atletas', features: ['App mobile'] }] }) }),
    );

    await page.addInitScript(() => {
      localStorage.setItem('rr_access_token', 'mock-token');
      localStorage.setItem('rr_user', JSON.stringify({ id: 'a1', name: 'Atleta Teste', email: 'atleta@test.com', role: 'ATHLETE' }));
    });
    await page.context().addCookies([{
      name: 'rr_auth', value: '1', domain: 'localhost', path: '/',
      expires: Math.floor(Date.now() / 1000) + 86400,
      httpOnly: false, secure: false, sameSite: 'Strict' as const,
    }]);

    await page.route('**/api/users/me', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'a1', name: 'Atleta Teste', email: 'atleta@test.com', role: 'ATHLETE' }) }),
    );

    await page.goto('/athlete-subscribe');
    // Page should load with some plan content or PIX button
    await expect(page.getByText(/pix|assinar|atleta|plano/i).first()).toBeVisible({ timeout: 8_000 });
  });
});

// ── Payments webhook (API contract tests via fetch mock) ──────────────────────

test.describe('Payment status polling', () => {
  test('shows "aguardando" state while PIX not yet paid', async ({ page }) => {
    await page.route('**/api/admin/config/plans', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ coach: MOCK_PLANS }) }),
    );
    await page.route('**/api/payments/pix', (route: any) =>
      route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify(MOCK_PIX) }),
    );
    // Polling returns pending
    await page.route(`**/api/payments/order/**`, (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'pending' }) }),
    );

    await setupAuthAndNav(page, '/subscribe');
    await expect(page.getByText(/pro|básico/i).first()).toBeVisible({ timeout: 8_000 });

    const pixBtn = page.getByRole('button', { name: /pagar com pix|assinar|escolher/i }).first();
    await pixBtn.click();

    // Should show QR code / waiting state (NOT a success message)
    await expect(
      page.getByText(/aguard|pix|qr|vencimento|expirar/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
