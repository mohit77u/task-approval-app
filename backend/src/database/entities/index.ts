import { RefreshToken } from './refresh-token.entity';
import { Role } from './role.entity';
import { TaskComment } from './task-comment.entity';
import { TaskStatusHistory } from './task-status-history.entity';
import { Task } from './task.entity';
import { User } from './user.entity';

export { RefreshToken, Role, Task, TaskComment, TaskStatusHistory, User };
export const ENTITIES = [
  Role,
  User,
  Task,
  TaskComment,
  TaskStatusHistory,
  RefreshToken,
];
