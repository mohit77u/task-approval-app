import request from 'supertest';
import { Task } from '../src/modules/tasks/entities/task.entity';
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

describe('tasks: CRUD, scoping and filters', () => {
  let ctx: TestContext;
  let admin: Agent;
  let priya: Agent;
  let rahul: Agent;
  let priyaId: number;
  let rahulId: number;
  let adminId: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAgent(ctx.app, ADMIN);
    priya = await loginAgent(ctx.app, PRIYA);
    rahul = await loginAgent(ctx.app, RAHUL);
    priyaId = await userIdOf(ctx.dataSource, PRIYA.email);
    rahulId = await userIdOf(ctx.dataSource, RAHUL.email);
    adminId = await userIdOf(ctx.dataSource, ADMIN.email);
  });
  beforeEach(async () => clearTaskData(ctx.dataSource));
  afterAll(async () => ctx.close());

  describe('null on required fields', () => {
    it('answers 422 (not 500) when a required field is set to null on update', async () => {
      const task = await createTask(admin, priyaId);
      for (const field of [
        'title',
        'description',
        'priority',
        'dueDate',
        'assigneeId',
      ]) {
        const res = await admin
          .patch(`/api/tasks/${task.id}`)
          .send({ [field]: null })
          .expect(422);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details[0].field).toBe(field);
      }
    });
  });

  describe('timestamps', () => {
    it('returns createdAt close to the real current time, regardless of the database server time zone', async () => {
      const task = await createTask(admin, priyaId);
      const skewMs = Math.abs(
        new Date(task.createdAt as string).getTime() - Date.now(),
      );
      expect(skewMs).toBeLessThan(2 * 60 * 1000);
    });
  });

  describe('authentication', () => {
    it('protects every task endpoint', async () => {
      const http = request(ctx.app.getHttpServer());
      await http.get('/api/tasks').expect(401);
      await http.post('/api/tasks').send({}).expect(401);
      await http.get('/api/tasks/1').expect(401);
      await http.patch('/api/tasks/1').send({}).expect(401);
      await http.delete('/api/tasks/1').expect(401);
    });
  });

  describe('create', () => {
    it('lets an admin create a PENDING task and records the first history row', async () => {
      const task = await createTask(admin, priyaId, { title: '  Trim me  ' });

      expect(task).toMatchObject({
        title: 'Trim me',
        status: 'PENDING',
        priority: 'MEDIUM',
        dueDate: '2030-01-15',
      });
      expect(task.assignee).toMatchObject({ id: priyaId, email: PRIYA.email });
      expect(task.allowedTransitions).toEqual([]); // admins cannot perform employee steps

      const history = await ctx.dataSource.query(
        'SELECT from_status, to_status, actor_id FROM task_status_history WHERE task_id = ?',
        [task.id],
      );
      expect(history).toEqual([
        { from_status: null, to_status: 'PENDING', actor_id: adminId },
      ]);
    });

    it('forbids employees from creating, updating or deleting', async () => {
      const task = await createTask(admin, priyaId);
      await priya.post('/api/tasks').send({}).expect(403);
      await priya
        .patch(`/api/tasks/${task.id}`)
        .send({ title: 'Hacked' })
        .expect(403);
      await priya.delete(`/api/tasks/${task.id}`).expect(403);
    });

    it('rejects invalid input with field-level details', async () => {
      const base = {
        title: 'Ok',
        description: 'Ok',
        priority: 'LOW',
        dueDate: '2030-01-01',
        assigneeId: priyaId,
      };
      const fields = async (body: object): Promise<string[]> => {
        const res = await admin.post('/api/tasks').send(body).expect(422);
        return res.body.details.map((d: { field: string }) => d.field);
      };

      expect(await fields({ ...base, title: '   ' })).toContain('title');
      expect(await fields({ ...base, title: 'x'.repeat(201) })).toContain(
        'title',
      );
      expect(await fields({ ...base, priority: 'URGENT' })).toContain(
        'priority',
      );
      expect(await fields({ ...base, dueDate: '2030-02-30' })).toContain(
        'dueDate',
      );
      expect(await fields({ ...base, dueDate: '15/01/2030' })).toContain(
        'dueDate',
      );
      expect(await fields({ ...base, description: undefined })).toContain(
        'description',
      );
      // Clients may not set workflow fields directly.
      expect(await fields({ ...base, status: 'COMPLETED' })).toContain(
        'status',
      );
    });

    it('only allows assigning to existing employees', async () => {
      const base = {
        title: 'Ok',
        description: 'Ok',
        priority: 'LOW',
        dueDate: '2030-01-01',
      };
      for (const assigneeId of [adminId, 99999]) {
        const res = await admin
          .post('/api/tasks')
          .send({ ...base, assigneeId })
          .expect(422);
        expect(res.body.details).toEqual([
          {
            field: 'assigneeId',
            message: 'Assignee must be an existing employee',
          },
        ]);
      }
    });
  });

  describe('visibility', () => {
    it('shows an employee only their own tasks and an admin all of them', async () => {
      await createTask(admin, priyaId, { title: 'For Priya' });
      await createTask(admin, rahulId, { title: 'For Rahul' });

      const mine = await priya.get('/api/tasks').expect(200);
      expect(mine.body.items.map((t: { title: string }) => t.title)).toEqual([
        'For Priya',
      ]);

      const everything = await admin.get('/api/tasks').expect(200);
      expect(everything.body.items).toHaveLength(2);
    });

    it('ignores an employee trying to widen scope with the assignee filter', async () => {
      await createTask(admin, rahulId, { title: 'For Rahul' });
      const res = await priya
        .get(`/api/tasks?assigneeId=${rahulId}`)
        .expect(200);
      expect(res.body.items).toEqual([]);
    });

    it("answers 404 (not 403) when an employee asks for someone else's task, so its existence is not revealed", async () => {
      const task = await createTask(admin, rahulId);
      const res = await priya.get(`/api/tasks/${task.id}`).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
      await priya.get('/api/tasks/99999').expect(404);
    });

    it('returns viewer-specific allowedTransitions on detail', async () => {
      const task = await createTask(admin, priyaId);
      expect(
        (await priya.get(`/api/tasks/${task.id}`).expect(200)).body
          .allowedTransitions,
      ).toEqual(['IN_PROGRESS']);
      expect(
        (await admin.get(`/api/tasks/${task.id}`).expect(200)).body
          .allowedTransitions,
      ).toEqual([]);
    });

    it('rejects non-numeric ids', async () => {
      await admin.get('/api/tasks/abc').expect(422);
    });
  });

  describe('filters and pagination', () => {
    beforeEach(async () => {
      await createTask(admin, priyaId, {
        title: 'Alpha report',
        priority: 'HIGH',
      });
      await createTask(admin, priyaId, {
        title: 'Beta budget 100%',
        priority: 'LOW',
      });
      await createTask(admin, rahulId, {
        title: 'Gamma_audit',
        priority: 'HIGH',
      });
      await ctx.dataSource
        .getRepository(Task)
        .update({ title: 'Alpha report' }, { status: 'IN_PROGRESS' as never });
    });

    const titles = (res: request.Response): string[] =>
      res.body.items.map((t: { title: string }) => t.title).sort();

    it('filters by status, priority and (for admins) employee', async () => {
      expect(
        titles(await admin.get('/api/tasks?status=IN_PROGRESS').expect(200)),
      ).toEqual(['Alpha report']);
      expect(
        titles(await admin.get('/api/tasks?priority=HIGH').expect(200)),
      ).toEqual(['Alpha report', 'Gamma_audit']);
      expect(
        titles(await admin.get(`/api/tasks?assigneeId=${rahulId}`).expect(200)),
      ).toEqual(['Gamma_audit']);
      expect(
        titles(
          await admin
            .get(`/api/tasks?assigneeId=${priyaId}&priority=HIGH`)
            .expect(200),
        ),
      ).toEqual(['Alpha report']);
    });

    it("applies filters inside an employee's own scope", async () => {
      expect(
        titles(await priya.get('/api/tasks?priority=HIGH').expect(200)),
      ).toEqual(['Alpha report']);
    });

    it('matches % and _ in search literally instead of as wildcards', async () => {
      expect(
        titles(await admin.get('/api/tasks?search=100%25').expect(200)),
      ).toEqual(['Beta budget 100%']);
      expect(
        titles(await admin.get('/api/tasks?search=%25').expect(200)),
      ).toEqual(['Beta budget 100%']);
      expect(
        titles(await admin.get('/api/tasks?search=e_a').expect(200)),
      ).toEqual([]);
      expect(
        titles(await admin.get('/api/tasks?search=gamma_').expect(200)),
      ).toEqual(['Gamma_audit']);
      expect(
        titles(await admin.get('/api/tasks?search=ALPHA').expect(200)),
      ).toEqual(['Alpha report']);
    });

    it('paginates newest first with accurate meta and rejects out-of-range values', async () => {
      const page1 = await admin.get('/api/tasks?limit=2&page=1').expect(200);
      expect(page1.body.meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect(page1.body.items.map((t: { title: string }) => t.title)).toEqual([
        'Gamma_audit',
        'Beta budget 100%',
      ]);

      const page2 = await admin.get('/api/tasks?limit=2&page=2').expect(200);
      expect(page2.body.items.map((t: { title: string }) => t.title)).toEqual([
        'Alpha report',
      ]);

      await admin.get('/api/tasks?limit=101').expect(422);
      await admin.get('/api/tasks?page=0').expect(422);
      await admin.get('/api/tasks?status=DONE').expect(422);
    });
  });

  describe('update and delete', () => {
    it('lets an admin edit fields and reassign to another employee', async () => {
      const task = await createTask(admin, priyaId);
      const res = await admin
        .patch(`/api/tasks/${task.id}`)
        .send({ title: 'Renamed', priority: 'HIGH', assigneeId: rahulId })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'Renamed',
        priority: 'HIGH',
        status: 'PENDING',
      });
      expect(res.body.assignee.id).toBe(rahulId);

      await priya.get(`/api/tasks/${task.id}`).expect(404);
      await rahul.get(`/api/tasks/${task.id}`).expect(200);
    });

    it('treats an empty patch as a no-op and never lets status be patched', async () => {
      const task = await createTask(admin, priyaId);
      await admin.patch(`/api/tasks/${task.id}`).send({}).expect(200);
      const res = await admin
        .patch(`/api/tasks/${task.id}`)
        .send({ status: 'COMPLETED' })
        .expect(422);
      expect(res.body.details[0].field).toBe('status');
    });

    it('does not allow editing a completed task', async () => {
      const task = await createTask(admin, priyaId);
      await ctx.dataSource.query(
        "UPDATE tasks SET status = 'COMPLETED' WHERE id = ?",
        [task.id],
      );
      const res = await admin
        .patch(`/api/tasks/${task.id}`)
        .send({ title: 'Too late' })
        .expect(409);
      expect(res.body.code).toBe('STATE_CONFLICT');
    });

    it('soft-deletes: the task disappears from the API but its history remains', async () => {
      const task = await createTask(admin, priyaId);
      await admin.delete(`/api/tasks/${task.id}`).expect(204);

      await admin.get(`/api/tasks/${task.id}`).expect(404);
      await priya.get(`/api/tasks/${task.id}`).expect(404);
      expect((await admin.get('/api/tasks').expect(200)).body.items).toEqual(
        [],
      );
      await admin.delete(`/api/tasks/${task.id}`).expect(404);

      const rows = await ctx.dataSource.query(
        'SELECT deleted_at FROM tasks WHERE id = ?',
        [task.id],
      );
      expect(rows[0].deleted_at).not.toBeNull();
      const history = await ctx.dataSource.query(
        'SELECT id FROM task_status_history WHERE task_id = ?',
        [task.id],
      );
      expect(history).toHaveLength(1);
    });
  });
});
