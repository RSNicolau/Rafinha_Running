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
    // Use real client IP from X-Forwarded-For (set by Vercel/proxies)
    // This prevents the shared Vercel edge IP from throttling all users together
    const forwarded = req.headers?.['x-forwarded-for'];
    const realIp = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim())
      : undefined;
    return req.user?.id ?? realIp ?? req.ip ?? 'unknown';
  }
}
