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
| 1 | Admin and Employee roles; seed 2 Admins + 3 Employees; Admin can create users or use seeded | `roles` table (extensible), idempotent seed script, `GET /roles`, Admin-only users CRUD (create, edit, soft delete) + Users page | 4, 5, 6 |
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
| `users` | id (PK), name, email (unique), phone (nullable), password_hash, role_id (FK roles), is_default (seeded accounts), deleted_at (soft delete), created_at, updated_at |
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
  main.ts, app.setup.ts     global prefix /api, URI versioning (/api/v1), request id, helmet, cookie-parser, CORS,
                            body parsers, ValidationPipe, exception filter, trust proxy; Swagger (see 5.8)
  app.module.ts             Nest middleware: Origin check, then JWT auth on every route except an exclusion list
                            (POST auth/login, auth/refresh, auth/logout; GET/HEAD health)
  config/                   typed config + env validation (fail fast on missing vars)
  database/
    data-source.ts          shared by the TypeORM CLI and the seed
    migrations/
    seeds/seed.ts           idempotent
  security/                 token, password and cookie helpers; global guards registered here
  common/
    decorators/             @CurrentUser, @Roles
    guards/                 RolesGuard, AppThrottlerGuard (both global)
    middleware/             request id (Express), Origin check, JWT auth (Nest middleware)
    errors/                 AppException, error codes, AllExceptionsFilter, body-parser error mapping
    pipes/  dto/  enums/
  modules/<name>/           auth  users  tasks  comments  dashboard  health
    controllers/ services/ dto/ entities/ (mappers/, state-machine/ where needed)
```

Each module: thin controller, service holding business logic, DTOs, entity. Controllers never touch repositories.
There is no logging interceptor: errors are logged by the exception filter with the request id.

### 5.2 Error contract

Every error, from every endpoint:

```json
{ "statusCode": 422, "code": "VALIDATION_ERROR", "message": "Validation failed",
  "details": [{ "field": "title", "message": "title must not be empty" }],
  "requestId": "…", "timestamp": "…", "path": "/api/v1/tasks" }
```

Codes: `UNAUTHENTICATED`, `TOKEN_EXPIRED` (access token expired; client should refresh), `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `INVALID_TRANSITION`,
`STATE_CONFLICT`, `CONFLICT` (duplicate resource, e.g. an email already in use), `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` (503, e.g. the health check cannot reach the database). Unknown errors are logged with the request id and
returned as `INTERNAL_ERROR` without leaking internals. Malformed or oversized request bodies and unknown paths use the same shape (400/413/415 `VALIDATION_ERROR`, 404 `NOT_FOUND`), including `requestId`.

### 5.3 Endpoints

Paths below are relative to `/api/v1` (URI versioning), except `/health`, which is version-neutral at `/api/health`.

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
| `GET/POST /users`, `GET/PATCH/DELETE /users/:id` | Admin | `POST` takes `{ name, email, phone?, password, roleId }`. `PATCH` edits `name`, `email`, `phone` (null clears), `password` (also signs the user out); the role cannot change. `DELETE` is a soft delete, refused (409) for yourself, for default (seeded) accounts, and for any user with a task assigned in any status. `GET /users?roleCode=EMPLOYEE` feeds assignee and filter dropdowns |
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

A (from, to) pair with no rule → `INVALID_TRANSITION` (422). A pair that has a rule but is attempted by the wrong actor → `FORBIDDEN` (403). A missing required note → `VALIDATION_ERROR` (422, field `note`). Every task response carries `allowedTransitions` for the current viewer, so the table lives only in the backend. An Admin who is not the assignee cannot perform employee steps;
an Employee can never approve or reject.

Service flow, inside one transaction:
1. Load task with scoping (404 if the actor may not see it).
2. Check `canTransition`.
3. `UPDATE tasks SET status = :to WHERE id = :id AND status = :from AND assignee_id = :assigneeId` and require `affected === 1`; otherwise `STATE_CONFLICT` (409). This makes concurrent or double submissions, and a reassignment between the read and the write, safe.
4. Insert the `task_status_history` row.

### 5.5 Dashboard

One `GROUP BY status` query, with the same scoping as the task list so the numbers always agree with the list.
Missing statuses are filled with `0`.

### 5.6 Seed

Idempotent and non-destructive (insert-if-missing by `roles.code` and by email; existing rows are never updated). Creates the `ADMIN` and `EMPLOYEE` roles, then 2 Admins, 3 Employees (all flagged `is_default`, so they cannot be deleted), and a handful of tasks across all statuses
and priorities for a useful first view. Demo passwords are documented demo values, overridable via `SEED_ADMIN_PASSWORD` / `SEED_EMPLOYEE_PASSWORD`.

### 5.7 Authentication: access and refresh tokens

