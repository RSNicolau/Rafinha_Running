import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits by authenticated userId when available, falling back to IP.
 * Prevents a single user account from bypassing limits with multiple IPs,
 * and prevents shared NAT IPs from unfairly throttling all users behind them.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id ?? req.ip ?? 'unknown';
  }
}
