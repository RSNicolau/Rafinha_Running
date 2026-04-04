/**
 * Shared E2E test helpers.
 */
import { Page } from '@playwright/test';

export const MOCK_COACH = {
  id: 'coach-1',
  name: 'Rafinha',
  email: 'rafinha@test.com',
  role: 'COACH',
  branding: { primaryColor: '#DC2626', secondaryColor: '#1F2937', niche: 'running' },
};

export const MOCK_ADMIN = {
  id: 'admin-1',
  name: 'Rafinha Admin',
  email: 'rafinha@rafinharunning.com',
  role: 'ADMIN',
  branding: { primaryColor: '#DC2626', secondaryColor: '#1F2937', niche: 'running', logoUrl: null },
};

export const MOCK_ATHLETE = {
  id: 'athlete-1',
  name: 'João Silva',
  email: 'joao@test.com',
  role: 'ATHLETE',
};

/**
 * Inject auth state into localStorage + set rr_auth cookie for middleware.
 */
export async function injectAuth(page: Page, user = MOCK_COACH) {
  // Set the rr_auth cookie that middleware checks for server-side auth
  await page.context().addCookies([{
    name: 'rr_auth',
    value: '1',
    domain: 'localhost',
    path: '/',
    expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    httpOnly: false,
    secure: false,
    sameSite: 'Strict',
  }]);

  await page.goto('/login');
  await page.evaluate((u) => {
    localStorage.setItem('rr_access_token', 'valid-mock-token');
    localStorage.setItem('rr_refresh_token', 'valid-mock-refresh');
    localStorage.setItem('rr_user', JSON.stringify(u));
  }, user);
}

/**
 * Mock all API routes to avoid real backend calls and prevent logout loops.
 * Intercepts /api/* routes and returns minimal valid responses.
 */
export async function mockApiRoutes(page: Page, user = MOCK_COACH) {
  // Intercept auth endpoints
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'valid-mock-token', refreshToken: 'valid-mock-refresh' }) }),
  );
  await page.route('**/api/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }),
  );
  await page.route('**/api/subscriptions/current', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'sub-1', status: 'ACTIVE', planType: 'PRO' }) }),
  );

  // Dashboard API routes
  await page.route('**/api/users/athletes**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/users/athletes/stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ totalAthletes: 0, alertCount: 0, adherencePercent: 100 }) }),
  );
  await page.route('**/api/users/athletes/alerts', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );

  // Branding API routes
  await page.route('**/api/config/branding', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({
        tenantName: 'Test Assessoria', primaryColor: '#DC2626', secondaryColor: '#1F2937',
        niche: 'running', logoUrl: null, bannerUrl: null, domain: null, welcomeMsg: null,
      }) }),
  );
  await page.route('**/api/admin/config/plans', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ coach: [], athlete: [] }) }),
  );

  // Workouts
  await page.route('**/api/workouts/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ workouts: [], data: [] }) }),
  );
  await page.route('**/api/workouts/history**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/training-plans**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
}

/**
 * Mock API routes for athlete portal.
 */
export async function mockAthleteApiRoutes(page: Page, user = MOCK_ATHLETE) {
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'valid-mock-token', refreshToken: 'valid-mock-refresh' }) }),
  );
  await page.route('**/api/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }),
  );
  await page.route('**/api/subscriptions/current', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'sub-1', status: 'ACTIVE', planType: 'BASIC' }) }),
  );
  await page.route('**/api/workouts/history**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/workouts/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ workouts: [], data: [] }) }),
  );
  await page.route('**/api/training-plans**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
}
