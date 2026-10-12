# Task & Approval Management

A small full-stack app where an **Admin** creates and assigns tasks, **Employees** work them through a status workflow, and the Admin **approves or rejects** the result. Built as a working-app assessment (Next.js + NestJS + MySQL).

| | |
|---|---|
| **Live app** | _not deployed yet: the URL will be added here once the app is hosted_ |
| **API docs (Swagger)** | `<API_URL>/api/docs` (locally: http://localhost:4000/api/docs) |
| **Source** | https://github.com/mohit77u/task-approval-app |

> **Cold start (free tier hosting).** The intended deployment (Vercel + Render free + hosted MySQL) puts the API to sleep when idle. The first request after a quiet period can take up to about a minute; the UI shows a "waking up the server" banner, retries GETs by itself and then continues. This does not affect a local run.

## Demo accounts

Created by `npm run seed`. These are public demo credentials, not real ones.

| Role | Email | Password |
|---|---|---|
| Admin 1 | `admin@taskapp.dev` | `Admin@12345` |
| Admin 2 | `admin2@taskapp.dev` | `Admin@12345` |
| Employee 1 | `priya@taskapp.dev` | `Employee@12345` |
| Employee 2 | `rahul@taskapp.dev` | `Employee@12345` |
| Employee 3 | `ananya@taskapp.dev` | `Employee@12345` |

The login page has one-click buttons that fill these in. Sessions are cookie based and **shared by all tabs of a browser profile, so to use two roles at the same time, sign in as the second user in a private/incognito window or a different browser.**

### Suggested walkthrough

1. Admin: **Tasks -> New task**, assign it to Priya.
2. Priya (incognito window): open the task, use the **Status** dropdown -> *In Progress* -> confirm. Add a comment. Then *Pending Approval* -> confirm.
3. Admin: refresh the task; the dropdown now offers *Completed* (approve) and *In Progress* (reject, a reason is required).
4. Check the **History** tab, the **Dashboard** counts and the filters on the Tasks page. Priya cannot see Rahul's tasks, cannot approve, and `/users` is Admin only.

## Features

- Roles: Admin and Employee (roles are rows in a `roles` table). Admin creates users.
- Admin: create, edit, delete (soft delete) and assign tasks (title, description, priority, due date); sees all tasks.
- Employee: sees only assigned tasks, comments on them, moves them Pending -> In Progress -> Pending Approval.
- Approval: Admin approves (-> Completed) or rejects with a required reason (-> In Progress). Employees cannot approve.
- Dashboard: counts per status, scoped to what the signed-in user may see.
- Filters: status, priority and (Admin) employee; debounced search; pagination; filters live in the URL.
- Full status history and comments per task; API results are announced with a toast.

### Workflow

| From | To | Who |
|---|---|---|
| Pending | In Progress | Assigned employee |
| In Progress | Pending Approval | Assigned employee |
| Pending Approval | Completed | Admin |
| Pending Approval | In Progress (reject, reason required) | Admin |

The rules live in one pure function (`backend/src/modules/tasks/state-machine/task-state-machine.ts`). The API returns `allowedTransitions` on every task for the current viewer, so the UI renders from it and does not duplicate the rules.

## Architecture

```
Browser --HTTPS--> Next.js (App Router)
                      |  rewrites  /api/*  (server-side proxy, same origin for the browser)
                      v
                   NestJS REST API  --TLS/TCP-->  MySQL 8
```

Intended hosting: Vercel (frontend), Render (backend), a hosted MySQL such as Aiven. See [Known limitations](#known-limitations): this repository has not been deployed by this documentation's author.

- **Why a proxy:** a frontend and backend on different hosts (for example `*.vercel.app` and `*.onrender.com`) are different *sites*, so calling the API directly would make the auth cookies third-party and Safari / incognito would drop them. With the Next.js `rewrites` proxy the browser only talks to one origin and cookies stay first-party. The backend still enforces an exact CORS allow-list and an `Origin` check on state-changing requests.
- **API shape:** URI-versioned REST. Business routes are `/api/v1/...`; `/api/health` is version-neutral (for uptime monitors); Swagger UI is at `/api/docs`. The frontend calls `/api/v1/...` and the rewrite forwards `/api/:path*` to `BACKEND_URL`.
- **Auth:** 30-minute JWT access token (cookie path `/api`) plus a 1-year opaque refresh token (cookie path `/api/v1/auth`), both `httpOnly`. Refresh tokens are stored only as SHA-256 hashes, rotated on every use, and reuse of a rotated token revokes the token family. The frontend refreshes transparently (one refresh at a time) and retries.
- **Authorization:** enforced in the backend. JWT authentication and the Origin check are Nest **middleware** (login, refresh, logout and health are excluded from JWT auth); `RolesGuard` and the rate limiter are global guards; reads of tasks go through `TasksService.createScopedQuery`, so employees can only read their own tasks. Other people's task ids answer `404`.
- **Data:** MySQL via TypeORM entities and a migration (`synchronize: false`). Tables: `roles`, `users`, `tasks`, `task_comments`, `task_status_history`, `refresh_tokens`.
- **Errors:** every failure uses one shape `{ statusCode, code, message, details?, requestId, timestamp, path }`; the frontend normalises it into one `ApiError` and shows a toast.
- **Frontend state:** Redux Toolkit + RTK Query. One `baseQuery` handles re-auth, retry of GETs against a sleeping server and error normalisation; one middleware turns mutation successes and API errors into toasts.

```
backend/   NestJS API (feature modules under src/modules; shared infra in src/security and src/common)
frontend/  Next.js app (App Router, RTK Query, shadcn/ui)
docs/      design spec, implementation plans, AI-usage note
```

See [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md) for per-package details.

## Run it locally

Prerequisites: Node.js 20+, npm, and a MySQL 8 database (local MySQL/XAMPP, a hosted one, or the Docker container below).

```bash
git clone https://github.com/mohit77u/task-approval-app.git task-approval-app && cd task-approval-app

# 0. Database (skip if you already have a MySQL 8 you can use)
docker compose up -d mysql      # creates database `taskapp`, user `taskapp` (see docker-compose.yml)

# 1. Backend
cd backend
cp .env.example .env            # defaults match the Docker container; set a real JWT_ACCESS_SECRET
npm ci
npm run migration:run           # create the schema
npm run seed                    # roles, 5 demo users, sample tasks (safe to re-run)
npm run start:dev               # http://localhost:4000  (Swagger: /api/docs)

# 2. Frontend (new terminal, from the repo root)
cd frontend
cp .env.example .env.local      # BACKEND_URL=http://localhost:4000
npm ci
npm run dev                     # http://localhost:3000
```

If you use your own MySQL instead of the container, create an empty database first and put its credentials in `backend/.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`). The backend does not create the database itself, only the tables.

### Environment variables (names only)

| Where | Variables |
|---|---|
| Backend | `NODE_ENV`, `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `DB_SSL_CA`, `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `FRONTEND_ORIGINS`, `TRUST_PROXY_HOPS`, `THROTTLING_ENABLED` |
| Frontend | `BACKEND_URL` (server-side only; read by `next.config.ts` when the app is built or started) |

`backend/.env.example` and `frontend/.env.example` list each one. Never commit real values; `.env*` files are git-ignored except the `.example` files. The backend validates its variables at start-up (`backend/src/config/env.validation.ts`) and refuses to boot on a missing value or these insecure settings: `JWT_ACCESS_SECRET` shorter than 32 characters; `COOKIE_SAMESITE=none` without `COOKIE_SECURE=true`; and when `NODE_ENV=production`, `COOKIE_SECURE` not true or any `FRONTEND_ORIGINS` entry that is not `https://` or contains a wildcard.

**Recommended production settings** (not all are enforced by the validator): `NODE_ENV=production`, `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax` (the proxy keeps cookies first-party), `FRONTEND_ORIGINS` = the exact https URL of the frontend, `DB_SSL=true` (plus `DB_SSL_CA` if the provider needs it), a freshly generated `JWT_ACCESS_SECRET`, and `TRUST_PROXY_HOPS` set to the number of reverse proxies in front of the API (at least `1` behind Render, so rate limiting and client IPs see the real address; the validator only requires `>= 0`). For the frontend set `BACKEND_URL` to the public API URL **before** `next build`: a production build fails without it.

### Database: initialise, migrate, seed

| Task | Command (in `backend/`) |
|---|---|
| Apply all migrations | `npm run migration:run` |
| Generate a migration from entity changes | `npm run migration:generate -- src/database/migrations/<Name>` |
| Revert the last migration | `npm run migration:revert` |
| Seed roles, demo users and sample tasks (idempotent) | `npm run seed` |
| Production equivalents (after `npm run build`) | `npm run migration:run:prod`, `npm run seed:prod` |

## Tests

```bash
# Backend unit tests (state machine, validation, tokens, cookies, origin middleware, env); no database needed
cd backend && npm test

# Frontend unit tests (API layer re-auth/retry, error normalisation, filters, hooks, status control)
cd frontend && npm test

# Browser smoke test of the whole workflow. Needs the backend and the frontend running
# (and a seeded database). Works against a deployed URL too.
cd frontend && npx playwright install chromium
E2E_BASE_URL=http://localhost:3000 npm run e2e
```

Static checks: `cd backend && npm run build` and `npm run lint` (note: `lint` runs ESLint with `--fix`); `cd frontend && npm run lint && npm run typecheck`. On a fresh clone run `npm run dev` or `npm run build` once in `frontend/` before `typecheck`: it relies on route types (`LayoutProps`) that Next.js generates into `.next/`.

## Security notes

bcrypt password hashing; parameterized queries only (TypeORM); input validation with a whitelist (unknown fields are rejected); `httpOnly` + `Secure` (when enabled) + `SameSite` cookies; refresh-token rotation with reuse detection; helmet; strict CORS allow-list plus an `Origin` check on state-changing requests; rate limiting (100 requests/min globally, login limited to 5/min); no secrets in the repository.

## Known limitations

- **No backend HTTP / end-to-end tests.** The backend has unit tests only. An earlier API e2e suite was deliberately removed, so authorization, the approval flow, token rotation and throttling are covered by unit tests of their parts plus the Playwright smoke test, not by HTTP-level backend tests. `backend/.env.test*` and the `mysql_test` service in `docker-compose.yml` are leftovers from that suite and are not used by any current script.
- **Not deployed by this repo's docs.** The Vercel / Render / hosted MySQL setup is the intended target; no live URL is claimed here. Free-tier cold starts (up to about a minute) apply when hosted that way; an uptime monitor pinging `/api/health` can reduce them.
- **One session per browser profile:** cookies are shared across tabs, so two roles at once need an incognito window or another browser.
- **Access token outlives account changes:** the access JWT is stateless and stays valid for up to 30 minutes after a user is deleted or changes password (refresh tokens are revoked, access tokens are not).
- **Swagger is public**, including in production (`/api/docs`); it documents the API but needs a session cookie to call protected routes.
- **Soft-deleted users keep their email reserved:** that email cannot be reused for a new user.
- **Long-lived refresh token:** the 1-year lifetime is a deliberate convenience trade-off, mitigated by rotation, reuse detection, hashing at rest and server-side revocation. A production system would likely use a shorter lifetime with an absolute session cap.
- **Roles are data, permissions are code:** adding a row to `roles` makes it selectable when creating a user, but what that role may do is defined in guards and the state machine. There is no dynamic permission system.
- **No request logging** beyond Nest's default start-up logs; errors carry a `requestId` but there is no access log or metrics.
- **Employee dropdown is capped at 100:** the assignee picker loads at most 100 employees. A task's comment thread is capped at 500 comments per response.
- **Neutral accent colour:** the UI uses a neutral palette with no brand colour.
- **Out of scope:** user deactivation and password reset, email notifications, file attachments, real-time updates, i18n.

## Credits and AI usage

See [`docs/AI-USAGE.md`](docs/AI-USAGE.md).
