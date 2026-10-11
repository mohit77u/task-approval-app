import request from 'supertest';
import {
  ADMIN,
  Agent,
  loginAgent,
  PRIYA,
  RAHUL,
  userIdOf,
} from './helpers/auth';
import { createTask } from './helpers/factories';
import { clearTaskData, createTestApp, TestContext } from './helpers/test-app';

describe('dashboard and health', () => {
  let ctx: TestContext;
  let admin: Agent;
  let priya: Agent;
  let rahul: Agent;
  let priyaId: number;
  let rahulId: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAgent(ctx.app, ADMIN);
    priya = await loginAgent(ctx.app, PRIYA);
    rahul = await loginAgent(ctx.app, RAHUL);
    priyaId = await userIdOf(ctx.dataSource, PRIYA.email);
    rahulId = await userIdOf(ctx.dataSource, RAHUL.email);
  });
  beforeEach(async () => clearTaskData(ctx.dataSource));
  afterAll(async () => ctx.close());

  const zero = {
    PENDING: 0,
    IN_PROGRESS: 0,
    PENDING_APPROVAL: 0,
    COMPLETED: 0,
  };

  it('requires authentication', async () => {
    await request(ctx.app.getHttpServer()).get('/api/dashboard').expect(401);
  });

  it('returns zeros for every status when there are no tasks', async () => {
    const res = await admin.get('/api/dashboard').expect(200);
    expect(res.body).toEqual({ counts: zero, total: 0 });
  });

  it('counts all tasks for an admin and only own tasks for an employee, matching the list', async () => {
    const a = await createTask(admin, priyaId);
    await createTask(admin, priyaId);
    await createTask(admin, rahulId);
    await ctx.dataSource.query(
      "UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = ?",
      [a.id],
    );

    expect((await admin.get('/api/dashboard').expect(200)).body).toEqual({
      counts: { ...zero, PENDING: 2, IN_PROGRESS: 1 },
      total: 3,
    });
    expect((await priya.get('/api/dashboard').expect(200)).body).toEqual({
      counts: { ...zero, PENDING: 1, IN_PROGRESS: 1 },
      total: 2,
    });
    expect((await rahul.get('/api/dashboard').expect(200)).body).toEqual({
      counts: { ...zero, PENDING: 1 },
      total: 1,
    });

    const list = await priya.get('/api/tasks').expect(200);
    expect(list.body.meta.total).toBe(2);
  });

  it('excludes soft-deleted tasks', async () => {
    const task = await createTask(admin, priyaId);
    await admin.delete(`/api/tasks/${task.id}`).expect(204);
    expect((await admin.get('/api/dashboard').expect(200)).body.total).toBe(0);
  });

  it('exposes a public health check that confirms the database', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });
});
