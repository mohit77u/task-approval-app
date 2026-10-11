import request from 'supertest';
import { createTestApp, TestContext } from './helpers/test-app';

describe('error contract', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());

  it('returns the standard error shape for an unknown route', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/nope')
      .expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      path: '/api/nope',
    });
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(res.body.timestamp).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('echoes a client supplied request id', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/nope')
      .set('X-Request-Id', 'abc-123')
      .expect(404);
    expect(res.body.requestId).toBe('abc-123');
  });
});
