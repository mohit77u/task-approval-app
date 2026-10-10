# Frontend Foundation Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js app: scaffold, same-origin API proxy, the RTK Query API layer (re-auth, cold-start retry, central toasts), shared hooks, login, and the authenticated app shell.

**Architecture:** The browser only ever talks to the Next.js origin; `rewrites` proxy `/api/*` to the backend so auth cookies stay first-party. All HTTP goes through one `baseQuery` that normalises errors, refreshes expired sessions (single in-flight refresh) and retries idle-server failures for GETs. A Redux middleware turns every mutation success and every API error into exactly one toast, so components contain no toast code.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, Redux Toolkit + RTK Query, React Hook Form + zod, sonner, next-themes, date-fns, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-task-approval-design.md` · **Depends on:** Plans 01–02 (backend API available on `http://localhost:4000`).

## Global Constraints

- TypeScript strict, no `any`, explicit return types on exported functions; comments explain *why*.
- The browser calls only relative `/api/...`. There is **no** `NEXT_PUBLIC_` API URL; `BACKEND_URL` is server-only and read by `rewrites`.
- Status labels: `PENDING`→"Pending", `IN_PROGRESS`→"In Progress", `PENDING_APPROVAL`→"Pending Approval", `COMPLETED`→"Completed". Priorities `LOW|MEDIUM|HIGH`.
- Toast policy: success toast on **every mutation**; error toast on **every API error** (queries and mutations); no toast for GET success. Levels: 409 `STATE_CONFLICT` and 429 → warning; session expiry and server wake-up → info; everything else → error. 422 also sets form field errors.
- The frontend never re-implements the workflow table: it renders from `allowedTransitions` returned by the backend.
- Debounce search at 300 ms; mutating controls are disabled while a request is pending; no polling.
- Commit messages are conventional and end with the attribution trailer the session requires.

## Review Focus

1. Many requests expiring together trigger exactly one refresh and all retry successfully (Task 13).
2. A failed refresh ends the session cleanly: cache cleared, redirect to login, no toast on a first visit (Tasks 13, 14).
3. A POST is never auto-retried after a network error (Task 13).
4. A different user logging in must never see the previous user's cached data (Task 13).
5. A cold backend (first request ~1 minute) shows an info toast and eventually succeeds instead of an error (Task 13).

---

## File Structure

```
frontend/
  next.config.ts  vitest.config.ts  .env.example
  src/
    app/
      layout.tsx  page.tsx  globals.css
      (auth)/login/page.tsx
      (app)/layout.tsx
    components/
      ui/            (shadcn)
      auth/AuthGate.tsx
      layout/{AppShell,Sidebar,Topbar,ThemeToggle,ServerStatusBanner}.tsx
      common/{StatusBadge,PriorityBadge,EmptyState,ErrorState,PageHeader,Spinner}.tsx
    hooks/{useAuth,useDebouncedValue,useApiAction,useConfirm}.tsx|ts
    lib/{utils,constants,normalizeError,notify,apiMessages,apiNotification,demoAccounts}.ts
    services/api/{baseQuery,baseApi,authApi,tasksApi,commentsApi,usersApi,dashboardApi}.ts
    store/{actions,index,hooks}.ts  store/StoreProvider.tsx
    store/slices/{authSlice,uiSlice}.ts  store/middleware/apiNotificationMiddleware.ts
    types/api.ts
    test/setup.ts
```

---

### Task 11: Scaffold, proxy and test tooling

**Files:**
- Create: `frontend/` (create-next-app), `frontend/next.config.ts`, `frontend/.env.example`, `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`
- Modify: `frontend/package.json`

**Interfaces:** Produces the `@/*` import alias, the `/api` rewrite, and `npm test` (Vitest).

- [ ] **Step 1: Scaffold**

Run from the repo root:
```bash
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```
Accept defaults for any remaining prompts (no Turbopack choice is required by this plan).

- [ ] **Step 2: Install dependencies and shadcn**

```bash
cd frontend
npm i @reduxjs/toolkit react-redux react-hook-form zod @hookform/resolvers date-fns lucide-react next-themes
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test
npx shadcn@latest init
npx shadcn@latest add button card input label textarea select dialog dropdown-menu badge table tabs skeleton sonner sheet separator avatar tooltip
```
In `shadcn init` choose the Neutral base color and CSS variables. The `sonner` component reads the theme from `next-themes`.

- [ ] **Step 3: Proxy and env**

`frontend/next.config.ts`:
```ts
import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL;

// A production build without a backend URL would silently proxy to localhost, so fail the build instead.
if (!backendUrl && process.env.NODE_ENV === 'production') {
  throw new Error('BACKEND_URL must be set for production builds');
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    // The browser only talks to this origin; the backend sees a server-to-server call and cookies stay first-party.
    return [{ source: '/api/:path*', destination: `${backendUrl ?? 'http://localhost:4000'}/api/:path*` }];
  },
};

export default nextConfig;
```
`frontend/.env.example`:
```dotenv
# Server-side only. Where Next.js proxies /api/* to.
BACKEND_URL=http://localhost:4000
```
Create the local file: `cp .env.example .env.local`. For a local production build set `BACKEND_URL` inline (`BACKEND_URL=http://localhost:4000 npm run build`).

- [ ] **Step 4: Vitest**

`frontend/vitest.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
```
`frontend/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';

// Node's Request rejects relative URLs, but RTK Query builds Requests for '/api/...'. Resolve them against a fake origin
// so tests can exercise the real fetchBaseQuery.
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
  }
} as typeof Request;
```
Add to `frontend/package.json` scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.

- [ ] **Step 5: Verify the proxy against the running backend**

In one terminal: `cd backend && npm run start:dev`. In another: `cd frontend && npm run dev`, then:
`curl -s localhost:3000/api/health`
Expected: `{"status":"ok","db":"up"}` (proxied through Next to the backend). Also run `npm test` (no tests yet: expect "No test files found", exit may be non-zero; that is fine until Task 12).

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "chore(frontend): scaffold Next.js app with API proxy, shadcn and Vitest"
```

---

### Task 12: Types, constants, error normalisation and notification rules

**Files:**
- Create: `frontend/src/types/api.ts`, `frontend/src/lib/{constants,normalizeError,notify,apiMessages,apiNotification}.ts`
- Test: `frontend/src/lib/normalizeError.test.ts`, `frontend/src/lib/apiNotification.test.ts`, `frontend/src/lib/apiMessages.test.ts`

**Interfaces:**
- Produces:
  - Types: `TaskStatus`, `TaskPriority`, `RoleCode`, `User`, `Role`, `PersonRef`, `Task`, `HistoryEntry`, `TaskComment`, `Paginated<T>`, `DashboardData`, `ErrorCode`, `ApiErrorDetail`, `ApiError`
  - `normalizeError(error: unknown, retryAfterHeader?: string | null): ApiError`
  - `notificationFor(error: ApiError): { level: 'error' | 'warning' | 'info'; message: string } | null`
  - `successMessageFor(endpointName: string, originalArg: unknown): string | undefined`
  - `notify.success | error | warning | info(message, options?)`
  - Constants: `STATUS_ORDER`, `STATUS_LABEL`, `PRIORITY_ORDER`, `PRIORITY_LABEL`, `STATUS_STYLES`, `PRIORITY_STYLES`

- [ ] **Step 1: Types and constants**

`frontend/src/types/api.ts`:
```ts
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type RoleCode = 'ADMIN' | 'EMPLOYEE';

