import { TaskPriority, TaskStatus } from '@/types/api';

export const STATUS_ORDER: readonly TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED'];
export const PRIORITY_ORDER: readonly TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  PENDING_APPROVAL: 'Pending Approval',
  COMPLETED: 'Completed',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

/** Tailwind classes per status. Colors carry meaning, so each has an explicit dark-mode counterpart. */
export const STATUS_STYLES: Record<TaskStatus, string> = {
  PENDING: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
  IN_PROGRESS: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
  PENDING_APPROVAL: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  COMPLETED: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  HIGH: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
  MEDIUM: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200',
  LOW: 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
};
