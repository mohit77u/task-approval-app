# Frontend Features Implementation Plan (Plan 4 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every screen: dashboard, task list with debounced URL-synced filters, create/edit dialog, task detail with the confirmed status dropdown, comments and history, the admin users page (create, edit, delete), and a Playwright smoke test of the reviewer workflow.

**Architecture:** Pages are thin client components that compose small, single-purpose components. All server state comes from RTK Query hooks; filters live in the URL (so refresh and sharing work) and are parsed/serialised by pure, unit-tested functions. Workflow permissions come from the backend's `allowedTransitions`; the UI renders them and adds confirmation.

**Tech Stack:** Next.js App Router, React 19, RTK Query, React Hook Form + zod, shadcn/ui, date-fns, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-task-approval-design.md` · **Depends on:** Plan 03 (shell, API layer, hooks) and the backend from Plans 01–02.

## Global Constraints

- Same constraints as Plan 03 (strict TS, no `any`, relative `/api`, central toasts, no polling, debounce 300 ms, comments explain *why*).
- Search input is debounced 300 ms and written to the URL; every filter change resets to page 1; only an explicit page change keeps the page.
- Status changes happen only through the status dropdown with a confirmation dialog; rejecting requires a reason. Cancel leaves the task untouched and makes no API call.
- Controls that trigger a request are disabled while it is pending.
- Only the backend's `allowedTransitions` decides which statuses are selectable.
- Page size for the task list is 10.

## Review Focus

1. Typing quickly in search issues one request, not one per keystroke, and clearing filters via Reset does not get overridden by a stale debounced value (Task 16).
2. URL filter values that are invalid (`?status=DONE`, `?page=-3`, 300-character search) are ignored instead of breaking the page (Task 16).
3. Cancelling the confirmation leaves the dropdown on the old status with no request (Task 17).
4. A due date of *today* is not overdue; a completed task is never shown as overdue (Task 15 helpers).
5. Deleting the last task on page N does not leave the user on an empty page (Task 16).
6. A non-admin who opens `/users` sees a clear "Admins only" state, and the backend would refuse the call anyway (Task 18).

---

## File Structure

```
frontend/src/
  lib/{dates,statusHints,taskFilters,text}.ts   (+ .test.ts for the first three)
  hooks/useTaskFilters.ts
  components/
    common/Pagination.tsx
    dashboard/{StatusCard,AttentionList}.tsx
    tasks/{TaskFilterBar,TasksTable,TaskFormDialog,TaskStatusControl,CommentsPanel,HistoryTimeline,TaskDetails}.tsx
    users/{UsersTable,UserFormDialog}.tsx
  app/(app)/
    dashboard/page.tsx
    tasks/page.tsx  tasks/[id]/page.tsx
    users/page.tsx
frontend/
  playwright.config.ts  e2e/workflow.spec.ts
```

---

### Task 15: Pure helpers and the dashboard

**Files:**
- Create: `frontend/src/lib/{dates,statusHints,taskFilters,text}.ts`
- Test: `frontend/src/lib/dates.test.ts`, `frontend/src/lib/statusHints.test.ts`, `frontend/src/lib/taskFilters.test.ts`
- Create: `frontend/src/components/dashboard/{StatusCard,AttentionList}.tsx`, `frontend/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Produces:
  - `formatDueDate(d: string): string`, `formatDateTime(iso: string): string`, `formatRelative(iso: string): string`, `isOverdue(dueDate: string, status: TaskStatus, today?: string): boolean`
  - `transitionCopy(from, to): TransitionCopy`, `statusHint(task, role): string | null`
  - `parseTaskFilters(params): TaskFilters`, `toSearchString(filters): string`, `hasActiveFilters(filters): boolean`, `PAGE_SIZE = 10`
  - `initialsOf(name: string): string`

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatDueDate, isOverdue } from './dates';

describe('formatDueDate', () => {
  it('formats a calendar date without shifting it across time zones', () => {
    expect(formatDueDate('2030-01-05')).toBe('05 Jan 2030');
    expect(formatDueDate('2030-12-31')).toBe('31 Dec 2030');
  });
});

describe('isOverdue', () => {
  const today = '2030-06-15';

  it('is overdue only when the due date is before today and the task is not completed', () => {
    expect(isOverdue('2030-06-14', 'IN_PROGRESS', today)).toBe(true);
    expect(isOverdue('2030-06-14', 'PENDING_APPROVAL', today)).toBe(true);
  });

  it('is not overdue on the due date itself', () => {
    expect(isOverdue('2030-06-15', 'PENDING', today)).toBe(false);
  });

  it('is not overdue in the future or once completed', () => {
    expect(isOverdue('2030-06-16', 'PENDING', today)).toBe(false);
    expect(isOverdue('2020-01-01', 'COMPLETED', today)).toBe(false);
  });
});
```
`frontend/src/lib/statusHints.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { statusHint, transitionCopy } from './statusHints';

const assignee = { id: 2, name: 'Priya Sharma', email: 'priya@taskapp.dev' };

describe('transitionCopy', () => {
  it('asks for a required reason when rejecting', () => {
    const copy = transitionCopy('PENDING_APPROVAL', 'IN_PROGRESS');
    expect(copy).toMatchObject({ confirmLabel: 'Reject', destructive: true, note: { required: true } });
    expect(copy.note.label).toMatch(/reason/i);
  });

  it('words each normal step and keeps the note optional', () => {
    expect(transitionCopy('PENDING', 'IN_PROGRESS')).toMatchObject({ confirmLabel: 'Start', destructive: false, note: { required: false } });
    expect(transitionCopy('IN_PROGRESS', 'PENDING_APPROVAL')).toMatchObject({ confirmLabel: 'Submit' });
    expect(transitionCopy('PENDING_APPROVAL', 'COMPLETED')).toMatchObject({ confirmLabel: 'Approve' });
  });

  it('always states the from → to change in the description', () => {
    expect(transitionCopy('PENDING', 'IN_PROGRESS').description).toContain('Pending → In Progress');
    expect(transitionCopy('PENDING_APPROVAL', 'COMPLETED').description).toContain('Pending Approval → Completed');
  });
});

describe('statusHint', () => {
  it('stays silent when the viewer can act', () => {
    expect(statusHint({ status: 'PENDING', allowedTransitions: ['IN_PROGRESS'], assignee }, 'EMPLOYEE')).toBeNull();
  });

  it('explains why nothing can be changed', () => {
    expect(statusHint({ status: 'COMPLETED', allowedTransitions: [], assignee }, 'ADMIN')).toBe('Completed tasks are final.');
    expect(statusHint({ status: 'IN_PROGRESS', allowedTransitions: [], assignee }, 'ADMIN')).toContain('Priya Sharma');
    expect(statusHint({ status: 'PENDING_APPROVAL', allowedTransitions: [], assignee }, 'EMPLOYEE')).toMatch(/admin/i);
  });
});
```
`frontend/src/lib/taskFilters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { hasActiveFilters, parseTaskFilters, toSearchString } from './taskFilters';