export interface Role {
  id: number;
  code: string;
  name: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface PersonRef {
  id: number;
  name: string;
  email: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Calendar date, `YYYY-MM-DD`. */
  dueDate: string;
  assignee: PersonRef;
  createdBy: PersonRef;
  /** Statuses the current viewer may move this task to, decided by the backend. */
  allowedTransitions: TaskStatus[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: number;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  note: string | null;
  actor: { id: number; name: string };
  createdAt: string;
}

export interface TaskComment {
  id: number;
  body: string;
  author: { id: number; name: string };
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface DashboardData {
  counts: Record<TaskStatus, number>;
  total: number;
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_TRANSITION'
  | 'STATE_CONFLICT'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface ApiErrorDetail {
  field: string;
  message: string;
}

/** The single error type the UI ever sees, whatever went wrong underneath. */
export interface ApiError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details: ApiErrorDetail[];
  retryAfterSeconds?: number;
  /** Set when the API layer already dealt with the failure (e.g. ended the session), so it is not toasted again. */
  handled?: boolean;
}
```
`frontend/src/lib/constants.ts`:
```ts
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
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/lib/normalizeError.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalizeError } from './normalizeError';

describe('normalizeError', () => {
  it('maps a backend error body, including field details', () => {
    const error = normalizeError({
      status: 422,
      data: {
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'title', message: 'title should not be empty' }],
      },
    });
    expect(error).toEqual({
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [{ field: 'title', message: 'title should not be empty' }],
    });
  });

  it('turns a network failure into a friendly NETWORK_ERROR', () => {
    const error = normalizeError({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' });
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.statusCode).toBe(0);
    expect(error.message).toMatch(/reach the server/i);
  });

  it('treats a gateway page that is not JSON as an unavailable server', () => {
    const error = normalizeError({ status: 'PARSING_ERROR', originalStatus: 503, data: '<html>Service Unavailable</html>', error: 'x' });
    expect(error).toMatchObject({ statusCode: 503, code: 'NETWORK_ERROR' });
    expect(error.message).not.toContain('<html>');
  });

  it('falls back to a status-based message when the body is not our error shape', () => {
    const error = normalizeError({ status: 500, data: 'oops' });
    expect(error).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' });
  });

  it('reads Retry-After for rate limiting', () => {
    const error = normalizeError(
      { status: 429, data: { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' } },
      '42',
    );
    expect(error.retryAfterSeconds).toBe(42);
  });

  it('passes through an ApiError unchanged and survives unknown input', () => {
    const existing = { statusCode: 403, code: 'FORBIDDEN' as const, message: 'No', details: [] };
    expect(normalizeError(existing)).toBe(existing);
    expect(normalizeError(new Error('boom'))).toMatchObject({ code: 'UNKNOWN_ERROR', message: 'boom' });
    expect(normalizeError(undefined)).toMatchObject({ code: 'UNKNOWN_ERROR' });
  });
});
```
`frontend/src/lib/apiNotification.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/types/api';
import { notificationFor } from './apiNotification';

const base: ApiError = { statusCode: 400, code: 'UNKNOWN_ERROR', message: 'Nope', details: [] };

describe('notificationFor', () => {
  it('shows ordinary failures as errors with the backend message', () => {
    expect(notificationFor({ ...base, statusCode: 403, code: 'FORBIDDEN', message: 'Not allowed' })).toEqual({ level: 'error', message: 'Not allowed' });
    expect(notificationFor({ ...base, statusCode: 0, code: 'NETWORK_ERROR', message: 'Offline' })).toEqual({ level: 'error', message: 'Offline' });
  });

  it('shows a state conflict as a warning', () => {
    expect(notificationFor({ ...base, statusCode: 409, code: 'STATE_CONFLICT', message: 'Changed by someone else' })).toEqual({
      level: 'warning',
      message: 'Changed by someone else',
    });
  });

  it('keeps a duplicate-resource conflict an error', () => {
    expect(notificationFor({ ...base, statusCode: 409, code: 'CONFLICT', message: 'Email taken' })?.level).toBe('error');
  });

  it('shows rate limiting as a warning with the wait time when known', () => {
    expect(notificationFor({ ...base, statusCode: 429, code: 'RATE_LIMITED', message: 'Slow down', retryAfterSeconds: 30 })).toEqual({
      level: 'warning',
      message: 'Too many requests. Try again in 30s.',
    });
    expect(notificationFor({ ...base, statusCode: 429, code: 'RATE_LIMITED', message: 'Slow down' })).toEqual({ level: 'warning', message: 'Slow down' });
  });

  it('summarises validation errors by their first detail', () => {
    const one = notificationFor({ ...base, statusCode: 422, code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: 'title', message: 'title should not be empty' }] });
    expect(one).toEqual({ level: 'error', message: 'title should not be empty' });

    const many = notificationFor({
      ...base,
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [
        { field: 'title', message: 'title should not be empty' },
        { field: 'dueDate', message: 'dueDate must be a valid date' },
      ],
    });
    expect(many).toEqual({ level: 'error', message: 'title should not be empty (+1 more)' });
  });

  it('stays silent for errors the API layer already handled', () => {
    expect(notificationFor({ ...base, handled: true })).toBeNull();
  });
});
```
`frontend/src/lib/apiMessages.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { successMessageFor } from './apiMessages';

describe('successMessageFor', () => {
  it('has a message for every mutation endpoint', () => {
    for (const endpoint of ['login', 'logout', 'createTask', 'updateTask', 'deleteTask', 'createComment', 'createUser']) {
      expect(successMessageFor(endpoint, undefined)).toEqual(expect.any(String));
    }
  });

  it('words each workflow step specifically', () => {
    expect(successMessageFor('transitionTask', { id: 1, from: 'PENDING', to: 'IN_PROGRESS' })).toBe('Task moved to In Progress');
    expect(successMessageFor('transitionTask', { id: 1, from: 'IN_PROGRESS', to: 'PENDING_APPROVAL' })).toBe('Submitted for approval');
    expect(successMessageFor('transitionTask', { id: 1, from: 'PENDING_APPROVAL', to: 'COMPLETED' })).toBe('Task approved');
    expect(successMessageFor('transitionTask', { id: 1, from: 'PENDING_APPROVAL', to: 'IN_PROGRESS' })).toBe('Task sent back to In Progress');
  });

  it('is silent for queries and the session bootstrap', () => {
    expect(successMessageFor('listTasks', {})).toBeUndefined();
    expect(successMessageFor('me', undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `cd frontend && npx vitest run`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement**

`frontend/src/lib/normalizeError.ts`:
```ts
import { ApiError, ApiErrorDetail, ErrorCode } from '@/types/api';

const GATEWAY_STATUSES = new Set([502, 503, 504]);

const MESSAGE_BY_STATUS: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: 'VALIDATION_ERROR', message: 'The request was not valid.' },
  401: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' },
  403: { code: 'FORBIDDEN', message: 'You do not have permission to do that.' },
  404: { code: 'NOT_FOUND', message: 'We could not find what you were looking for.' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
  500: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' },
};

const SERVER_UNAVAILABLE = 'The server is not responding right now. Please try again in a moment.';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function isApiError(value: unknown): value is ApiError {
  return isRecord(value) && typeof value.statusCode === 'number' && typeof value.code === 'string' && typeof value.message === 'string' && Array.isArray(value.details);
}

function parseDetails(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ApiErrorDetail => isRecord(item) && typeof item.field === 'string' && typeof item.message === 'string',
  );
}

function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

function fromStatus(statusCode: number, retryAfterSeconds?: number): ApiError {
  if (GATEWAY_STATUSES.has(statusCode)) {
    return { statusCode, code: 'NETWORK_ERROR', message: SERVER_UNAVAILABLE, details: [] };
  }
  const known = MESSAGE_BY_STATUS[statusCode] ?? MESSAGE_BY_STATUS[500];
  return { statusCode, code: known.code, message: known.message, details: [], retryAfterSeconds };
}

/**
 * Collapses everything that can go wrong (our backend's error body, RTK Query's FETCH_ERROR / PARSING_ERROR, plain
 * Errors) into one ApiError, so the rest of the UI never has to know which layer failed.
 */
export function normalizeError(error: unknown, retryAfterHeader?: string | null): ApiError {
  if (isApiError(error)) return error;
  const retryAfterSeconds = parseRetryAfter(retryAfterHeader);

  if (isRecord(error) && 'status' in error) {
    const { status } = error;

    if (typeof status === 'number') {
      const body = error.data;
      if (isRecord(body) && typeof body.code === 'string' && typeof body.message === 'string') {
        return {
          statusCode: status,
          code: body.code as ErrorCode,
          message: body.message,
          details: parseDetails(body.details),
          ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
        };
      }
      return fromStatus(status, retryAfterSeconds);
    }

    if (status === 'PARSING_ERROR' && typeof error.originalStatus === 'number') {
      return fromStatus(error.originalStatus, retryAfterSeconds);
    }

    if (status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR') {
      return { statusCode: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check your connection and try again.', details: [] };
    }
  }

  const message = error instanceof Error && error.message ? error.message : 'An unexpected error occurred.';
  return { statusCode: 0, code: 'UNKNOWN_ERROR', message, details: [] };
}
```
`frontend/src/lib/apiNotification.ts`:
```ts
import { ApiError } from '@/types/api';

export interface NotificationSpec {
  level: 'error' | 'warning' | 'info';
  message: string;
}

/** Decides how an API failure is announced. The single place that maps error codes to toast levels. */
export function notificationFor(error: ApiError): NotificationSpec | null {
  if (error.handled) return null;

  switch (error.code) {
    case 'STATE_CONFLICT':
      return { level: 'warning', message: error.message };
    case 'RATE_LIMITED':
      return {
        level: 'warning',
        message: error.retryAfterSeconds ? `Too many requests. Try again in ${error.retryAfterSeconds}s.` : error.message,
      };
    case 'VALIDATION_ERROR': {
      const [first, ...rest] = error.details;
      if (!first) return { level: 'error', message: error.message };
      return { level: 'error', message: rest.length ? `${first.message} (+${rest.length} more)` : first.message };
    }
    default:
      return { level: 'error', message: error.message };
  }
}
```
`frontend/src/lib/apiMessages.ts`:
```ts
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
};

export function successMessageFor(endpointName: string, originalArg: unknown): string | undefined {
  const entry = MESSAGES[endpointName];
  return typeof entry === 'function' ? entry(originalArg) : entry;
}
```
`frontend/src/lib/notify.ts`:
```ts
import { toast } from 'sonner';

export interface NotifyOptions {
  /** Same id replaces the existing toast instead of stacking a duplicate. */
  id?: string;
  description?: string;
  duration?: number;
}

type Level = 'success' | 'error' | 'warning' | 'info';

function show(level: Level, message: string, options: NotifyOptions = {}): void {
  toast[level](message, { id: options.id ?? `${level}:${message}`, description: options.description, duration: options.duration });
}

/** The only way the app shows a toast. Four levels, deduplicated by default. */
export const notify = {
  success: (message: string, options?: NotifyOptions) => show('success', message, options),
  error: (message: string, options?: NotifyOptions) => show('error', message, options),
  warning: (message: string, options?: NotifyOptions) => show('warning', message, options),
  info: (message: string, options?: NotifyOptions) => show('info', message, options),
};
```

- [ ] **Step 5: Run and commit**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: PASS (normalizeError 6, apiNotification 6, apiMessages 3), no type errors.
```bash
git add frontend
git commit -m "feat(frontend): add API types, error normalisation and notification rules"
```

---

### Task 13: Store, RTK Query base layer and endpoint slices

**Files:**
- Create: `frontend/src/store/{actions,hooks,index}.ts`, `frontend/src/store/StoreProvider.tsx`
- Create: `frontend/src/store/slices/{authSlice,uiSlice}.ts`, `frontend/src/store/middleware/apiNotificationMiddleware.ts`
- Create: `frontend/src/services/api/{baseQuery,baseApi,authApi,tasksApi,commentsApi,usersApi,dashboardApi}.ts`
- Test: `frontend/src/services/api/baseQuery.test.ts`

**Interfaces:**
- Consumes: `normalizeError`, `notificationFor`, `successMessageFor`, `notify`, types
- Produces:
  - `sessionEnded({ notify: boolean })` action; `makeStore()`, `AppStore`, `RootState`, `AppDispatch`; `useAppDispatch`, `useAppSelector`, `StoreProvider`
  - `authSlice` state `{ user: User | null; status: 'loading' | 'authenticated' | 'unauthenticated' }`; `uiSlice` `{ serverWaking: boolean }` with `setServerWaking`
  - Hooks: `useLoginMutation`, `useLogoutMutation`, `useMeQuery`; `useListTasksQuery(filters)`, `useGetTaskQuery(id)`, `useCreateTaskMutation`, `useUpdateTaskMutation`, `useDeleteTaskMutation`, `useTransitionTaskMutation`, `useGetTaskHistoryQuery(id)`; `useListCommentsQuery(taskId)`, `useCreateCommentMutation`; `useListUsersQuery(params)`, `useListRolesQuery()`, `useCreateUserMutation`; `useGetDashboardQuery()`
  - `TaskFilters { status?; priority?; assigneeId?; search?; page?; limit? }`, `TransitionArg` (from `apiMessages`)
  - `coldStartRetry.delaysMs: number[]` (test hook)

- [ ] **Step 1: Write the failing test** — `frontend/src/services/api/baseQuery.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/store';
import { sessionEnded } from '@/store/actions';
import { authApi } from './authApi';
import { coldStartRetry } from './baseQuery';
import { tasksApi } from './tasksApi';

vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const errorBody = (code: string, statusCode = 401) => ({ statusCode, code, message: code, details: [] });
const emptyPage = { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } };
const pathOf = (request: Request): string => new URL(request.url).pathname;

describe('baseQuery', () => {
  beforeEach(() => {
    coldStartRetry.delaysMs = [0, 0, 0];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes once when several requests find the access token expired, then retries them all', async () => {
    let refreshed = false;
    const calls = { refresh: 0, tasks: 0 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        const path = pathOf(request);
        if (path === '/api/auth/refresh') {
          calls.refresh += 1;
          await new Promise((resolve) => setTimeout(resolve, 20)); // keep it in flight while the others arrive
          refreshed = true;
          return json(200, { refreshed: true });
        }
        calls.tasks += 1;
        return refreshed ? json(200, emptyPage) : json(401, errorBody('TOKEN_EXPIRED'));
      }),
    );

    const store = makeStore();
    const results = await Promise.all([
      store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 })),
      store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 2, limit: 20 })),
      store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 3, limit: 20 })),
    ]);

    expect(calls.refresh).toBe(1);
    expect(results.every((result) => result.isSuccess)).toBe(true);
  });

  it('ends the session without a toast on a first visit when refresh fails', async () => {
    const { notify } = await import('@/lib/notify');
    // Both /auth/me and the follow-up /auth/refresh answer 401: there is no session at all.
    vi.stubGlobal('fetch', vi.fn(async () => json(401, errorBody('UNAUTHENTICATED'))));

    const store = makeStore();
    expect(store.getState().auth.status).toBe('loading');
    const result = await store.dispatch(authApi.endpoints.me.initiate());

    expect(result.isError).toBe(true);
    expect(store.getState().auth.status).toBe('unauthenticated');
    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.info).not.toHaveBeenCalled();
  });

  it('tells a signed-in user their session expired when refresh fails', async () => {
    const { notify } = await import('@/lib/notify');
    const user = { id: 1, name: 'A', email: 'a@x.dev', role: { id: 1, code: 'ADMIN', name: 'Admin' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => (pathOf(request) === '/api/auth/login' ? json(200, { user }) : json(401, errorBody('TOKEN_EXPIRED')))),
    );

    const store = makeStore();
    // Sign in through the real login endpoint so the store is in the authenticated state, as it would be for a user.
    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'pw' }));
    expect(store.getState().auth.status).toBe('authenticated');

    await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));

    expect(store.getState().auth.status).toBe('unauthenticated');
    expect(notify.info).toHaveBeenCalledWith('Your session has expired. Please sign in again.', expect.anything());
  });

  it('never tries to refresh when the login itself is rejected', async () => {
    const fetchMock = vi.fn(async () => json(401, errorBody('UNAUTHENTICATED')));
    vi.stubGlobal('fetch', fetchMock);

    const store = makeStore();
    const result = await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'bad' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.error).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect((result.error as { handled?: boolean }).handled).toBeUndefined();
  });

  it('retries a GET that hits an idle (503) server and then succeeds', async () => {
    const responses = [json(503, '<html>wake up</html>'), json(503, '<html>wake up</html>'), json(200, emptyPage)];
    const fetchMock = vi.fn(async () => responses.shift() as Response);
    vi.stubGlobal('fetch', fetchMock);

    const store = makeStore();
    const result = await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));

    expect(result.isSuccess).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a POST after a network failure, so a task is never created twice', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = makeStore();
    const result = await store.dispatch(
      tasksApi.endpoints.createTask.initiate({ title: 'T', description: 'D', priority: 'LOW', dueDate: '2030-01-01', assigneeId: 2 }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.error).toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('clears cached data when a different user signs in', async () => {
    const user = { id: 1, name: 'A', email: 'a@x.dev', role: { id: 1, code: 'ADMIN', name: 'Admin' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => (pathOf(request) === '/api/auth/login' ? json(200, { user }) : json(200, emptyPage))),
    );

    const store = makeStore();
    await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));
    expect(Object.keys(store.getState().api.queries)).toHaveLength(1);

    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'pw' }));
    expect(Object.keys(store.getState().api.queries)).toHaveLength(0);
  });

  it('exposes sessionEnded for logout flows', () => {
    const store = makeStore();
    store.dispatch(sessionEnded({ notify: false }));
    expect(store.getState().auth).toEqual({ user: null, status: 'unauthenticated' });
  });
});
```
- [ ] **Step 2: Run to see it fail**

Run: `cd frontend && npx vitest run src/services`
Expected: FAIL (modules not found).

- [ ] **Step 3: Actions, slices, notification middleware**

`frontend/src/store/actions.ts`:
```ts
import { createAction } from '@reduxjs/toolkit';

/**
 * Dispatched whenever the session is over (refresh failed, or the user logged out). Lives in its own file so both the
 * API layer and the slices can import it without a circular dependency.
 * `notify` is true only if the user was signed in, so a first visit does not greet them with "session expired".
 */
export const sessionEnded = createAction<{ notify: boolean }>('auth/sessionEnded');
```
`frontend/src/store/slices/authSlice.ts`:
```ts
import { createSlice } from '@reduxjs/toolkit';
import { authApi } from '@/services/api/authApi';
import { User } from '@/types/api';
import { sessionEnded } from '../actions';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: User | null;
  status: AuthStatus;
}

const initialState: AuthState = { user: null, status: 'loading' };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(sessionEnded, () => ({ user: null, status: 'unauthenticated' as const }))
      .addMatcher(authApi.endpoints.me.matchFulfilled, (_state, { payload }) => ({ user: payload, status: 'authenticated' as const }))
      .addMatcher(authApi.endpoints.login.matchFulfilled, (_state, { payload }) => ({ user: payload.user, status: 'authenticated' as const }));
  },
});

export default authSlice.reducer;
```
`frontend/src/store/slices/uiSlice.ts`:
```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  /** True while the API layer is retrying against an idle backend; drives the "waking up" banner. */
  serverWaking: boolean;
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: { serverWaking: false } as UiState,
  reducers: {
    setServerWaking: (state, action: PayloadAction<boolean>) => {
      state.serverWaking = action.payload;
    },
  },
});

export const { setServerWaking } = uiSlice.actions;
export default uiSlice.reducer;
```
`frontend/src/store/middleware/apiNotificationMiddleware.ts`:
```ts
import { isFulfilled, isRejectedWithValue, Middleware, UnknownAction } from '@reduxjs/toolkit';
import { successMessageFor } from '@/lib/apiMessages';
import { notificationFor } from '@/lib/apiNotification';
import { notify } from '@/lib/notify';
import { authApi } from '@/services/api/authApi';
import { baseApi } from '@/services/api/baseApi';
import { ApiError } from '@/types/api';
import { sessionEnded } from '../actions';

interface EndpointMeta {
  endpointName: string;
  type: 'query' | 'mutation';
  originalArgs: unknown;
}

/** RTK Query thunk actions carry the endpoint they belong to in meta.arg; anything else is ignored. */
function endpointMetaOf(action: UnknownAction): EndpointMeta | null {
  const meta = (action as { meta?: { arg?: Partial<EndpointMeta> } }).meta;
  const arg = meta?.arg;
  if (!arg || typeof arg.endpointName !== 'string' || (arg.type !== 'query' && arg.type !== 'mutation')) return null;
  return { endpointName: arg.endpointName, type: arg.type, originalArgs: arg.originalArgs };
}

/**
 * The one place that turns API outcomes into toasts and session side effects, so components never call `notify`
 * for API results:
 *  - every mutation success → success toast (message from apiMessages)
 *  - every API error → toast at the level chosen by notificationFor
 *  - session end → info toast (if the user was signed in) and a wiped query cache
 *  - sign-in → wiped query cache, so one user can never see another user's cached data
 */
export const apiNotificationMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  const unknownAction = action as UnknownAction;

  if (sessionEnded.match(unknownAction)) {
    if (unknownAction.payload.notify) notify.info('Your session has expired. Please sign in again.', { id: 'session-expired' });
    store.dispatch(baseApi.util.resetApiState());
    return result;
  }

  if (authApi.endpoints.login.matchFulfilled(unknownAction)) {
    store.dispatch(baseApi.util.resetApiState());
  }

  const meta = endpointMetaOf(unknownAction);
  if (!meta) return result;

  if (isFulfilled(unknownAction) && meta.type === 'mutation') {
    const message = successMessageFor(meta.endpointName, meta.originalArgs);
    if (message) notify.success(message);
  }

  if (isRejectedWithValue(unknownAction)) {
    const spec = notificationFor(unknownAction.payload as ApiError);
    if (spec) notify[spec.level](spec.message);
  }

  return result;
};
```

- [ ] **Step 4: Base query**

`frontend/src/services/api/baseQuery.ts`:
```ts
import { BaseQueryApi, BaseQueryFn, FetchArgs, fetchBaseQuery, FetchBaseQueryError, FetchBaseQueryMeta } from '@reduxjs/toolkit/query';
import { notify } from '@/lib/notify';
import { normalizeError } from '@/lib/normalizeError';
import { sessionEnded } from '@/store/actions';
import { setServerWaking } from '@/store/slices/uiSlice';
import { ApiError } from '@/types/api';

const rawBaseQuery = fetchBaseQuery({ baseUrl: '/api', credentials: 'include' });

type RawResult = Awaited<ReturnType<typeof rawBaseQuery>>;

const AUTH_ENDPOINTS = ['auth/login', 'auth/refresh', 'auth/logout'];
const GATEWAY_STATUSES = [502, 503, 504];

/** Backoff between attempts when the (free, sleeping) backend is waking up. Mutable so tests can make it instant. */
export const coldStartRetry = { delaysMs: [1000, 2000, 4000] };

const urlOf = (args: string | FetchArgs): string => (typeof args === 'string' ? args : args.url);
const isGet = (args: string | FetchArgs): boolean => typeof args === 'string' || !args.method || args.method.toUpperCase() === 'GET';
const isAuthEndpoint = (args: string | FetchArgs): boolean => AUTH_ENDPOINTS.some((endpoint) => urlOf(args).startsWith(endpoint));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isColdStartFailure(error: FetchBaseQueryError | undefined): boolean {
  if (!error) return false;
  if (error.status === 'FETCH_ERROR') return true;
  if (typeof error.status === 'number') return GATEWAY_STATUSES.includes(error.status);
  return error.status === 'PARSING_ERROR' && GATEWAY_STATUSES.includes(error.originalStatus);
}

function isAuthFailure(error: FetchBaseQueryError | undefined): boolean {
  if (!error || error.status !== 401) return false;
  const code = (error.data as { code?: string } | undefined)?.code;
  return code === 'TOKEN_EXPIRED' || code === 'UNAUTHENTICATED';
}

/**
 * Runs a request and, for GETs only, retries when the backend looks asleep. Retrying a write after a lost response could
 * duplicate it (two tasks created), so mutations are never auto-retried.
 */
async function requestWithColdStartRetry(
  args: string | FetchArgs,
  api: BaseQueryApi,
  extraOptions: object,
): Promise<RawResult> {
  let result = await rawBaseQuery(args, api, extraOptions);

  for (let attempt = 0; attempt < coldStartRetry.delaysMs.length; attempt += 1) {
    if (!isGet(args) || !isColdStartFailure(result.error) || api.signal.aborted) break;
    if (attempt === 0) {
      api.dispatch(setServerWaking(true));
      notify.info('Waking up the server, this can take up to a minute…', { id: 'server-waking', duration: 15000 });
    }
    await sleep(coldStartRetry.delaysMs[attempt]);
    result = await rawBaseQuery(args, api, extraOptions);
  }

  if (!result.error || !isColdStartFailure(result.error)) api.dispatch(setServerWaking(false));
  return result;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Many requests can expire at the same moment. They all share one refresh call: a second concurrent refresh would
 * present an already-rotated token and look like token theft to the backend.
 */
function refreshOnce(api: BaseQueryApi, extraOptions: object): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = requestWithColdStartRetry({ url: 'auth/refresh', method: 'POST' }, api, extraOptions)
      .then((result) => !result.error)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

interface AuthAwareState {
  auth?: { status?: string };
}

export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, ApiError, object, FetchBaseQueryMeta> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await requestWithColdStartRetry(args, api, extraOptions);

  if (isAuthFailure(result.error) && !isAuthEndpoint(args)) {
    if (await refreshOnce(api, extraOptions)) {
      result = await requestWithColdStartRetry(args, api, extraOptions);
    } else {
      const wasSignedIn = (api.getState() as AuthAwareState).auth?.status === 'authenticated';
      api.dispatch(sessionEnded({ notify: wasSignedIn }));
      return { error: { ...normalizeError(result.error), handled: true }, meta: result.meta };
    }
  }

  if (result.error) {
    return { error: normalizeError(result.error, result.meta?.response?.headers.get('retry-after')), meta: result.meta };
  }
  return { data: result.data, meta: result.meta };
};
```
`frontend/src/services/api/baseApi.ts`:
```ts
import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';

/** Shared root of every endpoint group. Feature files add their endpoints with `injectEndpoints`. */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Task', 'Comment', 'History', 'Dashboard', 'User', 'Role'],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
```

- [ ] **Step 5: Endpoint groups**

`frontend/src/services/api/authApi.ts`:
```ts
import { User } from '@/types/api';
import { baseApi } from './baseApi';

export interface LoginRequest {
  email: string;
  password: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<{ user: User }, LoginRequest>({
      query: (body) => ({ url: 'auth/login', method: 'POST', body }),
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: 'auth/logout', method: 'POST' }),
    }),
    me: build.query<User, void>({ query: () => 'auth/me' }),
  }),
});

export const { useLoginMutation, useLogoutMutation, useMeQuery } = authApi;
```
`frontend/src/services/api/tasksApi.ts`:
```ts
import { HistoryEntry, Paginated, Task, TaskPriority, TaskStatus } from '@/types/api';
import type { TransitionArg } from '@/lib/apiMessages';
import { baseApi } from './baseApi';

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  assigneeId: number;
}

export const tasksApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listTasks: build.query<Paginated<Task>, TaskFilters>({
      query: (filters) => ({ url: 'tasks', params: filters }),
      providesTags: (result) => [
        { type: 'Task', id: 'LIST' },
        ...(result?.items ?? []).map(({ id }) => ({ type: 'Task' as const, id })),
      ],
    }),
    getTask: build.query<Task, number>({
      query: (id) => `tasks/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Task', id }],
    }),
    getTaskHistory: build.query<HistoryEntry[], number>({
      query: (id) => `tasks/${id}/history`,
      providesTags: (_result, _error, id) => [{ type: 'History', id }],
    }),
    createTask: build.mutation<Task, TaskInput>({
      query: (body) => ({ url: 'tasks', method: 'POST', body }),
      invalidatesTags: [{ type: 'Task', id: 'LIST' }, 'Dashboard'],
    }),
    updateTask: build.mutation<Task, { id: number; changes: Partial<TaskInput> }>({
      query: ({ id, changes }) => ({ url: `tasks/${id}`, method: 'PATCH', body: changes }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Task', id }, { type: 'Task', id: 'LIST' }, 'Dashboard'],
    }),
    deleteTask: build.mutation<void, number>({
      query: (id) => ({ url: `tasks/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Task', id }, { type: 'Task', id: 'LIST' }, 'Dashboard'],
    }),
    // `from` is not sent: it only lets the success toast tell an approval apart from a rejection.
    transitionTask: build.mutation<Task, TransitionArg>({
      query: ({ id, to, note }) => ({ url: `tasks/${id}/transition`, method: 'POST', body: { to, ...(note ? { note } : {}) } }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Task', id },
        { type: 'Task', id: 'LIST' },
        { type: 'History', id },
        'Dashboard',
      ],
    }),
  }),
});

export const {
  useListTasksQuery,
  useGetTaskQuery,
  useGetTaskHistoryQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useTransitionTaskMutation,
} = tasksApi;
```
`frontend/src/services/api/commentsApi.ts`:
```ts
import { TaskComment } from '@/types/api';
import { baseApi } from './baseApi';

export const commentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listComments: build.query<TaskComment[], number>({
      query: (taskId) => `tasks/${taskId}/comments`,
      providesTags: (_result, _error, taskId) => [{ type: 'Comment', id: taskId }],
    }),
    createComment: build.mutation<TaskComment, { taskId: number; body: string }>({
      query: ({ taskId, body }) => ({ url: `tasks/${taskId}/comments`, method: 'POST', body: { body } }),
      invalidatesTags: (_result, _error, { taskId }) => [{ type: 'Comment', id: taskId }],
    }),
  }),
});

export const { useListCommentsQuery, useCreateCommentMutation } = commentsApi;
```
`frontend/src/services/api/usersApi.ts`:
```ts
import { Paginated, Role, RoleCode, User } from '@/types/api';
import { baseApi } from './baseApi';

export interface UserInput {
  name: string;
  email: string;
  password: string;
  roleId: number;
}

export const usersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listUsers: build.query<Paginated<User>, { roleCode?: RoleCode; page?: number; limit?: number }>({
      query: (params) => ({ url: 'users', params }),
      providesTags: ['User'],
    }),
    listRoles: build.query<Role[], void>({ query: () => 'roles', providesTags: ['Role'] }),
    createUser: build.mutation<User, UserInput>({
      query: (body) => ({ url: 'users', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const { useListUsersQuery, useListRolesQuery, useCreateUserMutation } = usersApi;
```
`frontend/src/services/api/dashboardApi.ts`:
```ts
import { DashboardData } from '@/types/api';
import { baseApi } from './baseApi';

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDashboard: build.query<DashboardData, void>({ query: () => 'dashboard', providesTags: ['Dashboard'] }),
  }),
});

export const { useGetDashboardQuery } = dashboardApi;
```

- [ ] **Step 6: Store, hooks, provider**

`frontend/src/store/index.ts`:
```ts
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { baseApi } from '@/services/api/baseApi';
import { apiNotificationMiddleware } from './middleware/apiNotificationMiddleware';
import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';
import '@/services/api/tasksApi';
import '@/services/api/commentsApi';
import '@/services/api/usersApi';
import '@/services/api/dashboardApi';

const rootReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  auth: authReducer,
  ui: uiReducer,
});

/** A factory, not a singleton: with the App Router each server render must get its own store so state never leaks between requests. */
export const makeStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware, apiNotificationMiddleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore['dispatch'];
```
`frontend/src/store/hooks.ts`:
```ts
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './index';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```
`frontend/src/store/StoreProvider.tsx`:
```tsx
'use client';

import { setupListeners } from '@reduxjs/toolkit/query';
import { ReactNode, useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { AppStore, makeStore } from './index';

export function StoreProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();

  // Enables refetchOnFocus / refetchOnReconnect.
  useEffect(() => {
    const store = storeRef.current;
    return store ? setupListeners(store.dispatch) : undefined;
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
}
```

- [ ] **Step 7: Run and commit**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: PASS (all earlier tests plus 7 in `baseQuery.test.ts`).
```bash
git add frontend
git commit -m "feat(frontend): add Redux store and RTK Query layer with re-auth, cold-start retry and central toasts"
```

---

### Task 14: Hooks, auth UI and the application shell

**Files:**
- Create: `frontend/src/hooks/{useAuth,useDebouncedValue,useApiAction,useConfirm}.ts(x)`, `frontend/src/hooks/useDebouncedValue.test.ts`
- Create: `frontend/src/lib/{demoAccounts,utils}.ts` (utils already exists from shadcn)
- Create: `frontend/src/components/common/{StatusBadge,PriorityBadge,EmptyState,ErrorState,PageHeader}.tsx`
- Create: `frontend/src/components/auth/AuthGate.tsx`
- Create: `frontend/src/components/layout/{AppShell,Sidebar,Topbar,ThemeToggle,ServerStatusBanner}.tsx`
- Create: `frontend/src/app/(auth)/login/page.tsx`, `frontend/src/app/(app)/layout.tsx`
- Modify: `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: store, API hooks, `notify`, types
- Produces:
  - `useDebouncedValue<T>(value: T, delayMs?: number): T`
  - `useApiAction(): { run<T>(request: () => Promise<T>): Promise<ActionResult<T>>; isPending: boolean }`, `ActionResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }`, `applyFieldErrors(error, setError): boolean`
  - `useConfirm(): (options: ConfirmOptions) => Promise<ConfirmResult>`; `ConfirmOptions { title; description?; confirmLabel?; destructive?; note?: { label; required; placeholder? } }`; `ConfirmResult { confirmed: boolean; note: string }`; `<ConfirmProvider>`
  - `useAuth(): { user; status; isAdmin; isEmployee; logout(): Promise<void>; isLoggingOut }`
  - Components: `<StatusBadge status>`, `<PriorityBadge priority>`, `<EmptyState title description? action?>`, `<ErrorState title? message onRetry?>`, `<PageHeader title description? actions?>`, `<AuthGate>`, `<AppShell>`
  - `DEMO_ACCOUNTS`

- [ ] **Step 1: Write the failing hook test** — `frontend/src/hooks/useDebouncedValue.test.ts`

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('only updates after the delay and restarts the timer on every change', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), { initialProps: { value: 'a' } });

    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'abc' });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('a'); // 400ms passed in total, but the last change was only 200ms ago

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('abc');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd frontend && npx vitest run src/hooks`
Expected: FAIL (module not found).

- [ ] **Step 3: Hooks**

`frontend/src/hooks/useDebouncedValue.ts`:
```ts
import { useEffect, useState } from 'react';

/** Returns `value` only after it has stopped changing for `delayMs`. Used so typing in search does not fire a request per keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```
`frontend/src/hooks/useApiAction.ts`:
```ts
import { useCallback, useRef, useState } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { normalizeError } from '@/lib/normalizeError';
import { ApiError } from '@/types/api';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Runs one API action (typically `() => trigger(arg).unwrap()`) and reports the outcome as a value instead of throwing.
 * It does NOT toast: success and error toasts come from the notification middleware. It exists for two things the
 * middleware cannot do: a double-submit guard and a pending flag for the calling component.
 */
export function useApiAction(): { run: <T>(request: () => Promise<T>) => Promise<ActionResult<T>>; isPending: boolean } {
  const [isPending, setIsPending] = useState(false);
  // A ref, not state: two clicks in the same tick both see the stale `isPending === false`.
  const inFlight = useRef(false);

  const run = useCallback(async <T>(request: () => Promise<T>): Promise<ActionResult<T>> => {
    if (inFlight.current) return { ok: false, error: normalizeError(new Error('Another request is already in progress.')) };
    inFlight.current = true;
    setIsPending(true);
    try {
      return { ok: true, data: await request() };
    } catch (error) {
      return { ok: false, error: normalizeError(error) };
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  }, []);

  return { run, isPending };
}

/** Copies backend field errors onto a react-hook-form. Returns true if at least one field was matched. */
export function applyFieldErrors<T extends FieldValues>(error: ApiError, setError: UseFormSetError<T>, fields: readonly string[]): boolean {
  let matched = false;
  for (const detail of error.details) {
    if (fields.includes(detail.field)) {
      setError(detail.field as Path<T>, { type: 'server', message: detail.message });
      matched = true;
    }
  }
  return matched;
}
```
`frontend/src/hooks/useConfirm.tsx`:
```tsx
'use client';

import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Adds a note box. When `required`, Confirm stays disabled until it has text. */
  note?: { label: string; required: boolean; placeholder?: string };
}

export interface ConfirmResult {
  confirmed: boolean;
  note: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [note, setNote] = useState('');
  const resolver = useRef<((result: ConfirmResult) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setNote('');
    setOptions(next);
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (confirmed: boolean): void => {
    resolver.current?.({ confirmed, note: note.trim() });
    resolver.current = null;
    setOptions(null);
  };

  const noteMissing = Boolean(options?.note?.required) && note.trim().length === 0;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.description && <DialogDescription asChild><div>{options.description}</div></DialogDescription>}
          </DialogHeader>
          {options?.note && (
            <div className="space-y-2">
              <Label htmlFor="confirm-note">{options.note.label}</Label>
              <Textarea
                id="confirm-note"
                value={note}
                maxLength={1000}
                placeholder={options.note.placeholder}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button variant={options?.destructive ? 'destructive' : 'default'} disabled={noteMissing} onClick={() => settle(true)}>
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
```
`frontend/src/hooks/useAuth.ts`:
```ts
import { useCallback } from 'react';
import { useLogoutMutation } from '@/services/api/authApi';
import { sessionEnded } from '@/store/actions';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export function useAuth() {
  const dispatch = useAppDispatch();
  const { user, status } = useAppSelector((state) => state.auth);
  const [logoutRequest, { isLoading: isLoggingOut }] = useLogoutMutation();

  const logout = useCallback(async (): Promise<void> => {
    // Even if the request fails (e.g. offline) the local session must end; the error toast still explains what happened.
    await logoutRequest()
      .unwrap()
      .catch(() => undefined);
    dispatch(sessionEnded({ notify: false }));
  }, [dispatch, logoutRequest]);

  return {
    user,
    status,
    isAdmin: user?.role.code === 'ADMIN',
    isEmployee: user?.role.code === 'EMPLOYEE',
    logout,
    isLoggingOut,
  };
}
```

- [ ] **Step 4: Shared components**

`frontend/src/components/common/StatusBadge.tsx`:
```tsx
import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, STATUS_STYLES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { TaskStatus } from '@/types/api';

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }): React.JSX.Element {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', STATUS_STYLES[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
```
`frontend/src/components/common/PriorityBadge.tsx`:
```tsx
import { Badge } from '@/components/ui/badge';
import { PRIORITY_LABEL, PRIORITY_STYLES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { TaskPriority } from '@/types/api';

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }): React.JSX.Element {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', PRIORITY_STYLES[priority], className)}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}
```
`frontend/src/components/common/EmptyState.tsx`:
```tsx
import { Inbox } from 'lucide-react';
import { ReactNode } from 'react';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```
`frontend/src/components/common/ErrorState.tsx`:
```tsx
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}): React.JSX.Element {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="font-medium">{title}</p>
      {message && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
```
`frontend/src/components/common/PageHeader.tsx`:
```tsx
import { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }): React.JSX.Element {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Auth gate, shell, providers**

`frontend/src/components/auth/AuthGate.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useMeQuery } from '@/services/api/authApi';
import { useAppSelector } from '@/store/hooks';

/**
 * Client-side gate for every authenticated page. It restores the session through GET /auth/me (the API layer refreshes
 * an expired access token transparently) and sends visitors without a session to the login page. This is UX only: the
 * backend independently rejects every unauthenticated request.
 */
export function AuthGate({ children }: { children: ReactNode }): React.JSX.Element {
  const router = useRouter();
  const status = useAppSelector((state) => state.auth.status);
  // Only ask once: after login the user is already in the store, and after a failure `status` is no longer 'loading'.
  const me = useMeQuery(undefined, { skip: status !== 'loading' });

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'authenticated') return <>{children}</>;

  if (status === 'loading' && me.isError) {
    return (
      <div className="mx-auto mt-24 max-w-md px-4">
        <ErrorState title="Cannot reach the server" message="We could not verify your session. Check your connection and try again." onRetry={() => void me.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto mt-24 max-w-md space-y-3 px-4" aria-busy="true" aria-label="Loading your session">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
```
`frontend/src/components/layout/ThemeToggle.tsx`:
```tsx
'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle(): React.JSX.Element {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </Button>
  );
}
```
`frontend/src/components/layout/ServerStatusBanner.tsx`:
```tsx
'use client';

import { Loader2 } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';

/** Shown while the free-tier backend is waking up, so a slow first load does not look like a broken app. */
export function ServerStatusBanner(): React.JSX.Element | null {
  const waking = useAppSelector((state) => state.ui.serverWaking);
  if (!waking) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Waking up the server. The first request can take up to a minute.
    </div>
  );
}
```
`frontend/src/components/layout/Sidebar.tsx`:
```tsx
'use client';

import { CheckSquare, LayoutDashboard, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, adminOnly: false },
  { href: '/users', label: 'Users', icon: Users, adminOnly: true },
] as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```
`frontend/src/components/layout/Topbar.tsx`:
```tsx
'use client';

import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { SidebarNav } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

export function Topbar(): React.JSX.Element {
  const { user, logout, isLoggingOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64">
            <SheetHeader>
              <SheetTitle>Task &amp; Approval</SheetTitle>
            </SheetHeader>
            <div className="px-4">
              <SidebarNav onNavigate={() => setMenuOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <span className="font-semibold md:hidden">Task &amp; Approval</span>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2" aria-label="Account menu">
              <span className="hidden text-sm sm:inline">{user?.name}</span>
              <Badge variant="secondary">{user?.role.name}</Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs font-normal text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={isLoggingOut} onSelect={() => void logout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
```
`frontend/src/components/layout/AppShell.tsx`:
```tsx
import { ReactNode } from 'react';
import { ServerStatusBanner } from './ServerStatusBanner';
import { SidebarNav } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <ServerStatusBanner />
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r p-4 md:block">
          <p className="mb-6 px-3 text-lg font-semibold tracking-tight">Task &amp; Approval</p>
          <SidebarNav />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
```
`frontend/src/app/(app)/layout.tsx`:
```tsx
import { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { AppShell } from '@/components/layout/AppShell';

export default function AppLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
```
`frontend/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { StoreProvider } from '@/store/StoreProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Task & Approval',
  description: 'Assign tasks, track progress and approve completed work.',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <StoreProvider>
            <ConfirmProvider>
              {children}
              <Toaster richColors closeButton position="top-right" />
            </ConfirmProvider>
          </StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```
`frontend/src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function HomePage(): never {
  redirect('/dashboard');
}
```

- [ ] **Step 6: Login page**

`frontend/src/lib/demoAccounts.ts`:
```ts
/** Public demo credentials, identical to the seed data and published in the README. */
export const DEMO_ACCOUNTS = [
  { label: 'Admin', name: 'Aarav Mehta', email: 'admin@taskapp.dev', password: 'Admin@12345' },
  { label: 'Employee 1', name: 'Priya Sharma', email: 'priya@taskapp.dev', password: 'Employee@12345' },
  { label: 'Employee 2', name: 'Rahul Verma', email: 'rahul@taskapp.dev', password: 'Employee@12345' },
] as const;
```
`frontend/src/app/(auth)/login/page.tsx`:
```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ServerStatusBanner } from '@/components/layout/ServerStatusBanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { applyFieldErrors, useApiAction } from '@/hooks/useApiAction';
import { DEMO_ACCOUNTS } from '@/lib/demoAccounts';
import { useLoginMutation, useMeQuery } from '@/services/api/authApi';
import { useAppSelector } from '@/store/hooks';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const status = useAppSelector((state) => state.auth.status);
  const [login] = useLoginMutation();
  const { run, isPending } = useApiAction();
  // Detects an existing session (and wakes a sleeping backend) while the form is already usable.
  useMeQuery(undefined, { skip: status !== 'loading' });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  const onSubmit = async (values: FormValues): Promise<void> => {
    const result = await run(() => login(values).unwrap());
    if (result.ok) router.replace('/dashboard');
    else applyFieldErrors(result.error, form.setError, ['email', 'password']);
  };

  return (
    <>
      <ServerStatusBanner />
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Task &amp; Approval</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to manage and approve tasks.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your work email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
                {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
                {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Demo accounts</CardTitle>
            <CardDescription>Click an account to fill the form, then sign in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                type="button"
                variant="outline"
                className="h-auto w-full justify-between py-2 text-left"
                onClick={() => form.reset({ email: account.email, password: account.password })}
              >
                <span>
                  <span className="block text-sm font-medium">{account.label}</span>
                  <span className="block text-xs text-muted-foreground">{account.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">{account.name}</span>
              </Button>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Sessions are shared by tabs of one browser. To try two roles at once, sign in as the second user in a private/incognito window or another browser.
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
```
Note: `useMeQuery` here and in `AuthGate` share one cache entry, so navigating from login to the dashboard does not refetch the session.

- [ ] **Step 7: Run checks**

Run: `cd frontend && npx vitest run && npm run typecheck && npm run lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 8: Manual verification against the running backend**

With the backend (`npm run start:dev` in `backend/`) and `npm run dev` in `frontend/`:
1. Open `http://localhost:3000` → redirected to `/login` (no "session expired" toast).
2. Click "Admin" under Demo accounts, Sign in → success toast "Signed in successfully", redirected to `/dashboard` (a placeholder 404 is expected until Plan 04; the shell and sidebar still render around it only on existing routes, so also temporarily visit `/dashboard` after Plan 04).
3. Enter a wrong password → red toast "Invalid email or password", form stays.
4. Refresh the browser on an authenticated page after Plan 04 → stays signed in.
Stop the dev servers.

- [ ] **Step 9: Commit**

```bash
git add frontend
git commit -m "feat(frontend): add hooks, login page and authenticated app shell"
```
