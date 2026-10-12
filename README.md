# Task & Approval Management

A small full-stack app where an **Admin** creates and assigns tasks, **Employees** work them through a status workflow, and the Admin **approves or rejects** the result. Built as a working-app assessment (Next.js + NestJS + MySQL).

| | |
|---|---|
| **Live app (frontend, Vercel)** | https://task-approval-app-gilt.vercel.app |
| **Live API (backend, Render)** | https://task-approval-app.onrender.com (health check: https://task-approval-app.onrender.com/api/health) |
| **Database** | hosted MySQL on Aiven (TLS), shared by the live API |
| **API docs (Swagger)** | locally: http://localhost:4000/api/docs (off in production unless `ENABLE_SWAGGER=true`) |
| **Source (public)** | https://github.com/mohit77u/task-approval-app |

To try the live app, open the frontend URL and sign in with one of the [demo accounts](#demo-accounts).

> **Heads up: slow first request on the free tier.** The live API runs on Render's **free** plan and the database on a free hosted MySQL (Aiven). Render shows this notice for free services: *"Your free instance will spin down with inactivity, which can delay requests by 50 seconds or more."* So after a quiet period (about 15 minutes with no traffic), or after Render restarts or redeploys the service, the **first request can take 50 seconds to about a minute**. This is normal for free hosting and not a bug. What you will see:
>
> - the UI shows a **"waking up the server"** banner, retries by itself and then continues; or the screen says *"Cannot verify your session"*: wait a few seconds and press **Retry**;
> - a login right after a long idle can feel stuck for up to a minute; just wait, do not click repeatedly;
> - free database plans can also be paused or restarted by the provider after inactivity; if the API health check keeps failing after a couple of minutes, the database may need to be powered on in the Aiven console.
>
> After the first request, everything is fast again. A free uptime monitor pinging `/api/health` every 5 minutes keeps the instance awake. This does not affect a local run.

## Demo accounts

Created by `npm run seed`. These are public demo credentials, not real ones. To seed a shared or hosted instance with private passwords instead, set `SEED_ADMIN_PASSWORD` and/or `SEED_EMPLOYEE_PASSWORD` before running the seed (they only apply to accounts the seed creates; existing users are never modified).

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

Hosting: Vercel (frontend), Render (backend), Aiven (MySQL). See [Deployment](#deployment) for how it is set up and [Verify the live deployment](#verify-the-live-deployment) for how to check it.

- **Why a proxy:** a frontend and backend on different hosts (for example `*.vercel.app` and `*.onrender.com`) are different *sites*, so calling the API directly would make the auth cookies third-party and Safari / incognito would drop them. With the Next.js `rewrites` proxy the browser only talks to one origin and cookies stay first-party. The backend still enforces an exact CORS allow-list and an `Origin` check on state-changing requests.
- **API shape:** URI-versioned REST. Business routes are `/api/v1/...`; `/api/health` is version-neutral (for uptime monitors); Swagger UI is at `/api/docs` outside production (in production only with `ENABLE_SWAGGER=true`). The frontend calls `/api/v1/...` and the rewrite forwards `/api/:path*` to `BACKEND_URL`.
- **Auth:** 30-minute JWT access token (cookie path `/api`) plus a 1-year opaque refresh token (cookie path `/api/v1/auth`), both `httpOnly`. Refresh tokens are stored only as SHA-256 hashes, rotated on every use, and reuse of a rotated token revokes the token family. Every authenticated request also re-reads the user (one primary-key lookup): a deleted user, or a token issued before the user's last password change, gets `401`, and the role is taken from the database, so these changes apply immediately rather than when the access token expires. The frontend refreshes transparently (one refresh at a time) and retries.
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

Prerequisites: Node.js 20+, npm, and a MySQL 8 (or MariaDB 10.x) database: a local MySQL/XAMPP install or a hosted one such as Aiven.

```bash
git clone https://github.com/mohit77u/task-approval-app.git task-approval-app && cd task-approval-app

# 0. Database: create an empty database and a user for it (the app creates the tables, not the database)
#    mysql -u root -p -e "CREATE DATABASE taskapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER 'taskapp'@'localhost' IDENTIFIED BY 'choose-a-password'; GRANT ALL ON taskapp.* TO 'taskapp'@'localhost';"

# 1. Backend
cd backend
cp .env.example .env            # set DB_USER / DB_PASSWORD to your database user and a real JWT_ACCESS_SECRET
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
| Backend | `NODE_ENV`, `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `DB_SSL_CA`, `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `FRONTEND_ORIGINS`, `TRUST_PROXY_HOPS`, `THROTTLING_ENABLED`, `ENABLE_SWAGGER` (optional), `SEED_ADMIN_PASSWORD` / `SEED_EMPLOYEE_PASSWORD` (optional, seed only) |
| Frontend | `BACKEND_URL` (server-side only; read by `next.config.ts` when the app is built or started) |

`backend/.env.example` and `frontend/.env.example` list each one. Never commit real values; `.env*` files are git-ignored except the `.example` files. The backend validates its variables at start-up (`backend/src/config/env.validation.ts`) and refuses to boot on a missing value or these insecure settings: `JWT_ACCESS_SECRET` shorter than 32 characters; `ACCESS_TOKEN_TTL` not of the form `<n>s|m|h|d` (e.g. `30m`); `COOKIE_SAMESITE=none` without `COOKIE_SECURE=true`; and when `NODE_ENV=production`: `COOKIE_SECURE` not true, any `FRONTEND_ORIGINS` entry that is not `https://` or contains a wildcard, a `JWT_ACCESS_SECRET` that is the `.env.example` placeholder or obviously not random, `TRUST_PROXY_HOPS` below 1, or `DB_SSL=true` without `DB_SSL_CA`.

**Recommended production settings:** `NODE_ENV=production`, `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax` (the proxy keeps cookies first-party), `FRONTEND_ORIGINS` = the exact https URL of the frontend, `DB_SSL=true` with the provider's CA certificate in `DB_SSL_CA`, a freshly generated `JWT_ACCESS_SECRET`, and `TRUST_PROXY_HOPS` set to the number of reverse proxies in front of the API (at least `1` behind Render, so rate limiting and client IPs see the real address). Leave `ENABLE_SWAGGER` unset to keep the API docs private. For the frontend set `BACKEND_URL` to the public API URL **before** `next build`: a production build fails without it.

### Database: initialise, migrate, seed

| Task | Command (in `backend/`) |
|---|---|
| Apply all migrations | `npm run migration:run` |
| Generate a migration from entity changes | `npm run migration:generate -- src/database/migrations/<Name>` |
| Revert the last migration | `npm run migration:revert` |
| Seed roles, demo users and sample tasks (idempotent) | `npm run seed` |
| Production equivalents (after `npm run build`) | `npm run migration:run:prod`, `npm run seed:prod` |

## Deployment

One GitHub repository (a monorepo) feeds two independent deployments. Each host builds only its own folder, so a commit that touches only `frontend/` redeploys only Vercel, and one that touches only `backend/` redeploys only Render (docs-only commits redeploy neither).

| | Frontend | Backend |
|---|---|---|
| Host | Vercel (Hobby) | Render (free web service) |
| Root directory | `frontend` | `backend` |
| Build command | default (`next build`) | `npm ci --include=dev && npm run build` |
| Start command | default | `npm run migration:run:prod && node dist/main` |
| Health check | n/a | `/api/health` |
| Auto-deploy filter | Vercel skips builds with no changes under `frontend/` | Render Build Filters, included path: `backend/**` |
| Env vars (names) | `BACKEND_URL` = the Render URL, no trailing slash and no `/api` (set it **before** the build; changing it needs a redeploy) | `NODE_ENV=production`, `NODE_VERSION`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL=true`, `DB_SSL_CA`, `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`, `FRONTEND_ORIGINS` = the exact Vercel URL (`https://...`, no trailing slash), `TRUST_PROXY_HOPS` (at least 1), `THROTTLING_ENABLED=true` |

Notes:

- `DB_SSL_CA` is the database provider's CA certificate on one line, with `\n` between the lines.
- The start command applies pending **migrations** on every boot but does **not** seed. For a brand-new empty database run the seed once (`npm run seed` from a machine with the database credentials in the environment, or `npm run seed:prod` in a Render shell). Re-running the seed is safe.
- `JWT_ACCESS_SECRET` must be a freshly generated random string, for example `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. The app refuses to boot in production with a placeholder or hand-typed secret (see [Environment variables](#environment-variables-names-only)).
- The browser only talks to the Vercel origin; Next.js `rewrites` proxy `/api/*` to Render, so the auth cookies stay first-party.

## Verify the live deployment

1. **Backend health:** open https://task-approval-app.onrender.com/api/health, expect `{"status":"ok","db":"up"}` (the first request after idle can take about a minute).
2. **Proxy:** open https://task-approval-app-gilt.vercel.app/api/health, expect the same JSON (this goes browser -> Vercel -> Render -> database).
3. **Sign in** at https://task-approval-app-gilt.vercel.app/login with a [demo account](#demo-accounts) and follow the [suggested walkthrough](#suggested-walkthrough) (use an incognito window for the second role).
4. **Automated browser check** of the whole workflow against the live site:
   ```bash
   cd frontend && npm ci && npx playwright install chromium
   E2E_BASE_URL=https://task-approval-app-gilt.vercel.app npm run e2e
   ```
   The test creates its own task and deletes it afterwards.
5. **Cookies (browser DevTools -> Application -> Cookies):** `access_token` (path `/api`) and `refresh_token` (path `/api/v1/auth`) are `HttpOnly`, `Secure`, `SameSite=Lax`, host-only on the Vercel domain.
6. **Security spot checks:** `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://task-approval-app.onrender.com/api/v1/tasks -H "Origin: https://evil.example" -H "Content-Type: application/json" -d '{}'` prints `403` (cross-origin write refused); `.../api/v1/tasks` without signing in answers `401`; `/api/docs` is not public in production.
7. **Rate limiting:** more than 5 login attempts for one email within a minute return `429` with a `Retry-After` header.

Typical problems: `Cannot verify your session` means the browser cannot reach the API (Render still waking up, a failed Render deploy, or a wrong `BACKEND_URL` on Vercel); login failing with `403` means `FRONTEND_ORIGINS` on Render is not the exact Vercel URL; the Render start failing with `Invalid environment configuration` lists the offending variable in its log.

## Tests

```bash
# Backend unit tests (state machine, transitions, user deletion, auth middleware, tokens, cookies, errors, env); no database needed
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

bcrypt password hashing; parameterized queries only (TypeORM); input validation with a whitelist (unknown fields are rejected); `httpOnly` + `Secure` (when enabled) + `SameSite` cookies; refresh-token rotation with reuse detection; helmet; strict CORS allow-list plus an `Origin` check on state-changing requests; rate limiting (100 requests/min globally; login limited to 5/min per email, refresh to 30/min per session, because the client IP is not reliable behind Vercel and Cloudflare); no secrets in the repository.

## Known limitations

- **No backend HTTP / end-to-end tests.** The backend has unit tests only. An earlier API e2e suite was deliberately removed, so authorization, the approval flow, token rotation and throttling are covered by unit tests of their parts plus the Playwright smoke test, not by HTTP-level backend tests.
- **Free-tier hosting:** Render's free instance spins down with inactivity, which can delay requests by 50 seconds or more after a quiet period, a restart or a redeploy (an uptime monitor pinging `/api/health` every 5 minutes keeps it awake). The free database has no SLA and may be paused or restarted by the provider.
- **Login rate limit is per email:** five login attempts a minute per email (counted whether they succeed or not) so anyone who knows an address can briefly block that account's logins.
- **One session per browser profile:** cookies are shared across tabs, so two roles at once need an incognito window or another browser.
- **Same-second password change:** a JWT's issue time has one-second resolution, so an access token issued in the same second as a password change is also refused; signing in again a moment later works.
- **Soft-deleted users keep their email reserved:** that email cannot be reused for a new user.
- **Long-lived refresh token:** the 1-year lifetime is a deliberate convenience trade-off, mitigated by rotation, reuse detection, hashing at rest and server-side revocation. A production system would likely use a shorter lifetime with an absolute session cap.
- **Roles are data, permissions are code:** adding a row to `roles` makes it selectable when creating a user, but what that role may do is defined in guards and the state machine. There is no dynamic permission system.
- **No request logging** beyond Nest's default start-up logs; errors carry a `requestId` but there is no access log or metrics.
- **Employee dropdown is capped at 100:** the assignee picker loads at most 100 employees. A task's comment thread is capped at 500 comments per response.
- **Neutral accent colour:** the UI uses a neutral palette with no brand colour.
- **Out of scope:** user deactivation and password reset, email notifications, file attachments, real-time updates, i18n.

## Credits and AI usage

See [`docs/AI-USAGE.md`](docs/AI-USAGE.md).
