import { Task, TaskStatus } from '@/types/api';

export const ATTENTION_LIMIT = 5;

/**
 * Statuses where the viewer is the one who has to act. Admins review submitted work; employees own work that is either
 * not started (PENDING) or sent back by a rejection (IN_PROGRESS). The task list API filters by a single status, so the
 * dashboard queries each one and merges the results.
 */
export function attentionStatuses(isAdmin: boolean): TaskStatus[] {
  return isAdmin ? ['PENDING_APPROVAL'] : ['PENDING', 'IN_PROGRESS'];
}

/** Soonest due date first (ties by id for a stable order), cut to the dashboard's size. */
export function mergeAttention(lists: ReadonlyArray<readonly Task[] | undefined>, limit: number = ATTENTION_LIMIT): Task[] {
  return lists
    .flatMap((list) => list ?? [])
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)
    .slice(0, limit);
}
