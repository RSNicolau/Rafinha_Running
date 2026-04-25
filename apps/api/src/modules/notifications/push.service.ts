import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly EXPO_URL = 'https://exp.host/--/api/v2/push/send';

  constructor(private prisma: PrismaService) {}

  async registerToken(userId: string, token: string): Promise<void> {
    await this.prisma.appConfig.upsert({
      where: { key: `push_token:${userId}` },
      create: { key: `push_token:${userId}`, value: { token } },
      update: { value: { token } },
    });
  }

  async sendPush(userId: string, title: string, body: string, data?: Record<string, any>): Promise<void> {
    try {
      const config = await this.prisma.appConfig.findUnique({
        where: { key: `push_token:${userId}` },
      });

      const token = (config?.value as any)?.token as string | undefined;
      if (!token?.startsWith('ExponentPushToken')) return;

      const payload = {
        to: token,
        title,
        body,
        data: data ?? {},
        sound: 'default',
        badge: 1,
      };

      await this.sendWithRetry(payload);
    } catch (err: any) {
      this.logger.error(`Push notification failed for user ${userId}: ${err.message}`);
    }
  }

  // ITEM 7 — Retry with exponential backoff (max 3 attempts)
  private async sendWithRetry(payload: object, attempt = 1): Promise<void> {
    const maxAttempts = 3;
    try {
      const res = await fetch(this.EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Expo returned ${res.status}`);
      const responseData: any = await res.json();
      // Check for individual errors in batch response
      if (responseData?.data?.status === 'error') {
        this.logger.warn(`Push delivery error: ${responseData.data.message}`);
      }
    } catch (err) {
      if (attempt < maxAttempts) {
        const delay = attempt * 2000; // 2s, 4s
        this.logger.warn(`Push attempt ${attempt} failed, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        return this.sendWithRetry(payload, attempt + 1);
      }
      this.logger.error(`Push failed after ${maxAttempts} attempts`, err);
    }
  }

  async sendPushToMany(userIds: string[], title: string, body: string): Promise<void> {
    await Promise.allSettled(userIds.map(id => this.sendPush(id, title, body)));
  }
}
