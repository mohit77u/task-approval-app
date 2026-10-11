import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Paginated, toPaginated } from '../../common/dto/pagination-query.dto';
import { RoleCode } from '../../common/enums/role-code.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { AppException } from '../../common/errors/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { escapeLike } from '../../common/utils/escape-like';
import { Task, TaskStatusHistory } from '../../database/entities';
import { UsersService } from '../users/users.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponse, toTaskResponse } from './task.mapper';
import { evaluateTransition, TransitionDecision } from './task-state-machine';
import { TransitionTaskDto } from './dto/transition-task.dto';

export interface HistoryEntry {
  id: number;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  note: string | null;
  actor: { id: number; name: string };
  createdAt: Date;
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UsersService,
  ) {}

  /**
   * The single definition of "which tasks may this viewer see". Employees only see tasks assigned to them; everything
   * that reads tasks (list, detail, comments, history, dashboard) starts from this query so the rules cannot drift.
   * Callers must add further conditions with andWhere, never where, or the scope would be overwritten.
   */
  createScopedQuery(user: AuthUser): SelectQueryBuilder<Task> {
    const qb = this.tasks.createQueryBuilder('task');
    if (user.role === RoleCode.EMPLOYEE)
      qb.andWhere('task.assigneeId = :scopeUserId', { scopeUserId: user.id });
    return qb;
  }

  async list(
    user: AuthUser,
    query: ListTasksQueryDto,
  ): Promise<Paginated<TaskResponse>> {
    const qb = this.createScopedQuery(user)
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.createdBy', 'createdBy');

    if (query.status)
      qb.andWhere('task.status = :status', { status: query.status });
    if (query.priority)
      qb.andWhere('task.priority = :priority', { priority: query.priority });
    if (query.assigneeId && user.role === RoleCode.ADMIN)
      qb.andWhere('task.assigneeId = :assigneeId', {
        assigneeId: query.assigneeId,
      });
    if (query.search)
      qb.andWhere('task.title LIKE :search', {
        search: `%${escapeLike(query.search)}%`,
      });

    qb.orderBy('task.createdAt', 'DESC')
      .addOrderBy('task.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return toPaginated(
      rows.map((task) => toTaskResponse(task, user)),
      total,
      query.page,
      query.limit,
    );
  }

  /** Loads a task the viewer is allowed to see, or throws 404 (never 403) so other people's task ids are not revealed. */
  async getForViewer(user: AuthUser, id: number): Promise<Task> {
    const task = await this.createScopedQuery(user)
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .andWhere('task.id = :id', { id })
      .getOne();
    if (!task) throw AppException.notFound('Task');
    return task;
  }

  async getResponse(user: AuthUser, id: number): Promise<TaskResponse> {
    return toTaskResponse(await this.getForViewer(user, id), user);
  }

  async create(admin: AuthUser, dto: CreateTaskDto): Promise<TaskResponse> {
    await this.users.ensureAssignableEmployee(dto.assigneeId);

    const id = await this.dataSource.transaction(async (em) => {
      const task = await em.getRepository(Task).save(
        em.getRepository(Task).create({
          ...dto,
          status: TaskStatus.PENDING,
          createdById: admin.id,
        }),
      );
      await em.getRepository(TaskStatusHistory).insert({
        taskId: task.id,
        fromStatus: null,
        toStatus: TaskStatus.PENDING,
        actorId: admin.id,
        note: null,
      });
      return task.id;
    });
    return this.getResponse(admin, id);
  }

  async update(
    admin: AuthUser,
    id: number,
    dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    const task = await this.getForViewer(admin, id);
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length === 0) return toTaskResponse(task, admin);

    if (dto.assigneeId !== undefined && dto.assigneeId !== task.assigneeId) {
      await this.users.ensureAssignableEmployee(dto.assigneeId);
    }

    // The status guard lives in the UPDATE itself, so an edit cannot slip in after a concurrent approval.
    const result = await this.tasks
      .createQueryBuilder()
      .update()
      .set(changes)
      .where('id = :id AND status <> :completed AND deleted_at IS NULL', {
        id,
        completed: TaskStatus.COMPLETED,
      })
      .execute();
    if (result.affected !== 1)
      throw AppException.stateConflict('Completed tasks cannot be edited');

    return this.getResponse(admin, id);
  }

  async remove(admin: AuthUser, id: number): Promise<void> {
    await this.getForViewer(admin, id);
    await this.tasks.softDelete(id);
  }

  async transition(
    user: AuthUser,
    id: number,
    dto: TransitionTaskDto,
  ): Promise<TaskResponse> {
    const task = await this.getForViewer(user, id);

    const decision = evaluateTransition({
      role: user.role,
      isAssignee: task.assigneeId === user.id,
      from: task.status,
      to: dto.to,
      note: dto.note,
    });
    if (!decision.allowed)
      throw this.toTransitionException(decision, task.status, dto.to);

    const from = task.status;
    const note = dto.note?.trim() || null;

    await this.dataSource.transaction(async (em) => {
      // Compare-and-set on the status we validated against. If anyone changed the task since we read it, zero rows
      // match and we fail instead of writing a history row for a transition that did not happen.
      const result = await em
        .getRepository(Task)
        .createQueryBuilder()
        .update()
        .set({ status: dto.to })
        .where('id = :id AND status = :from AND deleted_at IS NULL', {
          id,
          from,
        })
        .execute();
      if (result.affected !== 1) {
        throw AppException.stateConflict(
          'This task was just updated by someone else. Please refresh and try again.',
        );
      }
      await em.getRepository(TaskStatusHistory).insert({
        taskId: id,
        fromStatus: from,
        toStatus: dto.to,
        actorId: user.id,
        note,
      });
    });

    return this.getResponse(user, id);
  }

  async listHistory(user: AuthUser, id: number): Promise<HistoryEntry[]> {
    await this.getForViewer(user, id);
    const rows = await this.dataSource
      .getRepository(TaskStatusHistory)
      .createQueryBuilder('history')
      .innerJoinAndSelect('history.actor', 'actor')
      .where('history.taskId = :id', { id })
      .orderBy('history.createdAt', 'ASC')
      .addOrderBy('history.id', 'ASC')
      .getMany();

    return rows.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      actor: { id: row.actor.id, name: row.actor.name },
      createdAt: row.createdAt,
    }));
  }

  private toTransitionException(
    decision: Extract<TransitionDecision, { allowed: false }>,
    from: TaskStatus,
    to: TaskStatus,
  ): AppException {
    switch (decision.reason) {
      case 'INVALID_TRANSITION':
        return AppException.invalidTransition(
          `A task cannot move from ${from} to ${to}`,
        );
      case 'NOTE_REQUIRED':
        return AppException.validation([
          {
            field: 'note',
            message: 'A reason is required when rejecting a task',
          },
        ]);
      case 'FORBIDDEN':
        return AppException.forbidden(
          'You are not allowed to make this status change',
        );
    }
  }
}
