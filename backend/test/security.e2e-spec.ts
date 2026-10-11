import request from 'supertest';
import { ADMIN } from './helpers/auth';
import { createTestApp, TestContext } from './helpers/test-app';

describe('request origin policy and headers', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());

  it('refuses a state-changing request from an unknown origin', async () => {
    const res = await http()
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send(ADMIN)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('accepts the same request from an allowed origin and from a client without Origin', async () => {
    await http()
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send(ADMIN)
      .expect(200);
    await http().post('/api/auth/login').send(ADMIN).expect(200);
  });

  it('answers CORS preflight only for allowed origins and allows credentials', async () => {
    const allowed = await http()
      .options('/api/tasks')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await http()
      .options('/api/tasks')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends hardening headers', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
