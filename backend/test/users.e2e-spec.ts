import request from 'supertest';
import { Task } from '../src/database/entities';
import { TaskPriority } from '../src/common/enums/task-priority.enum';
import { TaskStatus } from '../src/common/enums/task-status.enum';
import { ADMIN, Agent, loginAgent, PRIYA, userIdOf } from './helpers/auth';
import { createTestApp, TestContext } from './helpers/test-app';

describe('users and roles', () => {
  let ctx: TestContext;
  let admin: Agent;
  let priya: Agent;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAgent(ctx.app, ADMIN);
    priya = await loginAgent(ctx.app, PRIYA);
  });
  afterAll(async () => ctx.close());

  it('requires authentication and the Admin role', async () => {
    await request(ctx.app.getHttpServer()).get('/api/users').expect(401);
    await priya.get('/api/users').expect(403);
    await priya.get('/api/roles').expect(403);
    await priya.post('/api/users').send({}).expect(403);
    await priya.get('/api/users/1').expect(403);
    await priya.patch('/api/users/1').send({ name: 'X' }).expect(403);
    await priya.delete('/api/users/1').expect(403);
  });

  it('lists roles for the create-user dropdown', async () => {
    const res = await admin.get('/api/roles').expect(200);
    expect(res.body.map((r: { code: string }) => r.code).sort()).toEqual([
      'ADMIN',
      'EMPLOYEE',
    ]);
  });

  it('lists users with pagination and filters by role code', async () => {
    const all = await admin.get('/api/users').expect(200);
    expect(all.body.meta).toMatchObject({ page: 1, limit: 20, total: 5 });
    expect(JSON.stringify(all.body)).not.toMatch(/passwordHash|password_hash/);

    const employees = await admin
      .get('/api/users?roleCode=EMPLOYEE')
      .expect(200);
    expect(
      employees.body.items.map((u: { email: string }) => u.email).sort(),
    ).toEqual(['ananya@taskapp.dev', 'priya@taskapp.dev', 'rahul@taskapp.dev']);

    await admin.get('/api/users?roleCode=ROOT').expect(422);
    await admin.get('/api/users?limit=1000').expect(422);
    await admin.get('/api/users?page=0').expect(422);
  });

  describe('creating a user', () => {
    async function employeeRoleId(): Promise<number> {
      const roles = await admin.get('/api/roles').expect(200);
      return roles.body.find((r: { code: string }) => r.code === 'EMPLOYEE').id;
    }

    it('creates a user who can then log in, and never returns the hash', async () => {
      const roleId = await employeeRoleId();
      const res = await admin
        .post('/api/users')
        .send({
          name: '  Neha Kapoor ',
          email: 'Neha.Kapoor@TaskApp.dev',
          phone: ' +91 98765 43210 ',
          password: 'Welcome123',
          roleId,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Neha Kapoor',
        email: 'neha.kapoor@taskapp.dev',
        phone: '+91 98765 43210',
        role: { code: 'EMPLOYEE' },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
      await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'neha.kapoor@taskapp.dev', password: 'Welcome123' })
        .expect(200);
    });

    it('rejects a duplicate email regardless of case with CONFLICT', async () => {
      const roleId = await employeeRoleId();
      const res = await admin
        .post('/api/users')
        .send({
          name: 'Dup',
          email: 'PRIYA@taskapp.dev',
          password: 'Welcome123',
          roleId,
        })
        .expect(409);
      expect(res.body.code).toBe('CONFLICT');
    });

    it('rejects weak passwords, unknown roles and unknown fields with field-level details', async () => {
      const roleId = await employeeRoleId();
      const weak = await admin
        .post('/api/users')
        .send({ name: 'A', email: 'a@taskapp.dev', password: 'short', roleId })
        .expect(422);
      expect(
        weak.body.details.some(
          (d: { field: string }) => d.field === 'password',
        ),
      ).toBe(true);

      const noDigits = await admin
        .post('/api/users')
        .send({
          name: 'A',
          email: 'a@taskapp.dev',
          password: 'onlyletters',
          roleId,
        })
        .expect(422);
      expect(noDigits.body.details[0].field).toBe('password');

      const tooLong = await admin
        .post('/api/users')
        .send({
          name: 'A',
          email: 'a@taskapp.dev',
          password: `a1${'x'.repeat(80)}`,
          roleId,
        })
        .expect(422);
      expect(tooLong.body.details[0].field).toBe('password');

      const badPhone = await admin
        .post('/api/users')
        .send({
          name: 'A',
          email: 'a@taskapp.dev',
          phone: 'call me',
          password: 'Welcome123',
          roleId,
        })
        .expect(422);
      expect(badPhone.body.details[0]).toMatchObject({ field: 'phone' });

      const badRole = await admin
        .post('/api/users')
        .send({
          name: 'A',
          email: 'a@taskapp.dev',
          password: 'Welcome123',
          roleId: 9999,
        })
        .expect(422);
      expect(badRole.body.details).toEqual([
        { field: 'roleId', message: 'Unknown role' },
      ]);

      const extra = await admin
        .post('/api/users')
        .send({
          name: 'A',
          email: 'a@taskapp.dev',
          password: 'Welcome123',
          roleId,
          isAdmin: true,
        })
        .expect(422);
      expect(extra.body.details[0].field).toBe('isAdmin');
    });
  });

  describe('reading, editing and deleting a user', () => {
    async function createEmployee(
      email: string,
    ): Promise<{ id: number; email: string; password: string }> {
      const roles = await admin.get('/api/roles').expect(200);
      const roleId = roles.body.find(
        (r: { code: string }) => r.code === 'EMPLOYEE',
      ).id;
      const res = await admin
        .post('/api/users')
        .send({ name: 'Temp User', email, password: 'Welcome123', roleId })
        .expect(201);
      return { id: res.body.id, email, password: 'Welcome123' };
    }

    it('returns one user and 404 for an unknown id; a non-numeric id is a validation error', async () => {
      const id = await userIdOf(ctx.dataSource, PRIYA.email);
      const res = await admin.get(`/api/users/${id}`).expect(200);
      expect(res.body).toMatchObject({
        email: PRIYA.email,
        role: { code: 'EMPLOYEE' },
      });
      expect((await admin.get('/api/users/99999').expect(404)).body.code).toBe(
        'NOT_FOUND',
      );
      await admin.get('/api/users/abc').expect(422);
    });

    it('edits name, email and phone, clears the phone with null, and rejects a taken email', async () => {
      const user = await createEmployee('edit.me@taskapp.dev');
      const edited = await admin
        .patch(`/api/users/${user.id}`)
        .send({
          name: '  Edited Name ',
          email: 'Edited.Me@TaskApp.dev',
          phone: '+91 91111 22222',
        })
        .expect(200);
      expect(edited.body).toMatchObject({
        name: 'Edited Name',
        email: 'edited.me@taskapp.dev',
        phone: '+91 91111 22222',
      });

      const cleared = await admin
        .patch(`/api/users/${user.id}`)
        .send({ phone: null })
        .expect(200);
      expect(cleared.body.phone).toBeNull();

      const taken = await admin
        .patch(`/api/users/${user.id}`)
        .send({ email: 'priya@taskapp.dev' })
        .expect(409);
      expect(taken.body.code).toBe('CONFLICT');
    });

    it('answers 422 (not 500) when a required field is set to null', async () => {
      const user = await createEmployee('null.fields@taskapp.dev');
      for (const field of ['name', 'email', 'password']) {
        const res = await admin
          .patch(`/api/users/${user.id}`)
          .send({ [field]: null })
          .expect(422);
        expect(res.body.details[0].field).toBe(field);
      }
    });

    it('does not allow changing the role or sending unknown fields', async () => {
      const user = await createEmployee('fixed.role@taskapp.dev');
      const res = await admin
        .patch(`/api/users/${user.id}`)
        .send({ roleId: 1 })
        .expect(422);
      expect(res.body.details[0].field).toBe('roleId');
    });

    it('resets the password: the old one stops working and open sessions are revoked', async () => {
      const user = await createEmployee('reset.me@taskapp.dev');
      const session = await loginAgent(ctx.app, {
        email: user.email,
        password: user.password,
      });
      await admin
        .patch(`/api/users/${user.id}`)
        .send({ password: 'Brandnew456' })
        .expect(200);

      await session.post('/api/auth/refresh').expect(401);
      const http = (): ReturnType<typeof request> =>
        request(ctx.app.getHttpServer());
      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);
      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Brandnew456' })
        .expect(200);
    });

    it('soft-deletes a user: they disappear, cannot sign in or refresh, and the email stays reserved', async () => {
      const user = await createEmployee('delete.me@taskapp.dev');
      const session = await loginAgent(ctx.app, {
        email: user.email,
        password: user.password,
      });

      await admin.delete(`/api/users/${user.id}`).expect(204);

      await admin.get(`/api/users/${user.id}`).expect(404);
      const list = await admin.get('/api/users?limit=100').expect(200);
      expect(
        list.body.items.some((u: { id: number }) => u.id === user.id),
      ).toBe(false);
      await session.post('/api/auth/refresh').expect(401);
      await session.get('/api/auth/me').expect(401);
      await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);

      const roles = await admin.get('/api/roles').expect(200);
      const roleId = roles.body.find(
        (r: { code: string }) => r.code === 'EMPLOYEE',
      ).id;
      await admin
        .post('/api/users')
        .send({
          name: 'Again',
          email: user.email,
          password: 'Welcome123',
          roleId,
        })
        .expect(409);
      await admin.delete(`/api/users/${user.id}`).expect(404);
    });

    it('refuses to delete yourself', async () => {
      const myId = await userIdOf(ctx.dataSource, ADMIN.email);
      const res = await admin.delete(`/api/users/${myId}`).expect(409);
      expect(res.body.code).toBe('CONFLICT');
    });

    it('refuses to delete default (seeded) accounts, including the other admin', async () => {
      const priyaId = await userIdOf(ctx.dataSource, PRIYA.email);
      const admin2Id = await userIdOf(ctx.dataSource, 'admin2@taskapp.dev');
      for (const id of [priyaId, admin2Id]) {
        const res = await admin.delete(`/api/users/${id}`).expect(409);
        expect(res.body.message).toMatch(/default/i);
      }
      expect(
        (await admin.get(`/api/users/${priyaId}`).expect(200)).body.isDefault,
      ).toBe(true);
    });

    it('refuses to delete a user who has any task, even a completed one, until the task is gone', async () => {
      const user = await createEmployee('busy@taskapp.dev');
      expect(
        (await admin.get(`/api/users/${user.id}`).expect(200)).body.isDefault,
      ).toBe(false);
      const tasks = ctx.dataSource.getRepository(Task);
      const adminId = await userIdOf(ctx.dataSource, ADMIN.email);
      const task = await tasks.save(
        tasks.create({
          title: 'Finished work',
          description: 'x',
          priority: TaskPriority.LOW,
          status: TaskStatus.COMPLETED,
          dueDate: '2030-01-01',
          assigneeId: user.id,
          createdById: adminId,
        }),
      );

      const blocked = await admin.delete(`/api/users/${user.id}`).expect(409);
      expect(blocked.body.message).toMatch(/assigned task/i);

      await tasks.softDelete(task.id);
      await admin.delete(`/api/users/${user.id}`).expect(204);
    });
  });
});
