# Task & Approval Management — Design Spec

Date: 2026-10-10
Status: Draft for review

## 1. Purpose

A small, production-quality Task & Approval Management web app built for a Full Stack Developer
assessment (5–6 years experience level). Reviewers will test the **live deployed app** by running a
task through the full workflow as Admin and Employee, checking persistence and role restrictions, and
then reading the repository and README.

Success means: the workflow works reliably end to end, permissions are enforced on the backend, and the
code reads as consistently senior-level (clear boundaries, typed, tested where it matters, documented
where the *why* is non-obvious).

## 2. Requirements traceability (assessment → design)

### 2.1 Functional

| # | Assessment requirement | Design answer | Section |
|---|---|---|---|
| 1 | Admin and Employee roles; seed 1 Admin + 2 Employees; Admin can create users or use seeded | `roles` table (extensible), idempotent seed script, `GET /roles`, `POST /users` (Admin, role chosen from dropdown) + Users page | 4, 5, 6 |
| 2 | Admin creates, edits, deletes, assigns tasks (title, description, priority, due date); views all | Task CRUD endpoints (Admin), soft delete | 5.3 |
| 3 | Employee sees only assigned tasks, adds comments, Pending→In Progress, In Progress→Pending Approval | Query scoping in service layer; comments endpoint; state machine | 5.4 |
| 4 | Admin approves Pending Approval→Completed or rejects→In Progress; Employee cannot approve | State machine table, role-checked in service | 5.4 |
| 5 | Dashboard counts by status, scoped to permitted tasks | `GET /dashboard` using the same scoping as list | 5.5 |
| 6 | Filter by status, priority; Admin filters by employee | Query DTO filters; employee filter ignored/forced for Employee | 5.3 |

### 2.2 Engineering

| Requirement | Design answer |
|---|---|
| Persist users, tasks, comments, status history in MySQL | 4 tables, TypeORM entities (section 4) |
| Migrations/schema and seed instructions | TypeORM migrations (`synchronize: false`), seed script, documented in README |
| Permissions enforced in backend, all task endpoints protected, inputs validated | Global JWT guard, `RolesGuard`, service-level ownership checks, global `ValidationPipe` (whitelist, forbid unknown) |
| Hash passwords, parameterized SQL/ORM, secrets in env, never commit credentials | bcrypt, TypeORM query builder with bound params, validated env config, `.env.example` only |
| Clear errors, usable UI | One error shape with stable codes; toast on every API result; loading/empty/error states |
| Basic tests for ≥3 backend scenarios incl. authorization and approval | Section 8 (5 scenario groups) |

### 2.3 Submission checklist

| Deliverable | Plan |
|---|---|
| Live HTTPS URL, online ≥14 days | Vercel (FE) + Render free (BE) + Aiven free MySQL (fallback TiDB Cloud Starter). Keep-alive ping + wake-up UI. Verify day-14 status before submitting. |
| Test accounts | Seeded demo accounts shown in README and as one-click fill on login page |
| GitHub repo, all FE and BE code | Single repo: `frontend/`, `backend/`, root README |
| README | Setup commands, env var **names**, migrate/seed steps, architecture, test commands, known limitations |
| Short note: AI tools used, what was verified | `docs/AI-USAGE.md` + linked from README |

### 2.4 How the reviewer will test (design must satisfy each step)

1. Log in as Admin → create + assign task. ✔ CRUD + assign.
2. Log in as Employee in a **separate session** → move task to In Progress and Pending Approval. ✔ See known limitation below.
3. Admin approves or rejects. ✔ State machine.
4. Refresh and log in again → data persisted. ✔ MySQL; session restored via `/auth/me`.
5. Check role restrictions. ✔ Backend guards + 404 on foreign tasks.
6. Review repo and README. ✔ Section 9.

**Known limitation to document:** auth uses a cookie, which is shared by tabs in the same browser
profile. Logging in as Employee in a second tab of the same browser replaces the Admin session.
The README and login page will say: *use a private/incognito window or a second browser for the second role.*

