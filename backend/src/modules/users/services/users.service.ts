import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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
import { PasswordService } from '../../security/services/password.service';
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
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly passwords: PasswordService,
  ) {}

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

  /** Changes only the fields that were sent. A new password also signs the user out everywhere. */
  async update(id: number, dto: UpdateUserDto): Promise<UserSummary> {
    rejectNullFields(dto, ['phone']);
    const user = await this.findActiveOrFail(id);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.password !== undefined)
      user.passwordHash = await this.passwords.hash(dto.password);

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
   * Soft delete, for non-default users with no tasks. The row stays so tasks, comments and history keep their authors, and the email stays reserved
   * (the unique index still covers it). An access token already issued lives until it expires (30 min at most);
   * refresh and sign-in are refused immediately.
   */
  async remove(actorId: number, id: number): Promise<void> {
    if (actorId === id)
      throw AppException.conflict('You cannot delete your own account');
    const user = await this.findActiveOrFail(id);
    if (user.isDefault)
      throw AppException.conflict('Default accounts cannot be deleted');

    // Any status counts, COMPLETED included: a user with task history is kept so that history stays meaningful.
    const assigned = await this.tasks.count({ where: { assigneeId: id } });
    if (assigned > 0) {
      throw AppException.conflict(
        `This user has ${assigned} assigned task(s). Delete or reassign them before deleting the user.`,
      );
    }

    await this.users.update(user.id, { deletedAt: new Date() });
    await this.revokeSessions(user.id);
  }

  /** Tasks can only be assigned to existing employees. Reported against the `assigneeId` field so forms can show it inline. */
  async ensureAssignableEmployee(userId: number): Promise<User> {
    const user = await this.users.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    if (!user || user.role.code !== RoleCode.EMPLOYEE) {
      throw AppException.validation([
        {
          field: 'assigneeId',
          message: 'Assignee must be an existing employee',
        },
      ]);
    }
    return user;
  }

  private async findActiveOrFail(id: number): Promise<User> {
    const user = await this.users.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!user) throw AppException.notFound('User');
    return user;
  }

  private async revokeSessions(userId: number): Promise<void> {
    await this.refreshTokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
