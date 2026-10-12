import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { TaskStatus } from '@/types/api';

/** `YYYY-MM-DD` → "05 Jan 2030". parseISO treats a date-only string as local midnight, so the day never shifts. */
export function formatDueDate(dueDate: string): string {
  return format(parseISO(dueDate), 'dd MMM yyyy');
}

export function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'dd MMM yyyy, hh:mm a');
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

export function todayAsDateString(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

/** String comparison is correct for ISO dates. A task due today is not overdue yet, and finished work never is. */
export function isOverdue(dueDate: string, status: TaskStatus, today: string = todayAsDateString()): boolean {
  return status !== 'COMPLETED' && dueDate < today;
}
