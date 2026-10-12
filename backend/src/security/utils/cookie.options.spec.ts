import { buildCookieOptions, clearOptions } from './cookie.options';

describe('buildCookieOptions', () => {
  const base = { secure: true, sameSite: 'lax' as const, refreshTtlDays: 365 };

  it('scopes the refresh cookie to the auth routes and the access cookie to the API', () => {
    const { access, refresh } = buildCookieOptions(base);
    expect(access.path).toBe('/api');
    expect(refresh.path).toBe('/api/v1/auth');
  });

  it('is httpOnly, host-only and follows the environment for Secure and SameSite', () => {
    const { access, refresh } = buildCookieOptions({
      ...base,
      secure: false,
      sameSite: 'strict',
    });
    for (const options of [access, refresh]) {
      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe('strict');
      expect(options.domain).toBeUndefined();
    }
  });

  it('keeps the access cookie as long-lived as the refresh cookie so an expired JWT can still be reported as expired', () => {
    const { access, refresh } = buildCookieOptions(base);
    expect(access.maxAge).toBe(365 * 24 * 60 * 60 * 1000);
    expect(refresh.maxAge).toBe(access.maxAge);
  });

  it('clearOptions drops maxAge but keeps path and flags so the browser actually deletes the cookie', () => {
    const { refresh } = buildCookieOptions(base);
    const cleared = clearOptions(refresh);
    expect(cleared.maxAge).toBeUndefined();
    expect(cleared.path).toBe('/api/v1/auth');
    expect(cleared.httpOnly).toBe(true);
  });
});
