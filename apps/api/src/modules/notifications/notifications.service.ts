import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { data: notifications, total, unreadCount, page, totalPages: Math.ceil(total / limit) };
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, data },
    });

    // Send Expo push notification if user has a push token stored
    await this.sendPushNotification(userId, title, body, data);

    return notification;
  }

  private async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    try {
      // Retrieve push token from AppConfig (keyed per user)
      const config = await this.prisma.appConfig.findUnique({
        where: { key: `push_token:${userId}` },
      });

      const pushToken = (config?.value as any)?.token as string | undefined;
      if (!pushToken || !pushToken.startsWith('ExponentPushToken[')) return;

      const message: ExpoPushMessage = {
        to: pushToken,
        title,
        body,
        data,
        sound: 'default',
      };

      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!res.ok) {
        this.logger.warn(`Expo push failed for user ${userId}: ${res.status}`);
      } else {
        const result: any = await res.json();
        if (result?.data?.status === 'error') {
          this.logger.warn(`Expo push error for ${userId}: ${result.data.message}`);
          // If token is invalid, remove it
          if (result.data.details?.error === 'DeviceNotRegistered') {
            await this.prisma.appConfig.delete({ where: { key: `push_token:${userId}` } }).catch(() => {});
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Push notification failed for user ${userId}: ${err.message}`);
    }
  }

  async registerPushToken(userId: string, token: string) {
    await this.prisma.appConfig.upsert({
      where: { key: `push_token:${userId}` },
      create: { key: `push_token:${userId}`, value: { token } },
      update: { value: { token } },
    });
    return { registered: true };
  }
}
