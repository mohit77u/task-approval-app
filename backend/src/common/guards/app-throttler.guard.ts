import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { REFRESH_COOKIE } from '../../security/utils/cookie.options';
import { AuthUser } from '../types/request.types';

interface TrackedRequest {
  ip?: string;
  path?: string;
  body?: { email?: unknown };
  cookies?: Record<string, unknown>;
  user?: AuthUser;
}

/**
 * Rate-limit keys. The client IP cannot be trusted as a key in this deployment: requests reach the API through
 * Vercel's rewrite and Cloudflare/Render's edge, so the address we see is a proxy's and changes between requests (a
 * per-IP limit then never fires). So:
 *  - logins are limited per email (stops password guessing on one account; the trade-off is that someone can lock a
 *    known email out for a minute),
 *  - refreshes per refresh-token cookie (i.e. per session),
 *  - authenticated traffic per user,
 *  - anything else falls back to the IP.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as TrackedRequest;
    if (
      request.path?.endsWith('/auth/login') &&
      typeof request.body?.email === 'string'
    ) {
      return Promise.resolve(
        `login:${request.body.email.trim().toLowerCase()}`,
      );
    }
    const refreshCookie = request.cookies?.[REFRESH_COOKIE];
    if (
      request.path?.endsWith('/auth/refresh') &&
      typeof refreshCookie === 'string' &&
      refreshCookie.length > 0
    ) {
      // Hashed so the token itself never ends up in the in-memory limiter store or logs.
      const digest = createHash('sha256')
        .update(refreshCookie)
        .digest('hex')
        .slice(0, 16);
      return Promise.resolve(`refresh:${digest}`);
    }
    if (request.user) return Promise.resolve(`user:${request.user.id}`);
    return Promise.resolve(`ip:${request.ip}`);
  }
}
