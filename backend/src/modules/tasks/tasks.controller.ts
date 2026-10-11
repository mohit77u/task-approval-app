import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { RoleCode } from '../../common/enums/role-code.enum';
import type { AuthUser } from '../../common/types/request.types';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponse } from './task.mapper';
import { HistoryEntry, TasksService } from './tasks.service';
import { TransitionTaskDto } from './dto/transition-task.dto';

/** A malformed id is a validation problem (422), not a missing resource. */
export const TaskIdPipe = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTasksQueryDto): Promise<Paginated<TaskResponse>> {
    return this.tasks.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number): Promise<TaskResponse> {
    return this.tasks.getResponse(user, id);
  }

  @Roles(RoleCode.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto): Promise<TaskResponse> {
    return this.tasks.create(user, dto);
  }

  @Roles(RoleCode.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number, @Body() dto: UpdateTaskDto): Promise<TaskResponse> {
    return this.tasks.update(user, id, dto);
  }

  @Roles(RoleCode.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number): Promise<void> {
    return this.tasks.remove(user, id);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  transition(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number, @Body() dto: TransitionTaskDto): Promise<TaskResponse> {
    return this.tasks.transition(user, id, dto);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id', TaskIdPipe) id: number): Promise<HistoryEntry[]> {
    return this.tasks.listHistory(user, id);
  }
}