| | Access token | Refresh token |
|---|---|---|
| Format | Signed JWT (`sub`, role code, `exp`) | Opaque random 256-bit value, never a JWT |
| Lifetime | **30 minutes** | **1 year** (each rotated token is valid 1 year from its own issue) |
| Storage | httpOnly Secure SameSite cookie, sent on every API call | httpOnly Secure SameSite cookie, `Path` limited to the auth routes so it is not sent with other calls. In the DB only its SHA-256 hash is stored (the value is high-entropy, so a fast hash is correct here; bcrypt is for passwords) |
| Verified by | JWT signature, then a primary-key lookup of the user: deleted user, or token issued (`iat`) at or before `users.password_changed_at` → 401; the role is taken from the DB row | DB lookup by hash |

Flow:
1. **Login** creates a new token *family* and sets both cookies.
2. When the access token expires, a protected call returns `401 TOKEN_EXPIRED`.
3. **Refresh** looks up the presented token. It must exist, not be revoked, and not be expired. It is then revoked and replaced (`replaced_by_id`) by a new token in the same family, and a new access token is issued (rotation).
4. **Reuse detection:** if an already-rotated token is presented again, the whole family is revoked and the user must log in again, because the token was probably stolen. A **10-second grace window** after rotation accepts the previous token without revoking (it returns a new access token only and does not rotate again, because the first response already set the new refresh cookie), so two tabs refreshing at the same moment do not log the user out by mistake.
5. **Logout** revokes the family and clears both cookies. A user's expired rows, and rows revoked more than 7 days ago, are deleted on their next login (recently revoked rows are kept so reuse detection still works), so the table does not grow without bound and no scheduler is required.

Why 30 min and 1 year is acceptable: a stolen access token is only useful for 30 minutes, and the long-lived refresh token is rotated on every use, revocable in the DB, hashed at rest, and unreachable from JavaScript. The 1-year lifetime is the requested "stay signed in" behavior and is called out in the README as a deliberate trade-off.

Env var names: `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL` (default `30m`), `REFRESH_TOKEN_TTL_DAYS` (default `365`), `COOKIE_SECURE`.

### 5.8 Separate hosts: cookies, CORS and environments

FE (Vercel), BE (Render) and DB (Aiven) run on three different hosts. `*.vercel.app` and `*.onrender.com` are
different *sites* (both are public suffixes), so a browser calling the API directly would treat the auth cookies as
third-party: Safari always blocks them and Chrome incognito blocks them by default, which is exactly the mode we
ask reviewers to use for the second role. **Decision:** the browser talks only to the Next.js origin. Next
`rewrites` proxy `/api/:path*` to `${BACKEND_URL}/api/:path*` on the server, so cookies are host-only and first-party.
The backend sets the global prefix `/api`, so paths (and cookie `Path` values) are identical on both sides.
CORS is still configured strictly (below) for local split-port development, Swagger and any direct client.

**Cookie attributes** (built in one `cookie.options.ts` helper from config; no inline cookie options anywhere):

| Attribute | Local | Deployed |
|---|---|---|
| HttpOnly | true | true |
| Secure | false (`COOKIE_SECURE=false`) | true |
| SameSite | Lax | Lax |
| Path | access: `/api`; refresh: `/api/v1/auth` | same |
| Domain | unset (host-only) | unset |
| Max-Age | both 1 year. The access JWT itself expires after 30 min; its cookie outlives it so the API can answer `TOKEN_EXPIRED` instead of the browser silently dropping the cookie | same |

If someone deploys without the proxy, `COOKIE_SAMESITE=none` (requires `Secure`) plus the CORS settings below make
direct cross-origin calls work, but this mode is documented as unsupported for Safari and incognito.

**CORS and request-origin policy:**
- `FRONTEND_ORIGINS` is an exact-match allowlist (comma separated). No wildcard, no regex. `credentials: true`, explicit methods and headers, `maxAge` 600 s. Vercel preview URLs are not allowed unless added on purpose.
- A guard rejects state-changing requests (`POST/PATCH/PUT/DELETE`) whose `Origin` header is present but not in the allowlist (`403 FORBIDDEN`). This is a cheap CSRF defense on top of `SameSite=Lax`. Requests without `Origin` (curl, server-to-server) are allowed because they carry no browser cookies.
- The app refuses to boot in production if `COOKIE_SECURE` is not `true`, `FRONTEND_ORIGINS` contains an `http://` or wildcard entry, `JWT_ACCESS_SECRET` is the example placeholder or obviously weak, `TRUST_PROXY_HOPS` is below 1, or `DB_SSL=true` without `DB_SSL_CA`. `ACCESS_TOKEN_TTL` must match `<n>s|m|h|d` in every environment.
- Swagger (`/api/docs`) is mounted outside production, and in production only when `ENABLE_SWAGGER=true`.

**Proxy awareness:** `trust proxy` is set from `TRUST_PROXY_HOPS` so Express sees the original protocol and client IP. Because requests reach Render through Vercel, the socket IP is Vercel's, so IP-only throttling would be shared across all users. The login throttle is keyed by **normalized email + IP**, and authenticated routes by **user id**; plain IP is only the fallback.

**Environment variables (names only):**

