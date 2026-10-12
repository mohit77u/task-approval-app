import type { CookieOptions } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CookieSettings {
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  refreshTtlDays: number;
}

export interface AuthCookieOptions {
  access: CookieOptions;
  refresh: CookieOptions;
}

/**
 * The only place cookie attributes are defined. Both cookies live as long as the refresh token: the access JWT
 * enforces its own 30 minute expiry, and keeping its cookie around lets the API answer TOKEN_EXPIRED rather than the
 * browser silently deleting the cookie and making expiry indistinguishable from "never logged in".
 * No `domain` is set, so cookies are host-only and never leak to sibling subdomains.
 */
export function buildCookieOptions(
  settings: CookieSettings,
): AuthCookieOptions {
  const common: CookieOptions = {
    httpOnly: true,
    secure: settings.secure,
    sameSite: settings.sameSite,
    maxAge: settings.refreshTtlDays * DAY_MS,
  };
  return {
    access: { ...common, path: '/api' },
    // Limited to the auth routes so the long-lived credential is not sent with every API call.
    refresh: { ...common, path: '/api/v1/auth' },
  };
}

/** Browsers only delete a cookie when path and flags match, so reuse the originals without the lifetime. */
export function clearOptions(options: CookieOptions): CookieOptions {
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  return rest;
}
