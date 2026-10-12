import type { DataSource, EntityManager, Repository } from 'typeorm';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { PasswordService } from '../../../security/services/password.service';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Role } from '../entities/role.entity';
import { User } from '../entities/user.entity';
import { UsersService } from './users.service';

const ROLE = { id: 2, code: 'EMPLOYEE', name: 'Employee' } as Role;

function user(overrides: Partial<User> = {}): User {
  return {
    id: 9,
    name: 'Temp',
    email: 'temp@x.dev',
    phone: null,
    isDefault: false,
    deletedAt: null,
    passwordHash: 'old',
    passwordChangedAt: null,
    roleId: ROLE.id,
    role: ROLE,
    ...overrides,
  } as User;
}

interface Calls {
  saved: User[];
  userUpdates: Partial<User>[];
  revokedFor: number[];
  lockModes: string[];
  inTransaction: boolean;
}

function build(options: { target: User | null; assignedTasks?: number }): {
  service: UsersService;
  calls: Calls;
} {
  const calls: Calls = {
    saved: [],
    userUpdates: [],
    revokedFor: [],
    lockModes: [],
    inTransaction: false,
  };
  const userRepo = {
    findOne: (opts: { lock?: { mode: string } }) => {
      if (opts.lock) calls.lockModes.push(opts.lock.mode);
      return Promise.resolve(options.target);
    },
    findOneByOrFail: () => Promise.resolve(options.target),
    save: (entity: User) => {
      calls.saved.push({ ...entity });
      return Promise.resolve(entity);
    },
    update: (_id: number, values: Partial<User>) => {
      calls.userUpdates.push(values);
      return Promise.resolve();
    },
  };
  const taskCount = {
    where: () => taskCount,
    setLock: (mode: string) => (calls.lockModes.push(mode), taskCount),
    getCount: () => Promise.resolve(options.assignedTasks ?? 0),
  };
  const refreshRepo = {
    update: (where: { userId: number }) => {
      calls.revokedFor.push(where.userId);
      return Promise.resolve();
    },
  };
  const em = {
    getRepository: (entity: unknown) => {
      if (entity === User) return userRepo;
      if (entity === Task) return { createQueryBuilder: () => taskCount };
      if (entity === RefreshToken) return refreshRepo;
      throw new Error('unexpected repository');
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async <T>(work: (m: EntityManager) => Promise<T>) => {
      calls.inTransaction = true;
      return work(em);
    },
  } as unknown as DataSource;
  const passwords = {
    hash: (plain: string) => Promise.resolve(`hashed:${plain}`),
  } as unknown as PasswordService;

  return {
    service: new UsersService(
      userRepo as unknown as Repository<User>,
      {} as Repository<Role>,
      refreshRepo as unknown as Repository<RefreshToken>,
      dataSource,
      passwords,
    ),
    calls,
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

describe('UsersService.update', () => {
  it('stamps passwordChangedAt and revokes refresh tokens when the password changes', async () => {
    const { service, calls } = build({ target: user() });
    const before = Date.now();
    await service.update(9, { password: 'NewPass123' });

    expect(calls.saved[0].passwordHash).toBe('hashed:NewPass123');
    expect(calls.saved[0].passwordChangedAt?.getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(calls.revokedFor).toEqual([9]);
  });

  it('leaves the session alone for other edits', async () => {
    const { service, calls } = build({ target: user() });
    await service.update(9, { name: 'Renamed' });
    expect(calls.saved[0].passwordChangedAt).toBeNull();
    expect(calls.revokedFor).toEqual([]);
  });
});

describe('UsersService.remove', () => {
  it('checks and deletes inside one transaction holding the user row lock', async () => {
    const { service, calls } = build({ target: user() });
    await service.remove(1, 9);

    expect(calls.inTransaction).toBe(true);
    expect(calls.lockModes).toEqual(['pessimistic_write', 'pessimistic_write']);
    expect(calls.userUpdates).toHaveLength(1);
    expect(calls.userUpdates[0].deletedAt).toBeInstanceOf(Date);
    expect(calls.revokedFor).toEqual([9]);
  });

  it('refuses a user who still has live tasks, and deletes nothing', async () => {
    const { service, calls } = build({ target: user(), assignedTasks: 2 });
    expect(await codeOf(service.remove(1, 9))).toBe(ErrorCode.CONFLICT);
    expect(calls.userUpdates).toHaveLength(0);
    expect(calls.revokedFor).toHaveLength(0);
  });

  it('refuses self-deletion, default accounts and unknown users', async () => {
    expect(await codeOf(build({ target: user() }).service.remove(9, 9))).toBe(
      ErrorCode.CONFLICT,
    );
    expect(
      await codeOf(
        build({ target: user({ isDefault: true }) }).service.remove(1, 9),
      ),
    ).toBe(ErrorCode.CONFLICT);
    expect(await codeOf(build({ target: null }).service.remove(1, 9))).toBe(
      ErrorCode.NOT_FOUND,
    );
  });
});
