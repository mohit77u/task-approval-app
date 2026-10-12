import { PRIORITY_ORDER, STATUS_ORDER } from '@/lib/constants';
import type { TaskFilters } from '@/services/api/tasksApi';
import { TaskPriority, TaskStatus } from '@/types/api';

export const PAGE_SIZE = 10;
const MAX_SEARCH_LENGTH = 100;

interface ParamReader {
  get(name: string): string | null;
}

function positiveInt(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed >= 1 ? parsed : undefined;
}

/** Filters live in the URL, which anyone can edit, so every value is validated and bad ones are dropped. */
export function parseTaskFilters(params: ParamReader): TaskFilters & { page: number } {
  const status = params.get('status');
  const priority = params.get('priority');
  const search = params.get('search')?.trim();
  const assigneeId = positiveInt(params.get('assigneeId'));

  return {
    ...(STATUS_ORDER.includes(status as TaskStatus) ? { status: status as TaskStatus } : {}),
    ...(PRIORITY_ORDER.includes(priority as TaskPriority) ? { priority: priority as TaskPriority } : {}),
    ...(assigneeId ? { assigneeId } : {}),
    ...(search && search.length <= MAX_SEARCH_LENGTH ? { search } : {}),
    page: positiveInt(params.get('page')) ?? 1,
  };
}

/** Inverse of parseTaskFilters. Defaults (page 1, empty values) are left out to keep URLs short and canonical. */
export function toSearchString(filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.assigneeId) params.set('assigneeId', String(filters.assigneeId));
  if (filters.search) params.set('search', filters.search);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

export function hasActiveFilters(filters: TaskFilters): boolean {
  return Boolean(filters.status || filters.priority || filters.assigneeId || filters.search);
}
