import { STATUS_LABEL } from '@/lib/constants';
import { TaskStatus } from '@/types/api';

export interface TransitionArg {
  id: number;
  from: TaskStatus;
  to: TaskStatus;
  note?: string;
}

const isTransitionArg = (value: unknown): value is TransitionArg =>
  typeof value === 'object' && value !== null && 'from' in value && 'to' in value;

function transitionMessage(arg: unknown): string {
  if (!isTransitionArg(arg)) return 'Task status updated';
  if (arg.from === 'PENDING_APPROVAL' && arg.to === 'IN_PROGRESS') return 'Task sent back to In Progress';
  switch (arg.to) {
    case 'PENDING_APPROVAL':
      return 'Submitted for approval';
    case 'COMPLETED':
      return 'Task approved';
    default:
      return `Task moved to ${STATUS_LABEL[arg.to]}`;
  }
}

/**
 * Success toasts, keyed by RTK Query endpoint name. Every mutation must have an entry (enforced by a test); queries
 * deliberately have none, because a toast on every page load or filter change would make the UI unusable.
 */
const MESSAGES: Record<string, string | ((arg: unknown) => string)> = {
  login: 'Signed in successfully',
  logout: 'Signed out',
  createTask: 'Task created',
  updateTask: 'Task updated',
  deleteTask: 'Task deleted',
  transitionTask: transitionMessage,
  createComment: 'Comment added',
  createUser: 'User created',
  updateUser: 'User updated',
  deleteUser: 'User deleted',
};

export function successMessageFor(endpointName: string, originalArg: unknown): string | undefined {
  const entry = MESSAGES[endpointName];
  return typeof entry === 'function' ? entry(originalArg) : entry;
}
