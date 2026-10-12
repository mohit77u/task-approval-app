import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser } from '../types/request.types';

interface TrackedRequest {
  ip?: string;
  path?: string;
  body?: { email?: unknown };
  user?: AuthUser;
}

/**
 * Rate-limit keys. Plain IP is wrong here: every request reaches Render through Vercel, so the socket IP is Vercel's
 * and all users would share one bucket. Logins are limited per email+IP (stops brute force without letting one attacker
 * lock everyone out), and authenticated traffic per user.
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
        `login:${request.body.email.trim().toLowerCase()}|${request.ip}`,
      );
    }
    if (request.user) return Promise.resolve(`user:${request.user.id}`);
    return Promise.resolve(`ip:${request.ip}`);
  }
}
