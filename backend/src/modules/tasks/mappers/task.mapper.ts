import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { AuthUser } from '../../../common/types/request.types';
import { Task } from '../entities/task.entity';
import { User } from '../../users/entities/user.entity';
import { allowedTargets } from '../state-machine/task-state-machine';

export interface PersonRef {
  id: number;
  name: string;
  email: string;
}

export interface TaskResponse {
  id: number;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  assignee: PersonRef;
  createdBy: PersonRef;
  /** What the current viewer may move this task to. The UI renders from this and never re-implements the rules. */
  allowedTransitions: TaskStatus[];
  createdAt: Date;
  updatedAt: Date;
}

const toPersonRef = ({ id, name, email }: User): PersonRef => ({
  id,
  name,
  email,
});

export function toTaskResponse(task: Task, viewer: AuthUser): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate,
    assignee: toPersonRef(task.assignee),
    createdBy: toPersonRef(task.createdBy),
    allowedTransitions: allowedTargets(
      { role: viewer.role, isAssignee: task.assigneeId === viewer.id },
      task.status,
    ),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
