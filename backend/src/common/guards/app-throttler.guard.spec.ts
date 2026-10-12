import { AppThrottlerGuard } from './app-throttler.guard';

// getTracker is protected and needs no injected state, so expose it on a subclass and skip the constructor.
class Exposed extends AppThrottlerGuard {
  track(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}
const guard = Object.create(Exposed.prototype) as Exposed;

describe('AppThrottlerGuard.getTracker', () => {
  it('keys logins by normalised email and ignores the (proxy) IP', async () => {
    const a = await guard.track({
      path: '/api/v1/auth/login',
      ip: '1.1.1.1',
      body: { email: ' Admin@TaskApp.dev ' },
    });
    const b = await guard.track({
      path: '/api/v1/auth/login',
      ip: '2.2.2.2',
      body: { email: 'admin@taskapp.dev' },
    });
    expect(a).toBe('login:admin@taskapp.dev');
    expect(b).toBe(a);
  });

  it('keys refreshes by a hash of the refresh cookie, never the raw token', async () => {
    const key = await guard.track({
      path: '/api/v1/auth/refresh',
      ip: '1.1.1.1',
      cookies: { refresh_token: 'secret-token' },
    });
    expect(key).toMatch(/^refresh:[0-9a-f]{16}$/);
    expect(key).not.toContain('secret-token');
    const other = await guard.track({
      path: '/api/v1/auth/refresh',
      ip: '1.1.1.1',
      cookies: { refresh_token: 'another-token' },
    });
    expect(other).not.toBe(key);
  });

  it('falls back to user id, then IP', async () => {
    expect(
      await guard.track({
        path: '/api/v1/tasks',
        ip: '3.3.3.3',
        user: { id: 7 },
      }),
    ).toBe('user:7');
    expect(
      await guard.track({ path: '/api/v1/auth/refresh', ip: '3.3.3.3' }),
    ).toBe('ip:3.3.3.3');
  });
});