## 3. Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui, Redux Toolkit + RTK Query, React Hook Form + zod, sonner (toasts), lucide icons |
| Backend | NestJS (Express adapter) + TypeScript (strict), TypeORM, `mysql2`, class-validator/class-transformer, `@nestjs/throttler`, helmet, bcrypt, Swagger |
| Database | MySQL 8 |
| Auth | Access token (JWT, 30 min) + rotating refresh token (opaque, 1 year, hashed in DB), both in httpOnly Secure SameSite cookies; bcrypt password hashes |
| Tests | Jest + supertest against a real MySQL test DB (docker-compose) |
| Tooling | ESLint + Prettier in both packages, strict TS, no `any` |

## 4. Data model

Enums (defined once in backend `common/enums`, mirrored in `frontend/src/lib/constants.ts` with labels and colors):

- `RoleCode` (constants for the system roles stored in the `roles` table): `ADMIN`, `EMPLOYEE`. Roles themselves are rows, not an enum, so a new role can be added without a schema change.
- `TaskStatus`: `PENDING`, `IN_PROGRESS`, `PENDING_APPROVAL`, `COMPLETED` (UI label for `PENDING` is "Pending")
- `TaskPriority`: `LOW`, `MEDIUM`, `HIGH`

Persisted as native MySQL `ENUM` columns through TypeORM.

| Table | Columns |
|---|---|
| `roles` | id (PK), code (unique, e.g. `ADMIN`, `EMPLOYEE`), name (display label), created_at |
| `users` | id (PK), name, email (unique), password_hash, role_id (FK roles), created_at, updated_at |
| `tasks` | id, title, description, priority, status (default `PENDING`), due_date, assignee_id (FK users), created_by_id (FK users), deleted_at (soft delete), created_at, updated_at |
| `task_comments` | id, task_id (FK), author_id (FK), body, created_at |
| `task_status_history` | id, task_id (FK), from_status (nullable), to_status, actor_id (FK), note (nullable), created_at |
| `refresh_tokens` | id, user_id (FK), family_id, token_hash (unique, SHA-256), expires_at, revoked_at (nullable), replaced_by_id (nullable), user_agent, ip, created_at |

Indexes: `tasks(assignee_id, status)`, `tasks(status, priority)`, `tasks(due_date)`, `task_comments(task_id, created_at)`, `task_status_history(task_id, created_at)`.

Task creation writes the first history row with `from_status = NULL`. Deleting is soft; comments and history stay intact.

## 5. Backend

### 5.1 Structure

```
backend/src/
  main.ts                   helmet, cookie-parser, ValidationPipe, Swagger, trust proxy
  app.module.ts
  config/                   typed config + env validation (fail fast on missing vars)
  database/
    data-source.ts          shared by app and TypeORM CLI
    migrations/
    seeds/seed.ts           idempotent
  common/
    decorators/             @CurrentUser, @Roles, @Public
    guards/                 JwtAuthGuard (global), RolesGuard
    filters/                AllExceptionsFilter
    interceptors/           request-id + logging
    dto/                    PaginationQueryDto, Paginated<T>
    enums/
  modules/
    auth/  users/  tasks/  comments/  dashboard/  health/
```

Each module: thin controller, service holding business logic, DTOs, entity. Controllers never touch repositories.

### 5.2 Error contract

Every error, from every endpoint:

```json
{ "statusCode": 422, "code": "VALIDATION_ERROR", "message": "Validation failed",
  "details": [{ "field": "title", "message": "title must not be empty" }],
  "requestId": "…", "timestamp": "…", "path": "/api/tasks" }
```

