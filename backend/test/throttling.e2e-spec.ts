import request from 'supertest';
import { ADMIN, PRIYA } from './helpers/auth';
import { createTestApp, TestContext } from './helpers/test-app';

describe('throttling', () => {
  let ctx: TestContext;
  const login = (credentials: { email: string; password: string }) =>
    request(ctx.app.getHttpServer()).post('/api/auth/login').send(credentials);

  beforeAll(async () => {
    ctx = await createTestApp({ THROTTLING_ENABLED: 'true' });
  });
  afterAll(async () => ctx.close());

  it('blocks the sixth login attempt for the same email with RATE_LIMITED and a Retry-After header', async () => {
    const wrong = { email: ADMIN.email, password: 'Wrong@12345' };
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(wrong).expect(401);
    }
    const blocked = await login(wrong).expect(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();

    // Even the correct password is refused while the bucket is full.
    await login(ADMIN).expect(429);
  });

  it('keys the login limit by email, so one locked account does not lock everyone out', async () => {
    await login(PRIYA).expect(200);
  });
});