| Where | Variables |
|---|---|
| Backend | `NODE_ENV`, `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `DB_SSL_CA`, `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `FRONTEND_ORIGINS`, `TRUST_PROXY_HOPS`, `THROTTLING_ENABLED` (default `true`), `ENABLE_SWAGGER` (optional), `SEED_ADMIN_PASSWORD`, `SEED_EMPLOYEE_PASSWORD` (optional, seed only) |
| Frontend | `BACKEND_URL` (server-only, read by `rewrites`). There is no `NEXT_PUBLIC_` API URL; the browser uses the relative path `/api` |

| | Local | Deployed |
|---|---|---|
| FE | `http://localhost:3000` | `https://<app>.vercel.app` |
| BE | `http://localhost:4000` | `https://<api>.onrender.com` |
| DB | local MySQL, `DB_SSL=false` | Aiven MySQL over TLS, `DB_SSL=true` with `DB_SSL_CA` |
| `BACKEND_URL` | `http://localhost:4000` | the Render URL |
| `FRONTEND_ORIGINS` | `http://localhost:3000` | the Vercel URL |
| `COOKIE_SECURE` | `false` | `true` |

Migrations run on every backend deploy (`migration:run` before `node dist/main`); the seed is run once, manually.
The database must accept connections from Render (check Aiven's IP allow-list, since Render free has no fixed
outbound IP). `/api/health` is Render's health check and the keep-alive ping target.

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
    useAppDispatch, useAppSelector, useAuth, useDebouncedValue,
    useTaskFilters, useApiAction, useConfirm
    (no usePermissions: the backend returns `allowedTransitions` per task. No useServerWakeup: the session bootstrap
    request wakes a sleeping backend and the API layer shows the waking banner.)
  components/
    ui/ (shadcn)  layout/  tasks/  dashboard/  common/
```

`rewrites` proxies `/api/*` to the backend so the auth cookie is first-party.

### 6.2 API layer (RTK Query)

- `baseApi`: `fetchBaseQuery({ baseUrl: '/api', credentials: 'include' })`, wrapped with a **re-auth layer**: on `401 TOKEN_EXPIRED` or `401 UNAUTHENTICATED` (outside the auth endpoints) it calls `POST /auth/refresh` once and retries the original request. Concurrent 401s share a **single in-flight refresh** (a mutex, so N parallel calls trigger one refresh, which also avoids tripping reuse detection). If refresh fails, clear auth state and the cache, show an info toast, and redirect to login. Any other 401 (outside login) takes the same logout path; on network error / 502 / 503 / 504 set `serverWaking` and retry with backoff (3 attempts).
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

- All four statuses are listed; only allowed next statuses are selectable (from the `allowedTransitions` array the backend returns on every task for the current viewer). Others are disabled with a tooltip stating why. If nothing is selectable the dropdown is disabled.
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

bcrypt hashing; short-lived access JWT (re-checked against the user row on every request) plus rotating, hashed, revocable refresh token with reuse detection, both in httpOnly Secure SameSite cookies; authentication middleware on every route except an explicit exclusion list;
role and ownership checks in services; 404 for unauthorized task access; DTO whitelist and forbid unknown
fields; ORM-bound parameters only; helmet; strict env validation; rate limiting; no secrets in the repo;
strict CORS allowlist plus an `Origin` check on state-changing requests, with the browser reaching the API same-origin through the Next proxy (section 5.8).

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
- Verify that Vercel's external `rewrites` pass `Set-Cookie` through unchanged and tolerate a Render cold start (up to about a minute) without a gateway timeout. If the first request after idle times out, the client retry in 6.2 and the keep-alive ping cover it; confirm on the real deployment.
- Verify the Aiven IP allow-list accepts Render's outbound traffic.
- Final demo credentials are chosen at seed time and listed in the README.

## Revision notes

Post-implementation decisions (2026-10-12), reflected in the sections above:

- **Layout:** feature modules under `src/modules/<name>/{controllers,services,dto,entities}`; shared code in `src/security` and `src/common`; entities loaded by glob.
- **Auth as middleware:** the Origin check and JWT authentication are Nest middleware with an exclusion list in `AppModule`, replacing the planned global `JwtAuthGuard` and `@Public()`. The request id is assigned by Express middleware mounted first, so body-parser errors and unknown paths also carry it. No logging interceptor.
- **Versioning:** URI versioning; business routes under `/api/v1`, `/api/health` version-neutral, refresh cookie `Path=/api/v1/auth`.
- **Tests:** the backend e2e suite (supertest + MySQL test DB, sections 3 and 8) was removed by the owner; the backend has unit tests only, and the `mysql_test` compose service and `.env.test*` files are gone.
- **Token revocation:** access tokens are no longer trusted on signature alone (5.7): deletion, a password change (`users.password_changed_at`) or a role change take effect on the next request.
- **Hardening:** task transitions also compare-and-set the assignee; user deletion checks for live tasks and soft-deletes in one transaction under a row lock; production boot checks and opt-in Swagger in production (5.8); new error code `SERVICE_UNAVAILABLE` (5.2).
