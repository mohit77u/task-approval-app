import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import {
  Paginated,
  toPaginated,
} from '../../../common/dto/pagination-query.dto';
import { RoleCode } from '../../../common/enums/role-code.enum';
import { AppException } from '../../../common/errors/app.exception';
import { rejectNullFields } from '../../../common/utils/reject-null-fields';
import { isDuplicateEntry } from '../../../common/errors/db-errors';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { Role } from '../entities/role.entity';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../entities/user.entity';
import { PasswordService } from '../../../security/services/password.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { toUserSummary, UserSummary } from '../mappers/user.mapper';

const EMAIL_TAKEN = 'A user with this email already exists';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * The live (not soft-deleted) user behind an access token, or null. Called on every authenticated request, so it is a
   * single primary-key lookup (plus the eager role join).
   */
  findSessionUser(id: number): Promise<User | null> {
    return this.users.findOne({ where: { id, deletedAt: IsNull() } });
  }

  listRoles(): Promise<Role[]> {
    return this.roles.find({ order: { id: 'ASC' } });
  }

  async list(query: ListUsersQueryDto): Promise<Paginated<UserSummary>> {
    const qb = this.users
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.role', 'role')
      .where('user.deletedAt IS NULL')
      .orderBy('user.name', 'ASC')
      .addOrderBy('user.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.roleCode)
      qb.andWhere('role.code = :roleCode', { roleCode: query.roleCode });

    const [rows, total] = await qb.getManyAndCount();
    return toPaginated(rows.map(toUserSummary), total, query.page, query.limit);
  }

  async get(id: number): Promise<UserSummary> {
    return toUserSummary(await this.findActiveOrFail(id));
  }

  async create(dto: CreateUserDto): Promise<UserSummary> {
    const role = await this.roles.findOne({ where: { id: dto.roleId } });
    if (!role)
      throw AppException.validation([
        { field: 'roleId', message: 'Unknown role' },
      ]);

    try {
      const saved = await this.users.save(
        this.users.create({
          name: dto.name,
          email: dto.email,
          phone: dto.phone ?? null,
          roleId: role.id,
          passwordHash: await this.passwords.hash(dto.password),
        }),
      );
      // Re-read so the response carries the role relation exactly like every other user payload.
      return toUserSummary(await this.users.findOneByOrFail({ id: saved.id }));
    } catch (error) {
      // The unique index is the real guard; a pre-check alone would race.
      if (isDuplicateEntry(error)) throw AppException.conflict(EMAIL_TAKEN);
      throw error;
    }
  }

  /**
   * Changes only the fields that were sent. A new password also signs the user out everywhere: refresh tokens are
   * revoked, and `passwordChangedAt` makes the auth middleware refuse access tokens issued before it.
   */
  async update(id: number, dto: UpdateUserDto): Promise<UserSummary> {
    rejectNullFields(dto, ['phone']);
    const user = await this.findActiveOrFail(id);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.password !== undefined) {
      user.passwordHash = await this.passwords.hash(dto.password);
      user.passwordChangedAt = new Date();
    }

    try {
      await this.users.save(user);
    } catch (error) {
      if (isDuplicateEntry(error)) throw AppException.conflict(EMAIL_TAKEN);
      throw error;
    }
    if (dto.password !== undefined) await this.revokeSessions(user.id);
    return toUserSummary(await this.users.findOneByOrFail({ id }));
  }

  /**
   * Soft delete, for non-default users with no tasks. The row stays so tasks, comments and history keep their authors,
   * and the email stays reserved (the unique index still covers it). Refresh tokens are revoked here and the auth
   * middleware refuses the user's access tokens from the next request on.
   *
   * Check and delete run in one transaction holding the user row's write lock. Task creation and reassignment take a
   * shared lock on the same row (see `ensureAssignableEmployee`), so a task cannot be assigned to this user between the
   * count and the delete.
   */
  async remove(actorId: number, id: number): Promise<void> {
    if (actorId === id)
      throw AppException.conflict('You cannot delete your own account');

    await this.dataSource.transaction(async (em) => {
      const user = await em.getRepository(User).findOne({
        where: { id, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
        // MySQL has no FOR UPDATE OF: joining the eager role would also lock the role row every user shares.
        loadEagerRelations: false,
      });
      if (!user) throw AppException.notFound('User');
      if (user.isDefault)
        throw AppException.conflict('Default accounts cannot be deleted');

      // Every live task counts, whatever its status (COMPLETED included), so the admin decides what happens to that
      // work first. Soft-deleted tasks do not block: the admin already removed them, and because deleting the user is
      // itself a soft delete, their history keeps a valid author. A locking read, so it sees tasks committed by
      // transactions that held the user row before us.
      const assigned = await em
        .getRepository(Task)
        .createQueryBuilder('task')
        .where('task.assigneeId = :id', { id })
        .setLock('pessimistic_read')
        .getCount();
      if (assigned > 0) {
        throw AppException.conflict(
          `This user has ${assigned} assigned task(s). Delete or reassign them before deleting the user.`,
        );
      }

      await em.getRepository(User).update(user.id, { deletedAt: new Date() });
      await this.revokeSessions(user.id, em);
    });
  }

  /**
   * Tasks can only be assigned to existing employees. Reported against the `assigneeId` field so forms can show it
   * inline. Pass the caller's transaction manager: the shared row lock then holds until that transaction commits, so a
   * concurrent user delete (which takes the write lock) either waits and then sees the new task, or wins first and this
   * read sees the user as deleted.
   */
  async ensureAssignableEmployee(
    userId: number,
    em: EntityManager,
  ): Promise<User> {
    const user = await em.getRepository(User).findOne({
      where: { id: userId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_read' },
      // Lock only the user row, not the shared role row (MySQL cannot restrict FOR SHARE to one table of a join).
      loadEagerRelations: false,
    });
    const role = user
      ? await em.getRepository(Role).findOne({ where: { id: user.roleId } })
      : null;
    if (!user || !role || role.code !== RoleCode.EMPLOYEE) {
      throw AppException.validation([
        {
          field: 'assigneeId',
          message: 'Assignee must be an existing employee',
        },
      ]);
    }
    user.role = role;
    return user;
  }

  private async findActiveOrFail(id: number): Promise<User> {
    const user = await this.users.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!user) throw AppException.notFound('User');
    return user;
  }

  private async revokeSessions(
    userId: number,
    em?: EntityManager,
  ): Promise<void> {
    const refreshTokens = em
      ? em.getRepository(RefreshToken)
      : this.refreshTokens;
    await refreshTokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
