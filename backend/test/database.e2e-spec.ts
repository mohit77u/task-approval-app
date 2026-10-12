import { DEMO_USERS } from '../src/database/seeds/demo-data';
import { runSeed } from '../src/database/seeds/run-seed';
import { Role } from '../src/modules/users/entities/role.entity';
import { Task } from '../src/modules/tasks/entities/task.entity';
import { TaskStatusHistory } from '../src/modules/tasks/entities/task-status-history.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createTestApp, TestContext } from './helpers/test-app';

describe('database schema and seed', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());

  it('seeds both roles and the five demo users (2 admins, 3 employees)', async () => {
    const roles = await ctx.dataSource
      .getRepository(Role)
      .find({ order: { code: 'ASC' } });
    expect(roles.map((r) => r.code)).toEqual(['ADMIN', 'EMPLOYEE']);

    const users = await ctx.dataSource.getRepository(User).find();
    expect(users.map((u) => u.email).sort()).toEqual(
      DEMO_USERS.map((u) => u.email).sort(),
    );
    expect(users.filter((u) => u.role.code === 'ADMIN')).toHaveLength(2);
    expect(users.filter((u) => u.role.code === 'EMPLOYEE')).toHaveLength(3);
    expect(users.every((u) => u.passwordHash.startsWith('$2'))).toBe(true);
    expect(users.every((u) => Boolean(u.phone))).toBe(true);
    expect(users.every((u) => u.isDefault)).toBe(true);
  });

  it('is idempotent: running the seed twice creates no duplicates', async () => {
    await runSeed(ctx.dataSource, { sampleTasks: true });
    const tasksAfterFirst = await ctx.dataSource.getRepository(Task).count();
    const historyAfterFirst = await ctx.dataSource
      .getRepository(TaskStatusHistory)
      .count();

    await runSeed(ctx.dataSource, { sampleTasks: true });

    expect(await ctx.dataSource.getRepository(User).count()).toBe(5);
    expect(await ctx.dataSource.getRepository(Role).count()).toBe(2);
    expect(await ctx.dataSource.getRepository(Task).count()).toBe(
      tasksAfterFirst,
    );
    expect(await ctx.dataSource.getRepository(TaskStatusHistory).count()).toBe(
      historyAfterFirst,
    );
  });

  it('rejects an invalid status at the database level (native ENUM)', async () => {
    await expect(
      ctx.dataSource.query(
        "INSERT INTO tasks (title, description, priority, status, due_date, assignee_id, created_by_id) VALUES ('x','y','LOW','BOGUS','2030-01-01',1,1)",
      ),
    ).rejects.toThrow();
  });
});
