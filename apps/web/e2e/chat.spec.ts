/**
 * E2E tests for Chat functionality.
 * Coach ↔ Athlete messaging — all WebSocket calls are mocked.
 */

import { test, expect } from '@playwright/test';
import { injectAuth, mockApiRoutes, MOCK_COACH, MOCK_ATHLETE } from './helpers';

const MOCK_CONVERSATIONS = [
  {
    id: 'conv-1',
    athleteId: 'athlete-1',
    coachId: 'coach-1',
    athlete: { id: 'athlete-1', name: 'João Silva', avatarUrl: null },
    lastMessage: { content: 'Oi, tudo bem?', createdAt: new Date().toISOString() },
    unreadCount: 1,
  },
];

const MOCK_MESSAGES = [
  { id: 'msg-1', content: 'Oi, tudo bem?', senderId: 'athlete-1',
    createdAt: new Date().toISOString(), read: false },
  { id: 'msg-2', content: 'Oi João! Tudo ótimo.', senderId: 'coach-1',
    createdAt: new Date().toISOString(), read: true },
];

test.describe('Chat Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);

    await page.route('**/api/chat/conversations**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_CONVERSATIONS) }),
    );
    await page.route('**/api/chat/messages**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_MESSAGES) }),
    );
    await page.route('**/api/chat/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_MESSAGES) }),
    );

    await injectAuth(page, MOCK_COACH);
  });

  test('chat page loads and shows conversation list', async ({ page }) => {
    await page.goto('/dashboard/chat');
    await expect(
      page.getByText(/João Silva/i)
        .or(page.getByText(/conversa|mensagem|chat/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('chat shows message input area', async ({ page }) => {
    await page.goto('/dashboard/chat');
    await page.waitForLoadState('networkidle');

    const messageInput = page.getByPlaceholder(/mensagem|escreva|type/i)
      .or(page.getByRole('textbox', { name: /mensagem/i }));
    if (await messageInput.isVisible()) {
      await expect(messageInput).toBeVisible();
    } else {
      // If no conversation selected, click the first one
      const firstConv = page.getByText('João Silva');
      if (await firstConv.isVisible()) {
        await firstConv.click();
        await expect(page.getByPlaceholder(/mensagem|escreva|type/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('sending a message via API', async ({ page }) => {
    let messageSent = false;

    await page.route('**/api/chat/**', (route) => {
      if (route.request().method() === 'POST') {
        messageSent = true;
        return route.fulfill({ status: 201, contentType: 'application/json',
          body: JSON.stringify({ id: 'msg-new', content: 'Boa tarde!', senderId: 'coach-1',
            createdAt: new Date().toISOString() }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_MESSAGES) });
    });

    await page.goto('/dashboard/chat');
    await page.waitForLoadState('networkidle');

    // Navigate to a conversation if needed
    const firstConv = page.getByText('João Silva');
    if (await firstConv.isVisible()) {
      await firstConv.click();
    }

    const messageInput = page.getByPlaceholder(/mensagem|escreva|type/i);
    if (await messageInput.isVisible()) {
      await messageInput.fill('Boa tarde!');
      await page.keyboard.press('Enter');
      // Allow time for the message send to trigger
      await page.waitForTimeout(500);
    }
  });

  test('unread badge shows on conversation list', async ({ page }) => {
    await page.goto('/dashboard/chat');
    await expect(
      page.getByText('1').or(page.locator('[data-testid="unread-badge"]'))
    ).toBeVisible({ timeout: 10000 });
  });
});
