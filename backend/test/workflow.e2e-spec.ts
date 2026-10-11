import request from 'supertest';
import { ADMIN, Agent, loginAgent, PRIYA, RAHUL, userIdOf } from './helpers/auth';
import { createTask, TaskBody } from './helpers/factories';
import { clearTaskData, createTestApp, TestContext } from './helpers/test-app';

describe('workflow: transitions, approval, history and comments', () => {
  let ctx: TestContext;
  let admin: Agent;
  let priya: Agent;
  let rahul: Agent;
  let priyaId: number;
  let adminId: number;
  let task: TaskBody;

  const transition = (agent: Agent, id: number, to: string, note?: string) =>
    agent.post(`/api/tasks/${id}/transition`).send({ to, ...(note === undefined ? {} : { note }) });
  const statusOf = async (id: number): Promise<string> => (await admin.get(`/api/tasks/${id}`).expect(200)).body.status;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAgent(ctx.app, ADMIN);
    priya = await loginAgent(ctx.app, PRIYA);
    rahul = await loginAgent(ctx.app, RAHUL);
    priyaId = await userIdOf(ctx.dataSource, PRIYA.email);
    adminId = await userIdOf(ctx.dataSource, ADMIN.email);
  });
  beforeEach(async () => {
    await clearTaskData(ctx.dataSource);
    task = await createTask(admin, priyaId);
  });
  afterAll(async () => ctx.close());

  async function moveToPendingApproval(): Promise<void> {
    await transition(priya, task.id, 'IN_PROGRESS').expect(200);
    await transition(priya, task.id, 'PENDING_APPROVAL').expect(200);
  }

  describe('happy path', () => {
    it('runs PENDING → IN_PROGRESS → PENDING_APPROVAL → COMPLETED and records each step', async () => {
      const started = await transition(priya, task.id, 'IN_PROGRESS').expect(200);
      expect(started.body.status).toBe('IN_PROGRESS');
      expect(started.body.allowedTransitions).toEqual(['PENDING_APPROVAL']);

      const submitted = await transition(priya, task.id, 'PENDING_APPROVAL', 'Ready for review').expect(200);
      expect(submitted.body.allowedTransitions).toEqual([]);
      expect((await admin.get(`/api/tasks/${task.id}`).expect(200)).body.allowedTransitions.sort()).toEqual(['COMPLETED', 'IN_PROGRESS']);

      const approved = await transition(admin, task.id, 'COMPLETED').expect(200);
      expect(approved.body.status).toBe('COMPLETED');
      expect(approved.body.allowedTransitions).toEqual([]);

      const history = (await priya.get(`/api/tasks/${task.id}/history`).expect(200)).body;
      expect(history.map((h: { fromStatus: string | null; toStatus: string }) => [h.fromStatus, h.toStatus])).toEqual([
        [null, 'PENDING'],
        ['PENDING', 'IN_PROGRESS'],
        ['IN_PROGRESS', 'PENDING_APPROVAL'],
        ['PENDING_APPROVAL', 'COMPLETED'],
      ]);
      expect(history[2]).toMatchObject({ note: 'Ready for review', actor: { id: priyaId } });
      expect(history[3].actor.id).toBe(adminId);
    });
  });

  describe('rejection', () => {
    it('requires a non-blank reason, then returns the task to IN_PROGRESS with the reason in history', async () => {
      await moveToPendingApproval();

      for (const note of [undefined, '', '   ']) {
        const res = await transition(admin, task.id, 'IN_PROGRESS', note).expect(422);
        expect(res.body.details).toEqual([{ field: 'note', message: 'A reason is required when rejecting a task' }]);
      }
      expect(await statusOf(task.id)).toBe('PENDING_APPROVAL');

      const rejected = await transition(admin, task.id, 'IN_PROGRESS', ' Missing the budget section ').expect(200);
      expect(rejected.body.status).toBe('IN_PROGRESS');

      const history = (await priya.get(`/api/tasks/${task.id}/history`).expect(200)).body;
      expect(history.at(-1)).toMatchObject({ fromStatus: 'PENDING_APPROVAL', toStatus: 'IN_PROGRESS', note: 'Missing the budget section' });

      // The employee can fix the work and submit again.
      await transition(priya, task.id, 'PENDING_APPROVAL').expect(200);
    });
  });

  describe('authorization', () => {
    it('does not let an employee approve or reject (403) and leaves the status unchanged', async () => {
      await moveToPendingApproval();
      const approve = await transition(priya, task.id, 'COMPLETED').expect(403);
      expect(approve.body.code).toBe('FORBIDDEN');
      await transition(priya, task.id, 'IN_PROGRESS', 'self-reject').expect(403);
      expect(await statusOf(task.id)).toBe('PENDING_APPROVAL');
    });

    it('does not let an admin perform the employee steps', async () => {
      await transition(admin, task.id, 'IN_PROGRESS').expect(403);
      await transition(priya, task.id, 'IN_PROGRESS').expect(200);
      await transition(admin, task.id, 'PENDING_APPROVAL').expect(403);
    });

    it('hides the task from an employee who is not the assignee (404)', async () => {
      await transition(rahul, task.id, 'IN_PROGRESS').expect(404);
      await rahul.get(`/api/tasks/${task.id}/history`).expect(404);
      await rahul.get(`/api/tasks/${task.id}/comments`).expect(404);
      await rahul.post(`/api/tasks/${task.id}/comments`).send({ body: 'hi' }).expect(404);
    });

    it('requires authentication', async () => {
      const http = request(ctx.app.getHttpServer());
      await http.post(`/api/tasks/${task.id}/transition`).send({ to: 'IN_PROGRESS' }).expect(401);
      await http.get(`/api/tasks/${task.id}/history`).expect(401);
      await http.get(`/api/tasks/${task.id}/comments`).expect(401);
    });
  });

  describe('invalid transitions', () => {
    it('rejects pairs that have no rule with INVALID_TRANSITION, even for an admin', async () => {
      const skip = await transition(admin, task.id, 'COMPLETED').expect(422);
      expect(skip.body.code).toBe('INVALID_TRANSITION');
      await transition(priya, task.id, 'PENDING_APPROVAL').expect(422);
      await transition(priya, task.id, 'PENDING').expect(422);
    });

    it('treats COMPLETED as final', async () => {
      await moveToPendingApproval();
      await transition(admin, task.id, 'COMPLETED').expect(200);
      for (const to of ['PENDING', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED']) {
        await transition(admin, task.id, to, 'x').expect(422);
      }
    });

    it('validates the payload', async () => {
      await priya.post(`/api/tasks/${task.id}/transition`).send({}).expect(422);
      await priya.post(`/api/tasks/${task.id}/transition`).send({ to: 'DONE' }).expect(422);
      await priya.post(`/api/tasks/${task.id}/transition`).send({ to: 'IN_PROGRESS', note: 'x'.repeat(1001) }).expect(422);
      await priya.post(`/api/tasks/${task.id}/transition`).send({ to: 'IN_PROGRESS', extra: 1 }).expect(422);
    });

    it('treats a soft-deleted task as not found', async () => {
      await admin.delete(`/api/tasks/${task.id}`).expect(204);
      await transition(priya, task.id, 'IN_PROGRESS').expect(404);
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of two simultaneous approvals win and writes a single history row', async () => {
      await moveToPendingApproval();
      const results = await Promise.all([transition(admin, task.id, 'COMPLETED'), transition(admin, task.id, 'COMPLETED')]);

      const statuses = results.map((r) => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const rows = await ctx.dataSource.query("SELECT id FROM task_status_history WHERE task_id = ? AND to_status = 'COMPLETED'", [task.id]);
      expect(rows).toHaveLength(1);
    });
  });

  describe('comments', () => {
    it('lets the assignee and an admin comment, in order, with trimmed bodies', async () => {
      const first = await priya.post(`/api/tasks/${task.id}/comments`).send({ body: '  Started on this  ' }).expect(201);
      expect(first.body).toMatchObject({ body: 'Started on this', author: { id: priyaId, name: 'Priya Sharma' } });
      await admin.post(`/api/tasks/${task.id}/comments`).send({ body: 'Thanks, keep me posted' }).expect(201);

      const list = await priya.get(`/api/tasks/${task.id}/comments`).expect(200);
      expect(list.body.map((c: { body: string }) => c.body)).toEqual(['Started on this', 'Thanks, keep me posted']);
    });

    it('rejects blank or oversized bodies', async () => {
      await priya.post(`/api/tasks/${task.id}/comments`).send({ body: '    ' }).expect(422);
      await priya.post(`/api/tasks/${task.id}/comments`).send({ body: 'x'.repeat(2001) }).expect(422);
      await priya.post(`/api/tasks/${task.id}/comments`).send({}).expect(422);
    });

    it('keeps comments open after completion so follow-ups are possible', async () => {
      await moveToPendingApproval();
      await transition(admin, task.id, 'COMPLETED').expect(200);
      await priya.post(`/api/tasks/${task.id}/comments`).send({ body: 'Thanks!' }).expect(201);
    });
  });
});
