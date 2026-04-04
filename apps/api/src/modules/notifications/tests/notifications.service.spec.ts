/**
 * Unit tests for NotificationsService
 *
 * Critical paths:
 *  - getUserNotifications: paginated list + unread count
 *  - markAsRead / markAllAsRead
 *  - createNotification: persists record, attempts push if token stored
 *  - registerPushToken: upserts in AppConfig
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Fetch mock (for Expo push) ─────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ── Prisma mock ────────────────────────────────────────────────────────────────

const mockPrisma = {
  notification: {
    findMany:    jest.fn(),
    count:       jest.fn(),
    create:      jest.fn(),
    updateMany:  jest.fn(),
  },
  appConfig: {
    findUnique: jest.fn(),
    upsert:     jest.fn(),
  },
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  // ── getUserNotifications ───────────────────────────────────────────────────

  describe('getUserNotifications', () => {
    it('retorna notificações paginadas com unreadCount', async () => {
      const notifications = [
        { id: 'n1', title: 'Test', readAt: null },
        { id: 'n2', title: 'Test 2', readAt: new Date() },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(notifications);
      mockPrisma.notification.count
        .mockResolvedValueOnce(2)   // total
        .mockResolvedValueOnce(1);  // unread

      const result = await service.getUserNotifications('u1');
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.unreadCount).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('calcula totalPages corretamente', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count
        .mockResolvedValueOnce(45)
        .mockResolvedValueOnce(10);

      const result = await service.getUserNotifications('u1', 1, 20);
      expect(result.totalPages).toBe(3);
    });
  });

  // ── markAsRead ─────────────────────────────────────────────────────────────

  describe('markAsRead', () => {
    it('atualiza readAt da notificação específica', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await service.markAsRead('n1', 'u1');
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n1', userId: 'u1' },
          data:  expect.objectContaining({ readAt: expect.any(Date) }),
        }),
      );
    });
  });

  // ── markAllAsRead ──────────────────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('marca todas as não lidas como lidas', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      await service.markAllAsRead('u1');
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', readAt: null },
        }),
      );
    });
  });

  // ── createNotification ─────────────────────────────────────────────────────

  describe('createNotification', () => {
    it('cria notificação sem tentar push quando token não está registrado', async () => {
      mockPrisma.notification.create.mockResolvedValue({ id: 'n-new' });
      mockPrisma.appConfig.findUnique.mockResolvedValue(null); // no push token

      const result = await service.createNotification(
        'u1', 'SYSTEM', 'Título', 'Corpo', {},
      );
      expect(result.id).toBe('n-new');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('envia push notification quando token está registrado', async () => {
      mockPrisma.notification.create.mockResolvedValue({ id: 'n-push' });
      mockPrisma.appConfig.findUnique.mockResolvedValue({
        key: 'push_token:u1',
        value: { token: 'ExponentPushToken[test_token]' },
      });
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) });

      await service.createNotification('u1', 'SYSTEM', 'Título', 'Corpo');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  // ── registerPushToken ──────────────────────────────────────────────────────

  describe('registerPushToken', () => {
    it('salva o token no AppConfig', async () => {
      mockPrisma.appConfig.upsert.mockResolvedValue({ key: 'push_token:u1' });

      await service.registerPushToken('u1', 'ExponentPushToken[abc]');
      expect(mockPrisma.appConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'push_token:u1' },
        }),
      );
    });
  });
});