Codes: `UNAUTHENTICATED`, `TOKEN_EXPIRED` (access token expired; client should refresh), `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `INVALID_TRANSITION`,
`STATE_CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`. Unknown errors are logged with the request id and
returned as `INTERNAL_ERROR` without leaking internals.

### 5.3 Endpoints

| Endpoint | Access | Notes |
|---|---|---|
| `POST /auth/login` | Public, throttled 5/min | Sets access and refresh cookies. Identical error for unknown email and wrong password |
| `POST /auth/refresh` | Public (needs refresh cookie), throttled 30/min | Rotates the refresh token and issues a new access token (see 5.7) |
| `POST /auth/logout` | Public (needs refresh cookie) | Revokes the token family and clears both cookies. Works even when the access token has expired |
| `GET /auth/me` | Authenticated | Session restore |
| `GET /tasks` | Authenticated | Filters: `status`, `priority`, `assigneeId`, `search`, `page`, `limit`. Employee: forced to own tasks; `assigneeId` ignored |
| `POST /tasks` | Admin | Status always starts `PENDING`; assignee must be an Employee |
| `GET /tasks/:id` | Admin or assignee | Others get 404 (existence not leaked) |
| `PATCH /tasks/:id` | Admin | Not allowed when `COMPLETED` |
| `DELETE /tasks/:id` | Admin | Soft delete |
| `POST /tasks/:id/transition` | By state machine | Body `{ to, note? }` |
| `GET/POST /tasks/:id/comments` | Admin or assignee | |
| `GET /tasks/:id/history` | Admin or assignee | |
| `GET /dashboard` | Authenticated | Counts per status, same scoping as list |
| `GET /roles` | Admin | Feeds the role dropdown on the Create User form |
| `GET/POST /users` | Admin | `POST` takes `{ name, email, password, roleId }`. `GET /users?roleCode=EMPLOYEE` feeds assignee and filter dropdowns |
| `GET /health` | Public | Warm-up and uptime ping |

Throttling: global 100/min; login 5/min; transitions and comments 20/min. Throttled responses carry `Retry-After`.

### 5.4 Task state machine

A pure function in `tasks/task-state-machine.ts`: `canTransition(role, isAssignee, from, to)`, backed by one table.

| From | To | Allowed actor | Note |
|---|---|---|---|
| PENDING | IN_PROGRESS | Assigned Employee | optional |
| IN_PROGRESS | PENDING_APPROVAL | Assigned Employee | optional |
| PENDING_APPROVAL | COMPLETED | Admin | optional |
| PENDING_APPROVAL | IN_PROGRESS | Admin (reject) | **required** |

Everything else → `INVALID_TRANSITION`. An Admin who is not the assignee cannot perform employee steps;
an Employee can never approve or reject.

Service flow, inside one transaction:
1. Load task with scoping (404 if the actor may not see it).
2. Check `canTransition`.
3. `UPDATE tasks SET status = :to WHERE id = :id AND status = :from` and require `affected === 1`; otherwise `STATE_CONFLICT` (409). This makes concurrent or double submissions safe.
4. Insert the `task_status_history` row.

### 5.5 Dashboard

One `GROUP BY status` query, with the same scoping as the task list so the numbers always agree with the list.
Missing statuses are filled with `0`.

### 5.6 Seed

Idempotent (upsert by `roles.code` and by email). Creates the `ADMIN` and `EMPLOYEE` roles, then 1 Admin, 2 Employees, and a handful of tasks across all statuses
and priorities for a useful first view. Demo passwords are documented demo values, overridable via env.

### 5.7 Authentication: access and refresh tokens

| | Access token | Refresh token |
|---|---|---|
| Format | Signed JWT (`sub`, role code, `exp`) | Opaque random 256-bit value, never a JWT |
| Lifetime | **30 minutes** | **1 year** (each rotated token is valid 1 year from its own issue) |
| Storage | httpOnly Secure SameSite cookie, sent on every API call | httpOnly Secure SameSite cookie, `Path` limited to the auth routes so it is not sent with other calls. In the DB only its SHA-256 hash is stored (the value is high-entropy, so a fast hash is correct here; bcrypt is for passwords) |
| Verified by | JWT signature, no DB lookup | DB lookup by hash |

Flow:
1. **Login** creates a new token *family* and sets both cookies.
2. When the access token expires, a protected call returns `401 TOKEN_EXPIRED`.
3. **Refresh** looks up the presented token. It must exist, not be revoked, and not be expired. It is then revoked and replaced (`replaced_by_id`) by a new token in the same family, and a new access token is issued (rotation).
4. **Reuse detection:** if an already-rotated token is presented again, the whole family is revoked and the user must log in again, because the token was probably stolen. A **10-second grace window** after rotation accepts the previous token without revoking, so two tabs refreshing at the same moment do not log the user out by mistake.
5. **Logout** revokes the family and clears both cookies. Expired and revoked rows of a user are deleted on their next login, so the table does not grow without bound and no scheduler is required.

Why 30 min and 1 year is acceptable: a stolen access token is only useful for 30 minutes, and the long-lived refresh token is rotated on every use, revocable in the DB, hashed at rest, and unreachable from JavaScript. The 1-year lifetime is the requested "stay signed in" behavior and is called out in the README as a deliberate trade-off.

Env var names: `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL` (default `30m`), `REFRESH_TOKEN_TTL_DAYS` (default `365`), `COOKIE_SECURE`.

## 6. Frontend

### 6.1 Structure

```
frontend/src/
  app/
    (auth)/login/
    (app)/layout.tsx  dashboard/  tasks/  tasks/[id]/  users/
    layout.tsx                 StoreProvider + Toaster
  components/auth/AuthGate.tsx client gate: bootstraps via GET /auth/me (refreshing if needed), shows a skeleton, redirects to login on failure. No cookie-based Next middleware, because the access cookie expires every 30 minutes while the refresh cookie is not visible to pages
  store/
    index.ts  StoreProvider.tsx
    slices/authSlice.ts  uiSlice.ts
    middleware/apiNotificationMiddleware.ts
  services/api/
    baseApi.ts  authApi.ts  tasksApi.ts  commentsApi.ts  usersApi.ts  dashboardApi.ts
  lib/
    notify.ts  normalizeError.ts  apiMessages.ts  constants.ts
  hooks/
    useAppDispatch, useAppSelector, useAuth, usePermissions, useDebouncedValue,
    useTaskFilters, useApiAction, useServerWakeup, useConfirm
  components/
    ui/ (shadcn)  layout/  tasks/  dashboard/  common/