const parse = (query: string) => parseTaskFilters(new URLSearchParams(query));

describe('parseTaskFilters', () => {
  it('reads valid values', () => {
    expect(parse('status=IN_PROGRESS&priority=HIGH&assigneeId=3&search=report&page=2')).toEqual({
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assigneeId: 3,
      search: 'report',
      page: 2,
    });
  });

  it('defaults to page 1 and no filters', () => {
    expect(parse('')).toEqual({ page: 1 });
  });

  it('ignores invalid values instead of breaking the page', () => {
    expect(parse('status=DONE&priority=URGENT&assigneeId=abc&page=-3&search=')).toEqual({ page: 1 });
    expect(parse('page=0')).toEqual({ page: 1 });
    expect(parse('assigneeId=-1')).toEqual({ page: 1 });
    expect(parse(`search=${'x'.repeat(101)}`)).toEqual({ page: 1 });
  });

  it('trims the search text', () => {
    expect(parse('search=%20%20budget%20%20')).toEqual({ page: 1, search: 'budget' });
  });
});

describe('toSearchString', () => {
  it('omits defaults and empty values', () => {
    expect(toSearchString({ page: 1 })).toBe('');
    expect(toSearchString({ page: 1, status: undefined, search: '' })).toBe('');
  });

  it('round-trips through parse', () => {
    const filters = { status: 'PENDING' as const, priority: 'LOW' as const, assigneeId: 4, search: '100% done', page: 3 };
    expect(parse(toSearchString(filters))).toEqual(filters);
  });
});

