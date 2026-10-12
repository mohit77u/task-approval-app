import type { DataSource, EntityManager, Repository } from 'typeorm';
import { RoleCode } from '../../../common/enums/role-code.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AuthUser } from '../../../common/types/request.types';
import { UsersService } from '../../users/services/users.service';
import { Task } from '../entities/task.entity';
import { TaskStatusHistory } from '../entities/task-status-history.entity';
import { TasksService } from './tasks.service';

const EMPLOYEE: AuthUser = { id: 3, role: RoleCode.EMPLOYEE };
const ADMIN: AuthUser = { id: 1, role: RoleCode.ADMIN };

interface UpdateCall {
  set: Partial<Task>;
  where: string;
  params: Record<string, unknown>;
}

/** Records the guarded UPDATE and the history insert; the database itself is simulated by `affected`. */
function build(
  task: Partial<Task> | null,
  affected: number,
): {
  service: TasksService;
  updates: UpdateCall[];
  inserts: Partial<TaskStatusHistory>[];
} {
  const updates: UpdateCall[] = [];
  const inserts: Partial<TaskStatusHistory>[] = [];

  const selectBuilder = (): unknown => {
    const qb = {
      andWhere: () => qb,
      leftJoinAndSelect: () => qb,
      getOne: () =>
        Promise.resolve(
          task && {
            ...task,
            assignee: { id: 0, name: 'a', email: 'a@x' },
            createdBy: { id: 0, name: 'b', email: 'b@x' },
          },
        ),
    };
    return qb;
  };
  const updateBuilder = (): unknown => {
    const call: Partial<UpdateCall> = {};
    const qb = {
      update: () => qb,
      set: (values: Partial<Task>) => ((call.set = values), qb),
      where: (sql: string, params: Record<string, unknown>) => {
        call.where = sql;
        call.params = params;
        return qb;
      },
      execute: () => {
        updates.push(call as UpdateCall);
        return Promise.resolve({ affected });
      },
    };
    return qb;
  };
  const taskRepo = {
    createQueryBuilder: (alias?: string) =>
      alias ? selectBuilder() : updateBuilder(),
  } as unknown as Repository<Task>;
  const historyRepo = {
    insert: (row: Partial<TaskStatusHistory>) => {
      inserts.push(row);
      return Promise.resolve();
    },
  };
  const em = {
    getRepository: (entity: unknown) =>
      entity === Task ? taskRepo : historyRepo,
  } as unknown as EntityManager;
  const dataSource = {
    transaction: <T>(work: (manager: EntityManager) => Promise<T>) => work(em),
  } as unknown as DataSource;

  return {
    service: new TasksService(taskRepo, dataSource, {} as UsersService),
    updates,
    inserts,
  };
}

async function codeOf(promise: Promise<unknown>): Promise<ErrorCode> {
  try {
    await promise;
  } catch (error) {
    return (error as AppException).code;
  }
  throw new Error('expected a rejection');
}

describe('TasksService.transition', () => {
  const pending: Partial<Task> = {
    id: 10,
    status: TaskStatus.PENDING,
    assigneeId: EMPLOYEE.id,
  };

  it('guards the UPDATE on both the status and the assignee it validated against', async () => {
    const { service, updates, inserts } = build(pending, 1);
    await service.transition(EMPLOYEE, 10, { to: TaskStatus.IN_PROGRESS });

    expect(updates).toHaveLength(1);
    expect(updates[0].set).toEqual({ status: TaskStatus.IN_PROGRESS });
    expect(updates[0].where).toContain('status = :from');
    expect(updates[0].where).toContain('assignee_id = :assigneeId');
    expect(updates[0].params).toEqual({
      id: 10,
      from: TaskStatus.PENDING,
      assigneeId: EMPLOYEE.id,
    });
    expect(inserts).toEqual([
      {
        taskId: 10,
        fromStatus: TaskStatus.PENDING,
        toStatus: TaskStatus.IN_PROGRESS,
        actorId: EMPLOYEE.id,
        note: null,
      },
    ]);
  });

  it('answers STATE_CONFLICT and writes no history when the row changed underneath (status or reassignment)', async () => {
    const { service, inserts } = build(pending, 0);
    expect(
      await codeOf(
        service.transition(EMPLOYEE, 10, { to: TaskStatus.IN_PROGRESS }),
      ),
    ).toBe(ErrorCode.STATE_CONFLICT);
    expect(inserts).toHaveLength(0);
  });

  it('keeps the state-machine answers and never writes for a refused step', async () => {
    const approval: Partial<Task> = {
      id: 11,
      status: TaskStatus.PENDING_APPROVAL,
      assigneeId: EMPLOYEE.id,
    };
    const forbidden = build(approval, 1);
    expect(
      await codeOf(
        forbidden.service.transition(EMPLOYEE, 11, {
          to: TaskStatus.COMPLETED,
        }),
      ),
    ).toBe(ErrorCode.FORBIDDEN);
    expect(forbidden.updates).toHaveLength(0);

    const noNote = build(approval, 1);
    expect(
      await codeOf(
        noNote.service.transition(ADMIN, 11, { to: TaskStatus.IN_PROGRESS }),
      ),
    ).toBe(ErrorCode.VALIDATION_ERROR);

    const invalid = build(pending, 1);
    expect(
      await codeOf(
        invalid.service.transition(EMPLOYEE, 10, { to: TaskStatus.COMPLETED }),
      ),
    ).toBe(ErrorCode.INVALID_TRANSITION);
  });

  it('answers 404 when the viewer cannot see the task', async () => {
    const { service } = build(null, 1);
    expect(
      await codeOf(
        service.transition(EMPLOYEE, 99, { to: TaskStatus.IN_PROGRESS }),
      ),
    ).toBe(ErrorCode.NOT_FOUND);
  });
});