```

`rewrites` proxies `/api/*` to the backend so the auth cookie is first-party.

### 6.2 API layer (RTK Query)

- `baseApi`: `fetchBaseQuery({ baseUrl: '/api', credentials: 'include' })`, wrapped with a **re-auth layer**: on `401 TOKEN_EXPIRED` it calls `POST /auth/refresh` once and retries the original request. Concurrent 401s share a **single in-flight refresh** (a mutex, so N parallel calls trigger one refresh, which also avoids tripping reuse detection). If refresh fails, clear auth state and the cache, show an info toast, and redirect to login. Any other 401 (outside login) takes the same logout path; on network error / 502 / 503 / 504 set `serverWaking` and retry with backoff (3 attempts).
- Endpoints added with `injectEndpoints` per feature. Tag types: `Task` (id and LIST), `Comment`, `History`, `Dashboard`, `User`. Mutations invalidate exactly the tags they affect.
- `normalizeError` converts anything (backend error shape, fetch error, timeout) to one typed `ApiError`.

### 6.3 Notifications — toast on every API result

`notify.success | error | warning | info(message, opts)` wraps sonner, with dedupe ids.

| Case | Toast |
|---|---|
| Every **mutation success** (login, logout, task create/edit/delete, transition, comment, user create) | success — specific message from `apiMessages.ts` |
| Every API **error** (query or mutation) | error — backend `message` |
| 409 `STATE_CONFLICT`, 429 `RATE_LIMITED` | warning (+ auto refetch on 409) |
| 401 session expired, server cold start | info |
| 422 validation | error toast **and** field errors set on the form |
| GET **success** | no toast (would fire on every page load and filter change) |

One RTK middleware matches `isFulfilled` and `isRejectedWithValue` and emits toasts from a central message map.
Components contain no toast code. `useApiAction` handles pending state (double-submit guard) and maps
422 details to form fields.

### 6.4 Status change UX

Status changes happen through a **status dropdown**, with no dedicated Start/Submit buttons.

- All four statuses are listed; only allowed next statuses are selectable (from `usePermissions().allowedTransitions(task)`, a mirror of the backend table). Others are disabled with a tooltip stating why. If nothing is selectable the dropdown is disabled.
- Choosing an option opens a confirmation dialog (`useConfirm`): "Move task to **X**? (From → To)".
- Reject requires a reason (Confirm disabled until filled). All other changes have an optional note.
- Cancel reverts the dropdown with no API call. Confirm disables the control while pending.
- The frontend check is UX only. The backend enforces every rule.

### 6.5 Debounce and throttle

- Search box: 300 ms debounce, synced to URL query params; page resets to 1 on any filter change. RTK Query caching dedupes identical arguments.
- Mutating controls disabled while pending (UI-level throttle); backend rate limits and conditional update are the real protection.
- No polling. Refresh on tag invalidation and `refetchOnFocus`.

### 6.6 UI

shadcn/ui + Tailwind, light theme with dark-mode support, indigo accent.

- Login: centered card, demo-account panel with one-click fill, note about incognito for the second role.
- Shell: sidebar (Dashboard, Tasks, Users for Admin) + topbar (user, role badge, logout); sidebar becomes a sheet on mobile.
- Dashboard: four status cards plus a "Needs attention" list (Admin: awaiting approval; Employee: assigned to me).
- Tasks: debounced search; status, priority, and (Admin) employee filters; table with priority and status badges, assignee, due date (red when overdue); pagination; skeleton, empty, and error-with-retry states.
- Task detail: details, status dropdown, tabs for Comments and History (timeline with actor, transition, note).
- Users (Admin): list + create form.

## 7. Security summary

bcrypt hashing; short-lived access JWT plus rotating, hashed, revocable refresh token with reuse detection, both in httpOnly Secure SameSite cookies; global auth guard with explicit `@Public()` opt-out;
role and ownership checks in services; 404 for unauthorized task access; DTO whitelist and forbid unknown
fields; ORM-bound parameters only; helmet; strict env validation; rate limiting; no secrets in the repo;
CORS closed (same-origin through the proxy).

## 8. Testing

Backend (Jest + supertest, real MySQL via docker-compose):

1. State machine: table-driven unit test of every allowed and forbidden (role, from, to) combination.
2. Authorization: Employee cannot read, modify, or comment on another Employee's task (404); Employee cannot call Admin-only endpoints (403); unauthenticated requests get 401.
3. Approval: Employee cannot approve; Admin approve writes history and sets `COMPLETED`; Admin reject without a note fails, with a note returns the task to `IN_PROGRESS`.
4. Concurrency: two simultaneous transitions from the same state yield one success and one 409.
5. Throttling: sixth login attempt in a minute returns 429.
6. Tokens: an expired access token returns `401 TOKEN_EXPIRED` and a valid refresh issues a new pair; refresh rotates the token; replaying a rotated token (outside the grace window) revokes the family; logout revokes the refresh token so it can no longer be used.

Frontend: unit tests for `normalizeError` and `useTaskFilters` if time allows. A manual end-to-end pass of the reviewer flow (section 2.4) against the deployed URL is mandatory before submitting.

## 9. Code quality conventions

- TypeScript strict in both packages; no `any`; explicit return types on exported functions.
- One responsibility per file; business rules live in services or pure functions, never in controllers or components.
- Comments explain *why* (constraints, trade-offs, non-obvious decisions), not *what*; JSDoc on public service methods and shared utilities.
- Consistent naming and folder conventions across FE and BE; ESLint + Prettier enforced by scripts.
- Conventional-commit messages; small, focused commits.
- No dead code, no commented-out blocks, no placeholder TODOs.

## 10. Deployment

| Piece | Host | Notes |
|---|---|---|
| Frontend | Vercel Hobby | `rewrites` to the backend URL |
| Backend | Render free web service | Sleeps after 15 min idle; mitigated by `/health` keep-alive ping (UptimeRobot) and a wake-up info toast |
| Database | Aiven free MySQL (fallback: TiDB Cloud Starter) | TLS required; confirm idle power-off behavior before submitting |

Before submitting: confirm all three services will stay up through day 14; run migrations and seed against the
production DB; run the full reviewer flow on the live URL.

## 11. Repository layout

```
task-approval-app/
  README.md                 overview, architecture, demo accounts, deploy steps, limitations
  docs/AI-USAGE.md          AI tools used and what was personally verified
  docker-compose.yml        local MySQL (dev + test)
  frontend/                 README.md, .env.example
  backend/                  README.md, .env.example
```

README sections: prerequisites, setup commands, env var names, MySQL init / migrate / seed, run, test commands,
architecture overview, demo accounts, deployment, known limitations.

## 12. Out of scope

Only Admins create users; Employees cannot. Roles are data, but **what a role may do is defined in code**
(guards and the state machine key off `roles.code`). A new role row therefore appears in the Create User
dropdown automatically, yet needs code changes to gain permissions. A dynamic permissions system
(`permissions` / `role_permissions`) is out of scope and listed as a known limitation in the README.
Tasks can be assigned only to users whose role code is `EMPLOYEE`.

Also out of scope: User deactivation or password reset, email notifications, file attachments, real-time updates, audit export,
multi-tenant support, i18n.

## 13. Open items

- Free-tier idle behavior of Aiven MySQL and Render must be verified on the vendors' current pages before deploy.
- Final demo credentials are chosen at seed time and listed in the README.