describe('hasActiveFilters', () => {
  it('ignores the page number', () => {
    expect(hasActiveFilters({ page: 5 })).toBe(false);
    expect(hasActiveFilters({ page: 1, priority: 'HIGH' })).toBe(true);
    expect(hasActiveFilters({ page: 1, search: 'x' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd frontend && npx vitest run src/lib`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the helpers**

`frontend/src/lib/dates.ts`:
```ts
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
```
`frontend/src/lib/text.ts`:
```ts
/** "Priya Sharma" → "PS". Used for avatar fallbacks. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
```
`frontend/src/lib/statusHints.ts`:
```ts
import { STATUS_LABEL } from '@/lib/constants';
import { PersonRef, RoleCode, Task, TaskStatus } from '@/types/api';

export interface TransitionCopy {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  note: { label: string; required: boolean; placeholder?: string };
}

const OPTIONAL_NOTE = { label: 'Note (optional)', required: false, placeholder: 'Add context for the history log' } as const;

/** Wording for the confirmation dialog of each workflow step. The from → to line is always shown so nothing changes silently. */
export function transitionCopy(from: TaskStatus, to: TaskStatus): TransitionCopy {
  const change = `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}`;

  if (from === 'PENDING_APPROVAL' && to === 'IN_PROGRESS') {
    return {
      title: 'Send this task back to In Progress?',
      description: `${change}. The assignee will see your reason and can resubmit.`,
      confirmLabel: 'Reject',
      destructive: true,
      note: { label: 'Reason for rejection', required: true, placeholder: 'What needs to change?' },
    };
  }
  if (from === 'PENDING_APPROVAL' && to === 'COMPLETED') {
    return { title: 'Approve this task?', description: `${change}. Completed tasks cannot be changed afterwards.`, confirmLabel: 'Approve', destructive: false, note: OPTIONAL_NOTE };
  }
  if (from === 'IN_PROGRESS' && to === 'PENDING_APPROVAL') {
    return { title: 'Submit for approval?', description: `${change}. An admin will review your work.`, confirmLabel: 'Submit', destructive: false, note: OPTIONAL_NOTE };
  }
  if (from === 'PENDING' && to === 'IN_PROGRESS') {
    return { title: 'Start working on this task?', description: change, confirmLabel: 'Start', destructive: false, note: OPTIONAL_NOTE };
  }
  return { title: `Move task to ${STATUS_LABEL[to]}?`, description: change, confirmLabel: 'Confirm', destructive: false, note: OPTIONAL_NOTE };
}

type HintTask = Pick<Task, 'status' | 'allowedTransitions'> & { assignee: PersonRef };

/** Explains, in plain words, why the status dropdown is disabled. Null when the viewer can act. */
export function statusHint(task: HintTask, role: RoleCode | undefined): string | null {
  if (task.status === 'COMPLETED') return 'Completed tasks are final.';
  if (task.allowedTransitions.length > 0) return null;
  if (role === 'ADMIN') return `Waiting for ${task.assignee.name}. Only the assignee can move this task forward.`;
  if (role === 'EMPLOYEE' && task.status === 'PENDING_APPROVAL') return 'Waiting for an admin to approve or reject this task.';
  return null;
}
```
`frontend/src/lib/taskFilters.ts`:
```ts
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
```

- [ ] **Step 4: Run helper tests**

Run: `cd frontend && npx vitest run src/lib`
Expected: PASS (dates 5, statusHints 5, taskFilters 7, plus earlier suites).

- [ ] **Step 5: Dashboard components and page**

`frontend/src/components/dashboard/StatusCard.tsx`:
```tsx
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { STATUS_LABEL, STATUS_STYLES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { TaskStatus } from '@/types/api';

/** One status count. The whole card links to the task list filtered to that status. */
export function StatusCard({ status, count }: { status: TaskStatus; count: number }): React.JSX.Element {
  return (
    <Link href={`/tasks?status=${status}`} aria-label={`${STATUS_LABEL[status]}: ${count} tasks`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="space-y-3 p-5">
          <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status])}>{STATUS_LABEL[status]}</span>
          <p className="text-4xl font-semibold tabular-nums">{count}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
```
`frontend/src/components/dashboard/AttentionList.tsx`:
```tsx
import Link from 'next/link';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDueDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Task } from '@/types/api';

interface AttentionListProps {
  title: string;
  description: string;
  tasks: Task[];
  viewAllHref: string;
  showAssignee: boolean;
}

export function AttentionList({ title, description, tasks, viewAllHref, showAssignee }: AttentionListProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Link href={viewAllHref} className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs your attention right now.</p>
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link href={`/tasks/${task.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{task.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {showAssignee && `${task.assignee.name} · `}
                      <span className={cn(isOverdue(task.dueDate, task.status) && 'font-medium text-destructive')}>Due {formatDueDate(task.dueDate)}</span>
                    </span>
                  </span>
                  <PriorityBadge priority={task.priority} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```
`frontend/src/app/(app)/dashboard/page.tsx`:
```tsx
'use client';

import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { AttentionList } from '@/components/dashboard/AttentionList';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { STATUS_ORDER } from '@/lib/constants';
import { useGetDashboardQuery } from '@/services/api/dashboardApi';
import { useListTasksQuery } from '@/services/api/tasksApi';

export default function DashboardPage(): React.JSX.Element {
  const { user, isAdmin } = useAuth();
  const dashboard = useGetDashboardQuery();
  // Admins act on submitted work; employees act on tasks they have not started yet.
  const attentionStatus = isAdmin ? 'PENDING_APPROVAL' : 'PENDING';
  const attention = useListTasksQuery({ status: attentionStatus, page: 1, limit: 5 });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={isAdmin ? 'Overview of every task in the system.' : `Your assigned tasks, ${user?.name.split(' ')[0] ?? ''}.`}
      />

      {dashboard.isError ? (
        <ErrorState message={dashboard.error.message} onRetry={() => void dashboard.refetch()} />
      ) : (
        <section aria-label="Tasks by status" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATUS_ORDER.map((status) =>
            dashboard.data ? <StatusCard key={status} status={status} count={dashboard.data.counts[status]} /> : <Skeleton key={status} className="h-[118px] rounded-xl" />,
          )}
        </section>
      )}

      <div className="mt-8">
        {attention.isError ? (
          <ErrorState message={attention.error.message} onRetry={() => void attention.refetch()} />
        ) : attention.data ? (
          <AttentionList
            title={isAdmin ? 'Awaiting your approval' : 'Waiting for you to start'}
            description={isAdmin ? 'Tasks employees have submitted for review.' : 'Assigned to you and not started yet.'}
            tasks={attention.data.items}
            viewAllHref={`/tasks?status=${attentionStatus}`}
            showAssignee={isAdmin}
          />
        ) : (
          <Skeleton className="h-56 rounded-xl" />
        )}
      </div>
    </div>
  );
}
```
`useGetDashboardQuery().error` is typed `ApiError` because the custom `baseQuery` declares it, so `.message` is safe.

- [ ] **Step 6: Verify and commit**

Run: `cd frontend && npx vitest run && npm run typecheck && npm run lint`
Expected: PASS. Manual: sign in as Admin and Priya in separate browsers; the four cards show counts consistent with the seed data (Admin sees all 8 sample tasks; Priya sees only her 4), clicking a card goes to `/tasks?status=…` (404 until Task 16).
```bash
git add frontend
git commit -m "feat(frontend): add date/status/filter helpers and the dashboard"
```

---

### Task 16: Task list, filters and create/edit dialog

**Files:**
- Create: `frontend/src/hooks/useTaskFilters.ts`
- Create: `frontend/src/components/common/Pagination.tsx`
- Create: `frontend/src/components/tasks/{TaskFilterBar,TasksTable,TaskFormDialog}.tsx`
- Create: `frontend/src/app/(app)/tasks/page.tsx`

**Interfaces:**
- Consumes: `parseTaskFilters`, `toSearchString`, `useDebouncedValue`, tasks/users APIs, `useConfirm`, `useApiAction`, `applyFieldErrors`
- Produces:
  - `useTaskFilters(): { filters; searchInput; setSearchInput; setFilter; setPage; reset }`
  - `<TaskFormDialog open onOpenChange task? />` (create when `task` is undefined)
  - `<Pagination page totalPages total onPageChange disabled? />`

- [ ] **Step 1: The filters hook**

`frontend/src/hooks/useTaskFilters.ts`:
```ts
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseTaskFilters, toSearchString } from '@/lib/taskFilters';
import type { TaskFilters } from '@/services/api/tasksApi';
import { useDebouncedValue } from './useDebouncedValue';

type FilterKey = 'status' | 'priority' | 'assigneeId';

/**
 * Task-list filters, stored in the URL so refresh, back/forward and shared links all work. Search typing is debounced
 * before it reaches the URL (and therefore before it triggers a request).
 */
export function useTaskFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseTaskFilters(searchParams), [searchParams]);

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const update = useCallback(
    (changes: Partial<TaskFilters>) => {
      const next: TaskFilters = { ...parseTaskFilters(searchParams), ...changes };
      // Changing any filter starts again from the first page; only an explicit page change keeps it.
      if (!('page' in changes)) next.page = 1;
      const query = toSearchString(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // The debounce effect must not re-run just because `update` changed identity (it does on every URL change), or a stale
  // debounced value would overwrite a Reset. Keep the latest `update` in a ref and depend only on the debounced text.
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  // The last search text this hook knows the URL to have. Distinguishes our own URL writes from external changes.
  const appliedSearch = useRef(filters.search ?? '');

  useEffect(() => {
    const next = debouncedSearch.trim();
    if (next === appliedSearch.current) return;
    appliedSearch.current = next;
    updateRef.current({ search: next || undefined });
  }, [debouncedSearch]);

  // External URL change (Reset button, browser back): mirror it into the input.
  useEffect(() => {
    const external = filters.search ?? '';
    if (external !== appliedSearch.current) {
      appliedSearch.current = external;
      setSearchInput(external);
    }
  }, [filters.search]);

  const setFilter = useCallback(
    (key: FilterKey, value: string | number | undefined) => update({ [key]: value } as Partial<TaskFilters>),
    [update],
  );
  const setPage = useCallback((page: number) => update({ page }), [update]);
  const reset = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  return { filters, searchInput, setSearchInput, setFilter, setPage, reset };
}
```

- [ ] **Step 2: Pagination and filter bar**

`frontend/src/components/common/Pagination.tsx`:
```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  /** Singular name of the listed thing, used in "12 tasks". */
  noun?: string;
}

export function Pagination({ page, totalPages, total, onPageChange, disabled, noun = 'task' }: PaginationProps): React.JSX.Element {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-4">
      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? noun : `${noun}s`} · Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
```
`frontend/src/components/tasks/TaskFilterBar.tsx`:
```tsx
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER } from '@/lib/constants';
import type { TaskFilters } from '@/services/api/tasksApi';
import { User } from '@/types/api';

const ALL = 'ALL';

interface FilterSelectProps {
  label: string;
  placeholder: string;
  value: string | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}

/** Radix Select cannot hold an empty value, so "no filter" is represented by a sentinel and mapped back to undefined. */
function FilterSelect({ label, placeholder, value, options, onChange }: FilterSelectProps): React.JSX.Element {
  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : next)}>
      <SelectTrigger aria-label={label} className="w-full sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface TaskFilterBarProps {
  filters: TaskFilters;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (key: 'status' | 'priority' | 'assigneeId', value: string | number | undefined) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  /** Present only for admins. */
  employees?: User[];
}

export function TaskFilterBar({ filters, searchInput, onSearchChange, onFilterChange, onReset, hasActiveFilters, employees }: TaskFilterBarProps): React.JSX.Element {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search tasks"
          placeholder="Search by title…"
          className="pl-9"
          maxLength={100}
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <FilterSelect
        label="Status"
        placeholder="All statuses"
        value={filters.status}
        options={STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABEL[status] }))}
        onChange={(value) => onFilterChange('status', value)}
      />
      <FilterSelect
        label="Priority"
        placeholder="All priorities"
        value={filters.priority}
        options={PRIORITY_ORDER.map((priority) => ({ value: priority, label: PRIORITY_LABEL[priority] }))}
        onChange={(value) => onFilterChange('priority', value)}
      />
      {employees && (
        <FilterSelect
          label="Employee"
          placeholder="All employees"
          value={filters.assigneeId ? String(filters.assigneeId) : undefined}
          options={employees.map((employee) => ({ value: String(employee.id), label: employee.name }))}
          onChange={(value) => onFilterChange('assigneeId', value ? Number(value) : undefined)}
        />
      )}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X className="mr-1 h-4 w-4" aria-hidden />
          Reset
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Table**

`frontend/src/components/tasks/TasksTable.tsx`:
```tsx
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDueDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Task } from '@/types/api';

interface TasksTableProps {
  tasks: Task[];
  isAdmin: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TasksTable({ tasks, isAdmin, onEdit, onDelete }: TasksTableProps): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            {isAdmin && <TableHead>Assignee</TableHead>}
            <TableHead>Due</TableHead>
            {isAdmin && (
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDate, task.status);
            return (
              <TableRow key={task.id}>
                <TableCell className="max-w-[18rem] font-medium">
                  <Link href={`/tasks/${task.id}`} className="block truncate hover:underline">
                    {task.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={task.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={task.status} />
                </TableCell>
                {isAdmin && <TableCell className="whitespace-nowrap">{task.assignee.name}</TableCell>}
                <TableCell className={cn('whitespace-nowrap', overdue && 'font-medium text-destructive')}>
                  {formatDueDate(task.dueDate)}
                  {overdue && <span className="ml-1 text-xs">(overdue)</span>}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${task.title}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={task.status === 'COMPLETED'} onSelect={() => onEdit(task)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(task)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Create/edit dialog**

`frontend/src/components/tasks/TaskFormDialog.tsx`:
```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { applyFieldErrors, useApiAction } from '@/hooks/useApiAction';
import { PRIORITY_LABEL, PRIORITY_ORDER } from '@/lib/constants';
import { useCreateTaskMutation, useUpdateTaskMutation } from '@/services/api/tasksApi';
import { useListUsersQuery } from '@/services/api/usersApi';
import { Task } from '@/types/api';

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200, 'Keep the title under 200 characters'),
  description: z.string().trim().min(1, 'Enter a description').max(5000, 'Keep the description under 5000 characters'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date'),
  // Kept as a string because the Select works with strings; converted to a number on submit.
  assigneeId: z.string().min(1, 'Choose an employee'),
});
type FormValues = z.infer<typeof schema>;

const FIELDS = ['title', 'description', 'priority', 'dueDate', 'assigneeId'] as const;

function FieldError({ message }: { message?: string }): React.JSX.Element | null {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

function TaskForm({ task, onDone }: { task?: Task; onDone: () => void }): React.JSX.Element {
  const [createTask] = useCreateTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const employees = useListUsersQuery({ roleCode: 'EMPLOYEE', limit: 100 });
  const { run, isPending } = useApiAction();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      priority: task?.priority ?? 'MEDIUM',
      dueDate: task?.dueDate ?? '',
      assigneeId: task ? String(task.assignee.id) : '',
    },
  });
  const { errors } = form.formState;

  const onSubmit = async (values: FormValues): Promise<void> => {
    const input = { ...values, assigneeId: Number(values.assigneeId) };
    const result = await run(() => (task ? updateTask({ id: task.id, changes: input }).unwrap() : createTask(input).unwrap()));
    if (result.ok) onDone();
    else applyFieldErrors(result.error, form.setError, FIELDS);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" maxLength={200} aria-invalid={Boolean(errors.title)} {...form.register('title')} />
        <FieldError message={errors.title?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={4} aria-invalid={Boolean(errors.description)} {...form.register('description')} />
        <FieldError message={errors.description?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_ORDER.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {PRIORITY_LABEL[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.priority?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" type="date" aria-invalid={Boolean(errors.dueDate)} {...form.register('dueDate')} />
          <FieldError message={errors.dueDate?.message} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="assigneeId">Assignee</Label>
        <Controller
          control={form.control}
          name="assigneeId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={employees.isLoading}>
              <SelectTrigger id="assigneeId">
                <SelectValue placeholder={employees.isLoading ? 'Loading employees…' : 'Select an employee'} />
              </SelectTrigger>
              <SelectContent>
                {(employees.data?.items ?? []).map((employee) => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.assigneeId?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {task ? 'Save changes' : 'Create task'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new task. */
  task?: Task;
}

export function TaskFormDialog({ open, onOpenChange, task }: TaskFormDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>{task ? 'Update the details or reassign the task.' : 'Create a task and assign it to an employee.'}</DialogDescription>
        </DialogHeader>
        {/* Rendered only while open, so the form is rebuilt with fresh defaults every time the dialog opens. */}
        <TaskForm task={task} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: The page**

`frontend/src/app/(app)/tasks/page.tsx`:
```tsx
'use client';

import { Plus } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { Pagination } from '@/components/common/Pagination';
import { TaskFilterBar } from '@/components/tasks/TaskFilterBar';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';
import { TasksTable } from '@/components/tasks/TasksTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiAction } from '@/hooks/useApiAction';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import { cn } from '@/lib/utils';
import { hasActiveFilters, PAGE_SIZE } from '@/lib/taskFilters';
import { useDeleteTaskMutation, useListTasksQuery } from '@/services/api/tasksApi';
import { useListUsersQuery } from '@/services/api/usersApi';
import { Task } from '@/types/api';

function TasksView(): React.JSX.Element {
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const { run } = useApiAction();
  const [deleteTask] = useDeleteTaskMutation();
  const { filters, searchInput, setSearchInput, setFilter, setPage, reset } = useTaskFilters();

  const tasks = useListTasksQuery({ ...filters, limit: PAGE_SIZE });
  const employees = useListUsersQuery({ roleCode: 'EMPLOYEE', limit: 100 }, { skip: !isAdmin });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>();

  // After deleting the last task on the final page, move back instead of showing an empty page.
  const totalPages = tasks.data?.meta.totalPages;
  useEffect(() => {
    if (totalPages !== undefined && filters.page > totalPages) setPage(totalPages);
  }, [totalPages, filters.page, setPage]);

  const openCreate = (): void => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (task: Task): void => {
    setEditing(task);
    setFormOpen(true);
  };
  const onDelete = async (task: Task): Promise<void> => {
    const { confirmed } = await confirm({
      title: 'Delete this task?',
      description: `"${task.title}" will disappear from all lists. Its history is kept for audit.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) await run(() => deleteTask(task.id).unwrap());
  };

  const filtersActive = hasActiveFilters(filters);

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={isAdmin ? 'Create, assign and track every task.' : 'Tasks assigned to you.'}
        actions={
          isAdmin && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              New task
            </Button>
          )
        }
      />

      <TaskFilterBar
        filters={filters}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onFilterChange={setFilter}
        onReset={reset}
        hasActiveFilters={filtersActive || searchInput.length > 0}
        employees={isAdmin ? employees.data?.items ?? [] : undefined}
      />

      {tasks.isError ? (
        <ErrorState message={tasks.error.message} onRetry={() => void tasks.refetch()} />
      ) : !tasks.data ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading tasks">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : tasks.data.items.length === 0 ? (
        <EmptyState
          title={filtersActive ? 'No tasks match your filters' : isAdmin ? 'No tasks yet' : 'No tasks assigned to you yet'}
          description={filtersActive ? 'Try a different search or clear the filters.' : isAdmin ? 'Create the first task and assign it to an employee.' : 'New assignments will appear here.'}
          action={
            filtersActive ? (
              <Button variant="outline" onClick={reset}>
                Clear filters
              </Button>
            ) : isAdmin ? (
              <Button onClick={openCreate}>New task</Button>
            ) : undefined
          }
        />
      ) : (
        // `data` keeps the previous page while the next one loads, so the table dims instead of flashing empty.
        <div className={cn('transition-opacity', tasks.isFetching && 'opacity-60')}>
          <TasksTable tasks={tasks.data.items} isAdmin={isAdmin} onEdit={openEdit} onDelete={(task) => void onDelete(task)} />
          <Pagination
            page={tasks.data.meta.page}
            totalPages={tasks.data.meta.totalPages}
            total={tasks.data.meta.total}
            onPageChange={setPage}
            disabled={tasks.isFetching}
          />
        </div>
      )}

      {isAdmin && <TaskFormDialog open={formOpen} onOpenChange={setFormOpen} task={editing} />}
    </div>
  );
}

// useSearchParams needs a Suspense boundary for static rendering.
export default function TasksPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <TasksView />
    </Suspense>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `cd frontend && npm run typecheck && npm run lint && npx vitest run`
Expected: PASS.

Manual check (backend + `npm run dev` running):
1. Admin → Tasks: 8 seeded tasks across 1 page; set Status = Pending Approval → only 2 rows, URL shows `?status=PENDING_APPROVAL`; click Reset → all rows, search box empty.
2. Type `report` quickly in the search box and watch the network tab: exactly one `GET /api/tasks?...search=report` fires about 300 ms after you stop typing. Type `100%` and confirm it is sent as `100%25` and matches literally.
3. Employee filter (admin only) narrows to one person; the employee login has no such dropdown and only sees own tasks.
4. Edit the URL to `?status=DONE&page=-3`: page renders normally with all tasks (invalid values ignored).
5. New task: submit empty → inline errors; fill and create → success toast "Task created", row appears at the top; a 422 from the server (e.g. add a 201-character title via DevTools) shows an error toast and the field error.
```bash
git add frontend
git commit -m "feat(frontend): add task list with URL-synced debounced filters and create/edit dialog"
```

---

### Task 17: Task detail — confirmed status dropdown, comments and history

**Files:**
- Create: `frontend/src/components/tasks/{TaskDetails,TaskStatusControl,CommentsPanel,HistoryTimeline}.tsx`
- Create: `frontend/src/app/(app)/tasks/[id]/page.tsx`

**Interfaces:**
- Consumes: `transitionCopy`, `statusHint`, `useConfirm`, `useApiAction`, tasks/comments APIs, `formatDueDate`, `isOverdue`, `formatRelative`, `formatDateTime`, `initialsOf`
- Produces: `<TaskStatusControl task />`, `<CommentsPanel taskId />`, `<HistoryTimeline taskId />`, `<TaskDetails task />`

- [ ] **Step 1: Status control**

`frontend/src/components/tasks/TaskStatusControl.tsx`:
```tsx
'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiAction } from '@/hooks/useApiAction';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/constants';
import { statusHint, transitionCopy } from '@/lib/statusHints';
import { useTransitionTaskMutation } from '@/services/api/tasksApi';
import { Task, TaskStatus } from '@/types/api';

/**
 * The only way to change a task's status. The select is controlled by the server's status and never optimistic, so
 * cancelling the confirmation (or a failed request) leaves it showing the real value with no extra code.
 * Which options are enabled comes from `task.allowedTransitions`; the backend enforces the same rules independently.
 */
export function TaskStatusControl({ task }: { task: Task }): React.JSX.Element {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [transition] = useTransitionTaskMutation();
  const { run, isPending } = useApiAction();

  const hint = statusHint(task, user?.role.code);
  const canChange = task.allowedTransitions.length > 0;

  const onSelect = async (value: string): Promise<void> => {
    const to = value as TaskStatus;
    if (to === task.status) return;

    const copy = transitionCopy(task.status, to);
    const { confirmed, note } = await confirm({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.confirmLabel,
      destructive: copy.destructive,
      note: copy.note,
    });
    if (!confirmed) return;

    await run(() => transition({ id: task.id, from: task.status, to, note: note || undefined }).unwrap());
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="task-status">Status</Label>
      <Select value={task.status} onValueChange={(value) => void onSelect(value)} disabled={!canChange || isPending}>
        <SelectTrigger id="task-status" className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_ORDER.map((status) => (
            <SelectItem key={status} value={status} disabled={status !== task.status && !task.allowedTransitions.includes(status)}>
              {STATUS_LABEL[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Comments and history**

`frontend/src/components/tasks/CommentsPanel.tsx`:
```tsx
'use client';

import { Loader2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useApiAction } from '@/hooks/useApiAction';
import { formatRelative } from '@/lib/dates';
import { initialsOf } from '@/lib/text';
import { useCreateCommentMutation, useListCommentsQuery } from '@/services/api/commentsApi';

const MAX_LENGTH = 2000;

export function CommentsPanel({ taskId }: { taskId: number }): React.JSX.Element {
  const comments = useListCommentsQuery(taskId);
  const [createComment] = useCreateCommentMutation();
  const { run, isPending } = useApiAction();
  const [body, setBody] = useState('');

  const canSubmit = body.trim().length > 0 && !isPending;

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    const result = await run(() => createComment({ taskId, body: body.trim() }).unwrap());
    if (result.ok) setBody('');
  };

  return (
    <div className="space-y-6">
      {comments.isError ? (
        <ErrorState message={comments.error.message} onRetry={() => void comments.refetch()} />
      ) : !comments.data ? (
        <Skeleton className="h-24 w-full" />
      ) : comments.data.length === 0 ? (
        <EmptyState title="No comments yet" description="Start the conversation below." />
      ) : (
        <ul className="space-y-4" aria-label="Comments">
          {comments.data.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initialsOf(comment.author.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{comment.author.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{formatRelative(comment.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-2">
        <label htmlFor="new-comment" className="text-sm font-medium">
          Add a comment
        </label>
        <Textarea id="new-comment" rows={3} maxLength={MAX_LENGTH} value={body} onChange={(event) => setBody(event.target.value)} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {body.length}/{MAX_LENGTH}
          </span>
          <Button type="submit" disabled={!canSubmit}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Add comment
          </Button>
        </div>
      </form>
    </div>
  );
}
```
`frontend/src/components/tasks/HistoryTimeline.tsx`:
```tsx
'use client';

import { ErrorState } from '@/components/common/ErrorState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/dates';
import { useGetTaskHistoryQuery } from '@/services/api/tasksApi';

export function HistoryTimeline({ taskId }: { taskId: number }): React.JSX.Element {
  const history = useGetTaskHistoryQuery(taskId);

  if (history.isError) return <ErrorState message={history.error.message} onRetry={() => void history.refetch()} />;
  if (!history.data) return <Skeleton className="h-24 w-full" />;

  return (
    <ol className="relative space-y-6 border-l pl-6" aria-label="Status history">
      {history.data.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -left-[1.85rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {entry.fromStatus ? (
              <>
                <span className="font-medium">{entry.actor.name}</span> moved
                <StatusBadge status={entry.fromStatus} />→<StatusBadge status={entry.toStatus} />
              </>
            ) : (
              <>
                <span className="font-medium">{entry.actor.name}</span> created the task as <StatusBadge status={entry.toStatus} />
              </>
            )}
          </div>
          {entry.note && <blockquote className="mt-2 border-l-2 pl-3 text-sm italic text-muted-foreground">{entry.note}</blockquote>}
          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
```
`frontend/src/components/tasks/TaskDetails.tsx`:
```tsx
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { formatDateTime, formatDueDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Task } from '@/types/api';

function Item({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export function TaskDetails({ task }: { task: Task }): React.JSX.Element {
  const overdue = isOverdue(task.dueDate, task.status);
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Item label="Assignee">{task.assignee.name}</Item>
        <Item label="Created by">{task.createdBy.name}</Item>
        <Item label="Priority">
          <PriorityBadge priority={task.priority} />
        </Item>
        <Item label="Due date">
          <span className={cn(overdue && 'font-medium text-destructive')}>
            {formatDueDate(task.dueDate)}
            {overdue && ' (overdue)'}
          </span>
        </Item>
        <Item label="Created">{formatDateTime(task.createdAt)}</Item>
      </dl>
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</h2>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{task.description}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: The detail page**

`frontend/src/app/(app)/tasks/[id]/page.tsx`:
```tsx
'use client';

import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { CommentsPanel } from '@/components/tasks/CommentsPanel';
import { HistoryTimeline } from '@/components/tasks/HistoryTimeline';
import { TaskDetails } from '@/components/tasks/TaskDetails';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';
import { TaskStatusControl } from '@/components/tasks/TaskStatusControl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiAction } from '@/hooks/useApiAction';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { isApiError } from '@/lib/normalizeError';
import { useDeleteTaskMutation, useGetTaskQuery } from '@/services/api/tasksApi';

export default function TaskDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const { run } = useApiAction();
  const [deleteTask] = useDeleteTaskMutation();
  const [editOpen, setEditOpen] = useState(false);

  const taskId = Number(params.id);
  const validId = Number.isInteger(taskId) && taskId > 0;
  const task = useGetTaskQuery(taskId, { skip: !validId });

  const back = (
    <Link href="/tasks" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to tasks
    </Link>
  );

  // RTK Query types `error` as ApiError | SerializedError, so narrow before reading `code`.
  if (!validId || (task.error && isApiError(task.error) && task.error.code === 'NOT_FOUND')) {
    return (
      <div>
        {back}
        <ErrorState title="Task not found" message="It may have been deleted, or it is not assigned to you." />
      </div>
    );
  }
  if (task.isError) {
    return (
      <div>
        {back}
        <ErrorState message={task.error.message} onRetry={() => void task.refetch()} />
      </div>
    );
  }
  if (!task.data) {
    return (
      <div>
        {back}
        <Skeleton className="mb-4 h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const data = task.data;

  const onDelete = async (): Promise<void> => {
    const { confirmed } = await confirm({
      title: 'Delete this task?',
      description: `"${data.title}" will disappear from all lists. Its history is kept for audit.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    const result = await run(() => deleteTask(data.id).unwrap());
    if (result.ok) router.replace('/tasks');
  };

  return (
    <div>
      {back}
      <PageHeader
        title={data.title}
        actions={
          <>
            <StatusBadge status={data.status} />
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" disabled={data.status === 'COMPLETED'} onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-1 h-4 w-4" aria-hidden />
                  Edit
                </Button>
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => void onDelete()}>
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                  Delete
                </Button>
              </>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="space-y-6 p-6">
          <TaskDetails task={data} />
          <TaskStatusControl task={data} />
        </CardContent>
      </Card>

      <Tabs defaultValue="comments" className="mt-6">
        <TabsList>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="comments" className="pt-4">
          <CommentsPanel taskId={data.id} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTimeline taskId={data.id} />
        </TabsContent>
      </Tabs>

      {isAdmin && <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} task={data} />}
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `cd frontend && npm run typecheck && npm run lint && npx vitest run`
Expected: PASS.

Manual check with two browsers (Admin in a normal window, Priya in a private window), backend running:
1. Admin creates "Verify workflow" assigned to Priya. Admin's status dropdown is disabled with the hint "Waiting for Priya Sharma…".
2. Priya opens it: dropdown enabled; only "In Progress" is selectable. Pick it → dialog "Start working on this task?" shows "Pending → In Progress"; **Cancel** → dropdown still "Pending" and no request in the Network tab. Pick again → **Start** → toast "Task moved to In Progress".
3. Priya picks Pending Approval → **Submit** → toast "Submitted for approval"; dropdown is now disabled with "Waiting for an admin…".
4. Admin reloads: dropdown offers Completed and In Progress. Choose In Progress → dialog requires a reason (Confirm disabled until typed) → **Reject** → toast "Task sent back to In Progress". Priya's History tab shows the rejection with the reason.
5. Priya resubmits; Admin picks Completed → **Approve** → toast "Task approved"; dropdown disabled, hint "Completed tasks are final.", Edit disabled.
6. Open the same URL as Rahul (another employee) → "Task not found".
```bash
git add frontend
git commit -m "feat(frontend): add task detail with confirmed status dropdown, comments and history"
```

---

### Task 18: Users page (create, edit, delete) and the Playwright smoke test

**Files:**
- Create: `frontend/src/components/users/{UsersTable,UserFormDialog}.tsx`, `frontend/src/app/(app)/users/page.tsx`
- Create: `frontend/playwright.config.ts`, `frontend/e2e/workflow.spec.ts`
- Modify: `frontend/package.json` (script), `frontend/.gitignore`

**Interfaces:**
- Consumes: users APIs, `applyFieldErrors`, `useApiAction`, `Pagination`
- Produces: `/users` (Admin only), `npm run e2e`

- [ ] **Step 1: Users components**

`frontend/src/components/users/UsersTable.tsx`:
```tsx
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { User } from '@/types/api';

interface UsersTableProps {
  users: User[];
  currentUserId: number;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

/** Why Delete is unavailable for a row, or undefined when it is allowed. The backend enforces the same rules (and the "has tasks" one). */
function deleteBlockedReason(user: User, currentUserId: number): string | undefined {
  if (user.isDefault) return 'Default accounts cannot be deleted';
  if (user.id === currentUserId) return 'You cannot delete your own account';
  return undefined;
}

export function UsersTable({ users, currentUserId, onEdit, onDelete }: UsersTableProps): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const blocked = deleteBlockedReason(user, currentUserId);
            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.name}
                  {user.isDefault && <span className="ml-2 text-xs text-muted-foreground">(default)</span>}
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.phone ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={user.role.code === 'ADMIN' ? 'default' : 'secondary'}>{user.role.name}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${user.name}`} onClick={() => onEdit(user)}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${user.name}`}
                    title={blocked}
                    disabled={Boolean(blocked)}
                    onClick={() => onDelete(user)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```
`frontend/src/components/users/UserFormDialog.tsx` (one form for both modes; in edit mode the role is shown read-only because the backend does not allow changing it, and the password is optional):
```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { applyFieldErrors, useApiAction } from '@/hooks/useApiAction';
import { useCreateUserMutation, useListRolesQuery, useUpdateUserMutation } from '@/services/api/usersApi';
import { User } from '@/types/api';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)/;

// Mirrors the backend rules (8–72 chars, a letter and a digit) so most mistakes are caught before the request.
function makeSchema(isEdit: boolean) {
  return z.object({
    name: z.string().trim().min(1, 'Enter a name').max(120, 'Keep the name under 120 characters'),
    email: z.string().trim().min(1, 'Enter an email').email('Enter a valid email'),
    phone: z.string().trim().regex(/^(\+?[0-9 ()-]{7,20})?$/, 'Use 7–20 digits, spaces, +, - or ( )'),
    password: z
      .string()
      .refine((value) => (isEdit && value === '') || value.length >= 8, 'Use at least 8 characters')
      .refine((value) => value.length <= 72, 'Use at most 72 characters')
      .refine((value) => (isEdit && value === '') || PASSWORD_RULE.test(value), 'Include at least one letter and one number'),
    roleId: isEdit ? z.string() : z.string().min(1, 'Choose a role'),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function FieldError({ message }: { message?: string }): React.JSX.Element | null {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

function UserForm({ user, onDone }: { user?: User; onDone: () => void }): React.JSX.Element {
  const isEdit = Boolean(user);
  const roles = useListRolesQuery();
  const [createUser] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();
  const { run, isPending } = useApiAction();

  const form = useForm<FormValues>({
    resolver: zodResolver(makeSchema(isEdit)),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      password: '',
      roleId: user ? String(user.role.id) : '',
    },
  });
  const { errors } = form.formState;

  const onSubmit = async (values: FormValues): Promise<void> => {
    const result = await run(() =>
      user
        ? updateUser({
            id: user.id,
            name: values.name,
            email: values.email,
            phone: values.phone === '' ? null : values.phone,
            ...(values.password ? { password: values.password } : {}),
          }).unwrap()
        : createUser({ ...values, phone: values.phone || undefined, roleId: Number(values.roleId) }).unwrap(),
    );
    if (result.ok) {
      onDone();
      return;
    }
    const matched = applyFieldErrors(result.error, form.setError, ['name', 'email', 'phone', 'password', 'roleId']);
    // A duplicate email arrives as a plain CONFLICT without a field name, but we know where it belongs.
    if (!matched && result.error.code === 'CONFLICT') form.setError('email', { type: 'server', message: result.error.message });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="user-name">Name</Label>
        <Input id="user-name" aria-invalid={Boolean(errors.name)} {...form.register('name')} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-email">Email</Label>
        <Input id="user-email" type="email" autoComplete="off" aria-invalid={Boolean(errors.email)} {...form.register('email')} />
        <FieldError message={errors.email?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-phone">Phone (optional)</Label>
        <Input id="user-phone" type="tel" autoComplete="off" aria-invalid={Boolean(errors.phone)} {...form.register('phone')} />
        <FieldError message={errors.phone?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-password">{isEdit ? 'New password (leave blank to keep the current one)' : 'Temporary password'}</Label>
        <Input id="user-password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...form.register('password')} />
        <FieldError message={errors.password?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-role">Role</Label>
        <Controller
          control={form.control}
          name="roleId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={isEdit || roles.isLoading}>
              <SelectTrigger id="user-role">
                <SelectValue placeholder={roles.isLoading ? 'Loading roles…' : 'Select a role'} />
              </SelectTrigger>
              <SelectContent>
                {(roles.data ?? []).map((role) => (
                  <SelectItem key={role.id} value={String(role.id)}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.roleId?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {isEdit ? 'Save changes' : 'Create user'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present for edit mode, absent for create mode. */
  user?: User;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? 'Edit user' : 'New user'}</DialogTitle>
          <DialogDescription>
            {user ? 'The role cannot be changed after the account is created.' : 'They can sign in right away with this email and password.'}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so each user (or a fresh create) starts from clean form state. */}
        <UserForm key={user?.id ?? 'new'} user={user} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
```
`frontend/src/app/(app)/users/page.tsx`:
```tsx
'use client';

import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { Pagination } from '@/components/common/Pagination';
import { UserFormDialog } from '@/components/users/UserFormDialog';
import { UsersTable } from '@/components/users/UsersTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiAction } from '@/hooks/useApiAction';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { useDeleteUserMutation, useListUsersQuery } from '@/services/api/usersApi';
import { User } from '@/types/api';

const PAGE_SIZE = 10;

export default function UsersPage(): React.JSX.Element {
  const { user: me, isAdmin } = useAuth();
  const confirm = useConfirm();
  const { run } = useApiAction();
  const [deleteUser] = useDeleteUserMutation();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | undefined>();
  // Skipped for non-admins: the backend would answer 403 anyway, and there is no reason to provoke an error toast.
  const users = useListUsersQuery({ page, limit: PAGE_SIZE }, { skip: !isAdmin });

  if (!isAdmin || !me) {
    return <ErrorState title="Admins only" message="You do not have access to this page." />;
  }

  const openCreate = (): void => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (user: User): void => {
    setEditing(user);
    setFormOpen(true);
  };
  const onDelete = async (user: User): Promise<void> => {
    const { confirmed } = await confirm({
      title: `Delete ${user.name}?`,
      description: 'They will no longer be able to sign in. This only works for users who have no tasks assigned.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) await run(() => deleteUser(user.id).unwrap());
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="Create, edit and remove accounts."
        actions={
          <Button onClick={openCreate}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden />
            New user
          </Button>
        }
      />

      {users.isError ? (
        <ErrorState message={users.error.message} onRetry={() => void users.refetch()} />
      ) : !users.data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <UsersTable users={users.data.items} currentUserId={me.id} onEdit={openEdit} onDelete={(user) => void onDelete(user)} />
          <Pagination
            page={users.data.meta.page}
            totalPages={users.data.meta.totalPages}
            total={users.data.meta.total}
            onPageChange={setPage}
            disabled={users.isFetching}
            noun="user"
          />
        </>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
    </div>
  );
}
```
- [ ] **Step 2: Playwright config and smoke test**

Add to `frontend/package.json` scripts: `"e2e": "playwright test"`. Add `playwright-report/` and `test-results/` to `frontend/.gitignore`. Install the browser once: `npx playwright install chromium`.

`frontend/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against an already-running app (local `npm run dev` + backend, or the deployed URL):
 *   E2E_BASE_URL=https://your-app.vercel.app npm run e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // the first request to a sleeping free-tier backend can take about a minute
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```
`frontend/e2e/workflow.spec.ts`:
```ts
import { expect, Page, test } from '@playwright/test';

const ADMIN = { email: 'admin@taskapp.dev', password: 'Admin@12345' };
const EMPLOYEE = { email: 'priya@taskapp.dev', password: 'Employee@12345' };
const OTHER_EMPLOYEE = { email: 'rahul@taskapp.dev', password: 'Employee@12345' };

async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

/** Picks a status from the dropdown and answers the confirmation dialog. */
async function changeStatus(page: Page, option: string, confirmLabel: string, note?: string): Promise<void> {
  await page.getByLabel('Status', { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  if (note) await page.getByLabel(/^(Reason for rejection|Note \(optional\))$/).fill(note);
  await page.getByRole('button', { name: confirmLabel, exact: true }).click();
}

async function expectStatus(page: Page, label: string): Promise<void> {
  await expect(page.getByLabel('Status', { exact: true })).toContainText(label);
}

test('a task moves through the full approval workflow with the right people in control', async ({ browser }) => {
  // Two isolated browser contexts = two separate sessions, as a reviewer would use.
  const adminPage = await (await browser.newContext()).newPage();
  const employeePage = await (await browser.newContext()).newPage();
  const otherPage = await (await browser.newContext()).newPage();
  const title = `E2E task ${Date.now()}`;

  await test.step('admin creates and assigns a task', async () => {
    await signIn(adminPage, ADMIN);
    await adminPage.getByRole('link', { name: 'Tasks' }).first().click();
    await adminPage.getByRole('button', { name: 'New task' }).first().click();
    await adminPage.getByLabel('Title').fill(title);
    await adminPage.getByLabel('Description').fill('Created by the Playwright smoke test.');
    await adminPage.getByLabel('Due date').fill('2030-12-31');
    await adminPage.getByLabel('Assignee').click();
    await adminPage.getByRole('option', { name: 'Priya Sharma' }).click();
    await adminPage.getByRole('button', { name: 'Create task' }).click();
    await expect(adminPage.getByText('Task created')).toBeVisible();
    await adminPage.getByRole('link', { name: title }).click();
    await expectStatus(adminPage, 'Pending');
    await expect(adminPage.getByLabel('Status', { exact: true })).toBeDisabled(); // only the assignee can start it
  });

  const taskUrl = adminPage.url();

  await test.step('employee starts the task, cancelling once first', async () => {
    await signIn(employeePage, EMPLOYEE);
    await employeePage.goto(taskUrl);
    await expectStatus(employeePage, 'Pending');

    await employeePage.getByLabel('Status', { exact: true }).click();
    await employeePage.getByRole('option', { name: 'In Progress', exact: true }).click();
    await employeePage.getByRole('button', { name: 'Cancel' }).click();
    await expectStatus(employeePage, 'Pending'); // cancel changed nothing

    await changeStatus(employeePage, 'In Progress', 'Start');
    await expectStatus(employeePage, 'In Progress');
  });

  await test.step('employee submits for approval and cannot approve', async () => {
    await changeStatus(employeePage, 'Pending Approval', 'Submit');
    await expectStatus(employeePage, 'Pending Approval');
    await expect(employeePage.getByLabel('Status', { exact: true })).toBeDisabled();
    const forbidden = await employeePage.request.post(`/api/tasks/${taskUrl.split('/').pop()}/transition`, { data: { to: 'COMPLETED' } });
    expect(forbidden.status()).toBe(403);
  });

  await test.step('admin rejects with a reason, employee sees it and resubmits', async () => {
    await adminPage.reload();
    await expectStatus(adminPage, 'Pending Approval');
    await changeStatus(adminPage, 'In Progress', 'Reject', 'Please add the missing figures');
    await expectStatus(adminPage, 'In Progress');

    await employeePage.reload();
    await expectStatus(employeePage, 'In Progress');
    await employeePage.getByRole('tab', { name: 'History' }).click();
    await expect(employeePage.getByText('Please add the missing figures')).toBeVisible();

    await changeStatus(employeePage, 'Pending Approval', 'Submit');
  });

  await test.step('admin approves and the result persists across a reload', async () => {
    await adminPage.reload();
    await changeStatus(adminPage, 'Completed', 'Approve');
    await expectStatus(adminPage, 'Completed');
    await adminPage.reload();
    await expectStatus(adminPage, 'Completed');
    await employeePage.reload();
    await expectStatus(employeePage, 'Completed');
  });

  await test.step('role restrictions hold for the UI and the API', async () => {
    await signIn(otherPage, OTHER_EMPLOYEE);
    await otherPage.goto(taskUrl);
    await expect(otherPage.getByText('Task not found')).toBeVisible();

    await employeePage.goto('/users');
    await expect(employeePage.getByText('Admins only')).toBeVisible();
    expect((await employeePage.request.get('/api/users')).status()).toBe(403);
  });
});
```

- [ ] **Step 3: Run the checks and the smoke test**

Run: `cd frontend && npm run typecheck && npm run lint && npx vitest run`
Expected: PASS.

With the backend (against Aiven) and `npm run dev` running: `npm run e2e`
Expected: the single test passes (about 30–60 s). If a selector fails because shadcn rendered a control differently, fix the selector, not the application. Open the HTML report with `npx playwright show-report` when debugging.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): add admin users page and Playwright workflow smoke test"
```
