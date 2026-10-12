import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { Role } from '../../modules/users/entities/role.entity';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatusHistory } from '../../modules/tasks/entities/task-status-history.entity';
import { User } from '../../modules/users/entities/user.entity';
import { BCRYPT_COST } from '../../security/utils/password.constants';
import { DEMO_USERS, SAMPLE_TASKS, SEED_ROLES } from './demo-data';

/** The ordered statuses a task passes through to reach `target`, starting from PENDING. */
function pathTo(target: TaskStatus): TaskStatus[] {
  const order = [
    TaskStatus.PENDING,
    TaskStatus.IN_PROGRESS,
    TaskStatus.PENDING_APPROVAL,
    TaskStatus.COMPLETED,
  ];
  return order.slice(0, order.indexOf(target) + 1);
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Idempotent: roles and users are looked up before being created, and sample tasks are only inserted into an
 * empty table, so running the seed twice never duplicates data.
 */
export async function runSeed(
  dataSource: DataSource,
  options: { sampleTasks: boolean },
): Promise<void> {
  const roles = dataSource.getRepository(Role);
  const users = dataSource.getRepository(User);

  for (const seedRole of SEED_ROLES) {
    const existing = await roles.findOne({ where: { code: seedRole.code } });
    if (!existing) await roles.save(roles.create(seedRole));
  }

  for (const demo of DEMO_USERS) {
    const existing = await users.findOne({ where: { email: demo.email } });
    if (existing) continue;
    const role = await roles.findOneByOrFail({ code: demo.role });
    await users.save(
      users.create({
        name: demo.name,
        email: demo.email,
        phone: demo.phone,
        isDefault: true,
        roleId: role.id,
        passwordHash: await bcrypt.hash(demo.password, BCRYPT_COST),
      }),
    );
  }

  if (!options.sampleTasks) return;
  if ((await dataSource.getRepository(Task).count({ withDeleted: true })) > 0)
    return;

  const admin = await users.findOneByOrFail({ email: DEMO_USERS[0].email });
  await dataSource.transaction(async (em) => {
    for (const sample of SAMPLE_TASKS) {
      const assignee = await em
        .getRepository(User)
        .findOneByOrFail({ email: sample.assignee });
      const task = await em.getRepository(Task).save(
        em.getRepository(Task).create({
          title: sample.title,
          description: sample.description,
          priority: sample.priority,
          status: sample.status,
          dueDate: dateOffset(sample.dueInDays),
          assigneeId: assignee.id,
          createdById: admin.id,
        }),
      );

      // History mirrors what the real workflow would have written: employees do the early steps, the admin approves.
      const steps = pathTo(sample.status);
      const rows = steps.map((to, index) =>
        em.getRepository(TaskStatusHistory).create({
          taskId: task.id,
          fromStatus: index === 0 ? null : steps[index - 1],
          toStatus: to,
          actorId:
            index === 0 || to === TaskStatus.COMPLETED ? admin.id : assignee.id,
          note: null,
        }),
      );
      await em.getRepository(TaskStatusHistory).save(rows);
    }
  });
}
